import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth.js';

const router = Router();

// GET /health - Health check endpoint (no auth required)
router.get('/', optionalAuthenticate, (_req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  };

  res.json(health);
});

export default router;
