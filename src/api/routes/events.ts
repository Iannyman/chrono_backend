import { Router } from 'express';
import { eventStore } from '../../stores/EventStore.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// GET /events - Get all events
router.get('/',
  rateLimiter,
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const events = eventStore.getAll();

    res.json({
      data: events,
      meta: {
        count: events.length,
        total: eventStore.getCount(),
      },
    });
  })
);

// GET /events/reader/:name - Get events by reader name
router.get('/reader/:name',
  rateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { name } = req.params;
    const events = eventStore.getByReader(name);

    res.json({
      data: events,
      meta: {
        count: events.length,
        reader: name,
      },
    });
  })
);

// GET /events/employee/:id - Get events by employee ID
router.get('/employee/:id',
  rateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const events = eventStore.getByEmployee(id);

    res.json({
      data: events,
      meta: {
        count: events.length,
        employeeNo: id,
      },
    });
  })
);

export default router;
