import { Router } from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { HikvisionIsapiService } from '../../infrastructure/devices/HikvisionIsapiService.js';
import { sqlService } from '../../infrastructure/database/SqlService.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { activeReaders as readers } from '../../config/readers.js';
import {
  createPersonSchema,
  searchPersonsSchema,
  modifyPersonSchema,
  deletePersonSchema,
  personDetailsSchema,
  createPersonWithCardSchema,
  importPersonsSchema,
  employeeEntrySchema,
  type CreatePersonWithCardInput,
  type EmployeeEntry,
} from '../validators/person.schema.js';
import type { IsapiResponse } from '../../core/domain/IsapiTypes.js';

const router = Router();

router.use(authenticate);

function resolveReaders(readerName: string): string[] {
  if (readerName === 'all') return readers.map(r => r.name);
  return [readerName];
}

async function fanOut<T>(
  readerName: string,
  fn: (isapi: HikvisionIsapiService) => Promise<T>,
): Promise<Record<string, T>> {
  const names = resolveReaders(readerName);
  const results: Record<string, T> = {};
  for (const name of names) {
    try {
      const isapi = HikvisionIsapiService.forReader(name);
      results[name] = await fn(isapi);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ reader: name, error: message }, 'Reader operation failed');
      results[name] = { error: message } as T;
    }
  }
  return results;
}

/**
 * Run an async mapper over `items` with at most `concurrency` in flight at once.
 * Results are returned in input order. A dependency-free alternative to p-limit
 * for bounding load on the devices during bulk imports.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

type PersonWithCardParams = Omit<CreatePersonWithCardInput, 'readerName'>;
type PersonWithCardResult = { person: IsapiResponse; card: IsapiResponse };

/**
 * Create a person and their card on a single device.
 * Extracted from /with-card so the same logic is reused by /import-persons.
 */
async function createPersonWithCard(
  isapi: HikvisionIsapiService,
  params: PersonWithCardParams,
): Promise<PersonWithCardResult> {
  const person = await isapi.createPerson({
    UserInfo: {
      employeeNo: params.employeeNo,
      name: params.name,
      userType: params.userType,
      ...(params.valid && { Valid: params.valid }),
      ...(params.doorRight && { doorRight: params.doorRight }),
      ...(params.rightPlan && { RightPlan: params.rightPlan }),
    },
  });
  const card = await isapi.createCard({
    CardInfo: {
      employeeNo: params.employeeNo,
      cardNo: params.cardNo,
      cardType: params.cardType,
    },
  });
  return { person, card };
}

/**
 * Read and validate the employee.json file. `filePath` is resolved relative
 * to the current working directory unless it is already absolute.
 */
async function readEmployees(filePath: string): Promise<EmployeeEntry[]> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const content = await readFile(absolutePath, 'utf-8');
  const parsed: unknown = JSON.parse(content);
  return employeeEntrySchema.array().parse(parsed);
}

// POST /persons - Create a person on Hikvision device(s)
router.post('/',
  rateLimiter,
  validateBody(createPersonSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNo, name, userType, valid, doorRight, rightPlan } = req.body;

    const results = await fanOut(readerName, (isapi) =>
      isapi.createPerson({
        UserInfo: {
          employeeNo,
          name,
          userType,
          ...(valid && { Valid: valid }),
          ...(doorRight && { doorRight }),
          ...(rightPlan && { RightPlan: rightPlan }),
        },
      }),
    );

    res.status(201).json({ data: results });
  })
);

// POST /persons/search - Search persons on a device
router.post('/search',
  rateLimiter,
  validateBody(searchPersonsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNoList, maxResults, searchResultPosition } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.searchPersons({
      UserInfoSearchCond: {
        searchID: `search-${Date.now()}`,
        searchResultPosition,
        maxResults,
        EmployeeNoList: employeeNoList
          ? employeeNoList.map((no: string) => ({ employeeNo: no }))
          : [],
      },
    });

    res.json({ data: result });
  })
);

// PUT /persons - Modify a person on Hikvision device(s)
router.put('/',
  rateLimiter,
  validateBody(modifyPersonSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNo, name, userType, valid, doorRight, rightPlan } = req.body;

    const results = await fanOut(readerName, (isapi) =>
      isapi.modifyPerson({
        UserInfo: {
          employeeNo,
          ...(name && { name }),
          ...(userType && { userType }),
          ...(valid && { Valid: valid }),
          ...(doorRight && { doorRight }),
          ...(rightPlan && { RightPlan: rightPlan }),
        },
      }),
    );

    res.json({ data: results });
  })
);

// POST /persons/with-card - Create person + card on Hikvision device(s)
router.post('/with-card',
  rateLimiter,
  validateBody(createPersonWithCardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, ...params } = req.body;

    const results = await fanOut(readerName, (isapi) =>
      createPersonWithCard(isapi, params),
    );

    res.status(201).json({ data: results });
  })
);

// POST /persons/import-persons - Import persons + cards from an employee.json file
router.post('/import-persons',
  rateLimiter,
  validateBody(importPersonsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, filePath, concurrency: explicitConcurrency } = req.body;

    const employees = await readEmployees(filePath);

    // Process strictly one employee at a time so a reader never sees concurrent
    // digest-auth handshakes (which invalidate each other's nonces and trip the
    // device's account lockout). Callers may still override via the request body.
    const concurrency = explicitConcurrency ?? 1;

    const results = await mapWithConcurrency(employees, concurrency, async (emp) => {
      // SQL is the canonical record: persist first, then push to the devices.
      // Payload mirrors the VB.NET InsertScannedWorker contract:
      // Marca -> person_id, Prenume -> first_name, Nume -> last_name, CodCartela -> card_no.
      let sql: { success: boolean; alreadyExists: boolean; message?: string };
      try {
        sql = await sqlService.insertScannedWorker({
          person_id: emp.Marca,
          first_name: emp.Prenume,
          last_name: emp.Nume,
          card_no: emp.CodCartela,
        });
      } catch (error) {
        sql = {
          success: false,
          alreadyExists: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }

      // Skip the device push only on a genuine SQL failure (connection / execute
      // error), so a person never lands on hardware without a canonical record.
      // "Already exists" is NOT a failure — the record is already in SQL — so we
      // still push to the device. Remove this block to push unconditionally.
      if (!sql.success) {
        logger.warn({ employeeNo: emp.Marca, sql }, 'Skipping device push: SQL insert failed');
        return { employeeNo: emp.Marca, sql, device: undefined };
      }

      if (sql.alreadyExists) {
        logger.info({ employeeNo: emp.Marca }, 'Person already in SQL — pushing to device');
      }

      // Marca -> employeeNo, Nume + Prenume -> name, CodCartela -> cardNo.
      // Remaining UserInfo/CardInfo fields keep their validator defaults.
      const params = createPersonWithCardSchema.parse({
        readerName,
        employeeNo: emp.Marca,
        name: `${emp.Nume} ${emp.Prenume}`,
        cardNo: emp.CodCartela,
      });
      const device = await fanOut(readerName, (isapi) =>
        createPersonWithCard(isapi, params),
      );
      return { employeeNo: params.employeeNo, sql, device };
    });

    res.status(201).json({ data: results });
  })
);

// POST /persons/details - Get person + card data combined
router.post('/details',
  rateLimiter,
  validateBody(personDetailsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNoList } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const empList = employeeNoList.map((no: string) => ({ employeeNo: no }));

    const persons = await isapi.searchPersons({
      UserInfoSearchCond: {
        searchID: `search-${Date.now()}`,
        searchResultPosition: 0,
        maxResults: 100,
        EmployeeNoList: empList,
      },
    });

    const cards = await isapi.searchCards({
      CardInfoSearchCond: {
        searchID: `search-${Date.now()}`,
        searchResultPosition: 0,
        maxResults: 100,
        EmployeeNoList: empList,
      },
    });

    res.json({ data: { persons, cards } });
  })
);


// PUT /persons/delete - Delete person(s) on Hikvision device(s)
router.put('/delete',
  rateLimiter,
  validateBody(deletePersonSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNoList } = req.body;

    const results = await fanOut(readerName, (isapi) =>
      isapi.deletePerson({
        UserInfoDelCond: {
          EmployeeNoList: employeeNoList.map((no: string) => ({ employeeNo: no })),
        },
      }),
    );

    res.json({ data: results });
  })
);

export default router;
