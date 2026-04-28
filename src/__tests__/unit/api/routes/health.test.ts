import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../config/index.js', () => ({
  config: {
    server: { port: 3000, nodeEnv: 'test' },
    logging: { level: 'info', prettyPrint: false },
  },
}));

vi.mock('../../../../api/middleware/rateLimit.js', () => ({
  rateLimiter: (req: any, res: any, next: any) => next(),
  authRateLimiter: (req: any, res: any, next: any) => next(),
}));

import request from 'supertest';
import express from 'express';
import healthRoutes from '../../../../api/routes/health.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/health', healthRoutes);
  return app;
}

describe('Health Route', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('GET /health should return status ok with uptime and environment', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      environment: expect.any(String),
    });
  });

  it('GET /health should not require authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
