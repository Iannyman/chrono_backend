import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { HikvisionIsapiService } from '../../infrastructure/devices/HikvisionIsapiService.js';
import { activeReaders as readers } from '../../config/readers.js';
import {
  createCardSchema,
  searchCardsSchema,
  modifyCardSchema,
  deleteCardSchema,
} from '../validators/card.schema.js';

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

// POST /cards - Create a card on Hikvision device(s)
router.post('/',
  rateLimiter,
  validateBody(createCardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNo, cardNo, cardType } = req.body;

    const results = await fanOut(readerName, (isapi) =>
      isapi.createCard({ CardInfo: { employeeNo, cardNo, cardType } }),
    );

    res.status(201).json({ data: results });
  })
);

// POST /cards/search - Search cards on a device
router.post('/search',
  rateLimiter,
  validateBody(searchCardsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNoList, maxResults, searchResultPosition } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.searchCards({
      CardInfoSearchCond: {
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

// PUT /cards - Replace card for a user on Hikvision device(s) (delete old + create new)
router.put('/',
  rateLimiter,
  validateBody(modifyCardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNo, cardNo, cardType } = req.body;

    const results = await fanOut(readerName, async (isapi) => {
      await isapi.deleteCard({
        CardInfoDelCond: { EmployeeNoList: [{ employeeNo }] },
      });
      return isapi.createCard({ CardInfo: { employeeNo, cardNo, cardType } });
    });

    res.json({ data: results });
  })
);

// PUT /cards/delete - Delete card(s) on Hikvision device(s)
router.put('/delete',
  rateLimiter,
  validateBody(deleteCardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNoList } = req.body;

    const results = await fanOut(readerName, (isapi) =>
      isapi.deleteCard({
        CardInfoDelCond: {
          EmployeeNoList: employeeNoList.map((no: string) => ({ employeeNo: no })),
        },
      }),
    );

    res.json({ data: results });
  })
);

export default router;
