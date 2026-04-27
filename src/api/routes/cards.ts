import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { HikvisionIsapiService } from '../../infrastructure/devices/HikvisionIsapiService.js';
import {
  createCardSchema,
  searchCardsSchema,
  modifyCardSchema,
  deleteCardSchema,
} from '../validators/card.schema.js';

const router = Router();

router.use(authenticate);

// POST /cards - Create a card on a device
router.post('/',
  rateLimiter,
  validateBody(createCardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNo, cardNo, cardType } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.createCard({
      CardInfo: { employeeNo, cardNo, cardType },
    });

    res.status(201).json({ data: result });
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
        searchID: crypto.randomUUID(),
        searchResultPosition,
        maxResults,
        ...(employeeNoList && {
          EmployeeNoList: employeeNoList.map((no: string) => ({ employeeNo: no })),
        }),
      },
    });

    res.json({ data: result });
  })
);

// PUT /cards - Modify a card
router.put('/',
  rateLimiter,
  validateBody(modifyCardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNo, cardNo, cardType } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.modifyCard({
      CardInfo: {
        employeeNo,
        ...(cardNo && { cardNo }),
        ...(cardType && { cardType }),
      },
    });

    res.json({ data: result });
  })
);

// PUT /cards/delete - Delete card(s)
router.put('/delete',
  rateLimiter,
  validateBody(deleteCardSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNoList } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.deleteCard({
      CardInfoDelCond: {
        EmployeeNoList: employeeNoList.map((no: string) => ({ employeeNo: no })),
      },
    });

    res.json({ data: result });
  })
);

export default router;
