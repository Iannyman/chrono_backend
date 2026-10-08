import { Router } from 'express';
import { readerStatusStore } from '../../stores/ReaderStatusStore.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { readersCreateSchema } from '../validators/session.schema.js';
import { sqlService } from '../../infrastructure/database/SqlService.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// GET /readers - Get all readers
router.get('/',
  rateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { online } = req.query;

    let readers;
    if (online === 'true') {
      readers = readerStatusStore.getOnline();
    } else if (online === 'false') {
      readers = readerStatusStore.getOffline();
    } else {
      readers = readerStatusStore.getAll();
    }

    res.json({
      data: readers,
      meta: {
        count: readers.length,
        online: readers.filter(r => r.isOnline).length,
        offline: readers.filter(r => !r.isOnline).length,
      },
    });
  })
);

// GET /readers/:name - Get reader by name
router.get('/:name',
  rateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { name } = req.params;
    const reader = readerStatusStore.getByName(name);

    if (!reader) {
      return res.status(404).json({ error: 'Reader not found' });
    }

    return res.json(reader);
  })
);

// POST /readers/create - Create a reader
router.post('/create',
  rateLimiter,
  validateBody(readersCreateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {

    const payload = [req.body];    
    const result = await sqlService.createReader(payload);

    res.json(result);
  })
);

export default router;
