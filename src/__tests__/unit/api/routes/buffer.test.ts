import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../config/index.js', () => ({
  config: {
    server: { port: 3000, nodeEnv: 'test' },
    device: { user: 'test', password: 'test' },
    db: { server: 'localhost', database: 'test', user: 'test', password: 'test', encrypt: false, trustServerCertificate: true, connectionTimeout: 5000, requestTimeout: 5000 },
    email: { host: '', port: 587, secure: false, from: 'test@test.com', to: [], subject: 'test' },
    security: { jwtSecret: 'test-secret', jwtExpiresIn: '1h', apiRateLimit: 100 },
    logging: { level: 'info', prettyPrint: false },
  },
}));

vi.mock('../../../../api/middleware/rateLimit.js', () => ({
  rateLimiter: (req: any, res: any, next: any) => next(),
  authRateLimiter: (req: any, res: any, next: any) => next(),
}));

vi.mock('../../../../api/middleware/auth.js', () => ({
  authenticate: (req: any, res: any, next: any) => next(),
  optionalAuthenticate: (req: any, res: any, next: any) => next(),
}));

const { mockGetStats, mockClear, mockPause, mockResume } = vi.hoisted(() => ({
  mockGetStats: vi.fn(() => ({
    bufferSize: 10,
    maxMemoryItems: 10000,
    isFlushing: false,
    isPaused: false,
    oldestEventAge: 5000,
  })),
  mockClear: vi.fn(),
  mockPause: vi.fn(),
  mockResume: vi.fn(),
}));

vi.mock('../../../../infrastructure/buffer/EventBuffer.js', () => ({
  eventBuffer: {
    getStats: mockGetStats,
    clear: mockClear,
    pause: mockPause,
    resume: mockResume,
  },
}));

vi.mock('../../../../infrastructure/notifications/email.js', () => ({
  emailService: { send: vi.fn(), sendReaderAlert: vi.fn(), sendSystemAlert: vi.fn() },
}));

import request from 'supertest';
import express from 'express';
import bufferRoutes from '../../../../api/routes/buffer.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/buffer', bufferRoutes);
  return app;
}

describe('Buffer Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStats.mockReturnValue({
      bufferSize: 10,
      maxMemoryItems: 10000,
      isFlushing: false,
      isPaused: false,
      oldestEventAge: 5000,
    });
    app = createTestApp();
  });

  it('GET /buffer/stats should return buffer stats with calculated fields', async () => {
    const res = await request(app).get('/buffer/stats');

    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      bufferSize: 10,
      maxMemoryItems: 10000,
      isFlushing: false,
      isPaused: false,
      oldestEventAge: 5000,
      oldestEventAgeSeconds: 5,
      capacityPercent: 0,
    });
  });

  it('POST /buffer/flush should return trigger confirmation', async () => {
    const res = await request(app).post('/buffer/flush');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Flush triggered');
    expect(res.body.bufferSize).toBe(10);
  });

  it('POST /buffer/clear should call clear and return bufferSize 0', async () => {
    const res = await request(app).post('/buffer/clear');

    expect(mockClear).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.bufferSize).toBe(0);
  });

  it('POST /buffer/pause should call pause and return isPaused true', async () => {
    const res = await request(app).post('/buffer/pause');

    expect(mockPause).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.isPaused).toBe(true);
  });

  it('POST /buffer/resume should call resume and return isPaused false', async () => {
    const res = await request(app).post('/buffer/resume');

    expect(mockResume).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.isPaused).toBe(false);
  });
});
