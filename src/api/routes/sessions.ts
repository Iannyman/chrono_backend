import { Router } from 'express';
import { sqlService } from '../../infrastructure/database/SqlService.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sessionsDataDetailedSchema, sessionsDataEditSchema, sessionsDataLiveSchema } from '../validators/session.schema.js';

const router = Router();

router.use(authenticate);

// POST /sessions/detailed - Get sessions data closed grouped by person/line/flat
router.post('/detailed',
  rateLimiter,
  validateBody(sessionsDataDetailedSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = [req.body];
    const result = await sqlService.getSessionsDataDetailed(payload);

    res.json(result);
  })
);

// POST /sessions/live - Get sessions data live grouped by person/line/flat
router.post('/live',
  rateLimiter,
  validateBody(sessionsDataLiveSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = [req.body];
    const result = await sqlService.getSessionsDataLive(payload);

    res.json(result);
  })
);

// POST /sessions/edit - Edit a session
router.post('/edit',
  rateLimiter,
  validateBody(sessionsDataEditSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = [req.body];
    // const result = await sqlService.editSessionData(payload);

    // res.json(result);
    res.json({
      "success": 1,
      "data": []
    })
  })
);
export default router;
