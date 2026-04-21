import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { eventBuffer } from '../../infrastructure/buffer/EventBuffer.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// GET /buffer/stats - Get buffer statistics
router.get('/stats', (_req, res) => {
  const stats = eventBuffer.getStats();

  res.json({
    stats: {
      bufferSize: stats.bufferSize,
      maxMemoryItems: stats.maxMemoryItems,
      isFlushing: stats.isFlushing,
      isPaused: stats.isPaused,
      oldestEventAge: stats.oldestEventAge,
      oldestEventAgeSeconds: Math.floor(stats.oldestEventAge / 1000),
      capacityPercent: Math.round((stats.bufferSize / stats.maxMemoryItems) * 100),
    },
  });
});

// POST /buffer/flush - Manually trigger flush to SQL
router.post('/flush', (_req, res) => {
  const stats = eventBuffer.getStats();

  res.json({
    message: 'Flush triggered',
    bufferSize: stats.bufferSize,
    note: 'SQL not implemented yet, events are logged instead',
  });
});

// POST /buffer/clear - Clear all buffered events (use with caution)
router.post('/clear', (_req, res) => {
  eventBuffer.clear();

  res.json({
    message: 'Buffer cleared',
    bufferSize: 0,
  });
});

// POST /buffer/pause - Pause accepting new events
router.post('/pause', (_req, res) => {
  eventBuffer.pause();

  res.json({
    message: 'Buffer paused',
    isPaused: true,
  });
});

// POST /buffer/resume - Resume accepting events
router.post('/resume', (_req, res) => {
  eventBuffer.resume();

  res.json({
    message: 'Buffer resumed',
    isPaused: false,
  });
});

export default router;
