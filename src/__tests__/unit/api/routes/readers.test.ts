import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../config/index.js', () => ({
  config: {
    server: { port: 3000, nodeEnv: 'test' },
    security: { jwtSecret: 'test', jwtExpiresIn: '1h', apiRateLimit: 100 },
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

const mockReaders = [
  { name: 'Reader1', ip: '192.168.1.100', isOnline: true, lastEventDateTime: null, lastError: null, updatedAt: new Date() },
  { name: 'Reader2', ip: '192.168.1.101', isOnline: false, lastEventDateTime: null, lastError: 'Timeout', updatedAt: new Date() },
  { name: 'Reader3', ip: '192.168.1.102', isOnline: true, lastEventDateTime: null, lastError: null, updatedAt: new Date() },
];

vi.mock('../../../../stores/ReaderStatusStore.js', () => ({
  readerStatusStore: {
    getAll: vi.fn(() => mockReaders),
    getOnline: vi.fn(() => mockReaders.filter(r => r.isOnline)),
    getOffline: vi.fn(() => mockReaders.filter(r => !r.isOnline)),
    getByName: vi.fn((name: string) => mockReaders.find(r => r.name === name)),
  },
}));

import request from 'supertest';
import express from 'express';
import readersRoutes from '../../../../api/routes/readers.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/readers', readersRoutes);
  return app;
}

describe('Readers Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('GET /readers should return all readers with online/offline counts', async () => {
    const res = await request(app).get('/readers');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta.online).toBe(2);
    expect(res.body.meta.offline).toBe(1);
  });

  it('GET /readers?online=true should return only online readers', async () => {
    const res = await request(app).get('/readers?online=true');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((r: any) => r.isOnline)).toBe(true);
  });

  it('GET /readers?online=false should return only offline readers', async () => {
    const res = await request(app).get('/readers?online=false');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Reader2');
  });

  it('GET /readers/:name should return single reader', async () => {
    const res = await request(app).get('/readers/Reader1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Reader1');
  });

  it('GET /readers/:name should return 404 for unknown reader', async () => {
    const res = await request(app).get('/readers/Unknown');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Reader not found');
  });
});
