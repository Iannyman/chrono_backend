import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { HikvisionIsapiService } from '../../infrastructure/devices/HikvisionIsapiService.js';
import { activeReaders as readers } from '../../config/readers.js';
import {
  createPersonSchema,
  searchPersonsSchema,
  modifyPersonSchema,
  deletePersonSchema,
  personDetailsSchema,
  createPersonWithCardSchema,
} from '../validators/person.schema.js';

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
      results[name] = { error: err instanceof Error ? err.message : String(err) } as T;
    }
  }
  return results;
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
    const { readerName, employeeNo, name, cardNo, userType, cardType, valid, doorRight, rightPlan } = req.body;

    const results = await fanOut(readerName, async (isapi) => {
      const person = await isapi.createPerson({
        UserInfo: {
          employeeNo,
          name,
          userType,
          ...(valid && { Valid: valid }),
          ...(doorRight && { doorRight }),
          ...(rightPlan && { RightPlan: rightPlan }),
        },
      });
      const card = await isapi.createCard({
        CardInfo: { employeeNo, cardNo, cardType },
      });
      return { person, card };
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
