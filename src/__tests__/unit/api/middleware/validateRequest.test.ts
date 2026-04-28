import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../config/index.js', () => ({
  config: { server: { port: 3000, nodeEnv: 'test' }, logging: { level: 'info', prettyPrint: false } },
}));

import { validateRequest, validateBody, validateQuery, validateParams } from '../../../../api/middleware/validateRequest.js';
import { HttpError } from '../../../../api/middleware/errorHandler.js';
import { z } from 'zod';

function createMockReq(body = {}, query = {}, params = {}) {
  return { body, query, params } as any;
}

function createMockRes() {
  return {} as any;
}

function createMockNext() {
  return vi.fn();
}

describe('validateRequest', () => {
  const schema = z.object({ name: z.string() });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call next() when body passes schema', () => {
    const middleware = validateRequest(schema, 'body');
    const req = createMockReq({ name: 'test' });
    const res = createMockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should throw HttpError 400 when body fails schema', () => {
    const middleware = validateRequest(schema, 'body');
    const req = createMockReq({ name: 123 });
    const res = createMockRes();
    const next = createMockNext();

    expect(() => middleware(req, res, next)).toThrow(HttpError);
    const err = (() => { try { middleware(req, res, next); } catch (e) { return e; } })() as HttpError;
    expect(err.statusCode).toBe(400);
  });

  it('should validate req.query when target is query', () => {
    const middleware = validateRequest(schema, 'query');
    const req = createMockReq({}, { name: 'test' });
    const res = createMockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should validate req.params when target is params', () => {
    const middleware = validateRequest(schema, 'params');
    const req = createMockReq({}, {}, { name: 'test' });
    const res = createMockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should pass non-ZodError to next()', () => {
    const badSchema = {
      parse: () => { throw new Error('Unexpected error'); },
    } as any;
    const middleware = validateRequest(badSchema, 'body');
    const req = createMockReq({ name: 'test' });
    const res = createMockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('validateBody should delegate with target=body', () => {
    const middleware = validateBody(schema);
    const req = createMockReq({ name: 'test' });
    const res = createMockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('validateQuery should delegate with target=query', () => {
    const middleware = validateQuery(schema);
    const req = createMockReq({}, { name: 'test' });
    const res = createMockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('validateParams should delegate with target=params', () => {
    const middleware = validateParams(schema);
    const req = createMockReq({}, {}, { name: 'test' });
    const res = createMockRes();
    const next = createMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
