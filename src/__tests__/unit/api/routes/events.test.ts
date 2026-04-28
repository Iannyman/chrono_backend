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

const mockEvents = [
  { readerName: 'Reader1', employeeNo: '7400', cardNo: '111' },
  { readerName: 'Reader2', employeeNo: '7401', cardNo: '222' },
  { readerName: 'Reader1', employeeNo: '7400', cardNo: '333' },
];

vi.mock('../../../../stores/EventStore.js', () => ({
  eventStore: {
    getAll: vi.fn(() => mockEvents),
    getByReader: vi.fn((name: string) => mockEvents.filter(e => e.readerName === name)),
    getByEmployee: vi.fn((id: string) => mockEvents.filter(e => e.employeeNo === id)),
    getCount: vi.fn(() => mockEvents.length),
  },
}));

import request from 'supertest';
import express from 'express';
import eventsRoutes from '../../../../api/routes/events.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/events', eventsRoutes);
  return app;
}

describe('Events Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('GET /events should return all events with meta', async () => {
    const res = await request(app).get('/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta.count).toBe(3);
    expect(res.body.meta.total).toBe(3);
  });

  it('GET /events/reader/:name should return filtered events', async () => {
    const res = await request(app).get('/events/reader/Reader1');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.reader).toBe('Reader1');
  });

  it('GET /events/reader/:name should return empty for unknown reader', async () => {
    const res = await request(app).get('/events/reader/Unknown');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('GET /events/employee/:id should return filtered events', async () => {
    const res = await request(app).get('/events/employee/7400');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.employeeNo).toBe('7400');
  });

  it('GET /events/employee/:id should return empty for unknown employee', async () => {
    const res = await request(app).get('/events/employee/9999');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });
});
