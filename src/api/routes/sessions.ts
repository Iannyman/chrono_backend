import { Router } from 'express';
import { sqlService } from '../../infrastructure/database/SqlService.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionsDataDetailedSchema } from '../validators/session.schema.js';

const router = Router();

router.use(authenticate);

// POST /sessions/detailed - Get sessions data grouped by person/line/flat
router.post('/detailed',
  rateLimiter,
  validateBody(sessionsDataDetailedSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = [req.body];
    const result = await sqlService.getSessionsDataDetailed(payload);

    res.json(result);
  })
);

export default router;
