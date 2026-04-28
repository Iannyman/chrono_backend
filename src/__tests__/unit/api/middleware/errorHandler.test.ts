import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../config/index.js', () => ({
  config: {
    server: { port: 3000, nodeEnv: 'test' },
    logging: { level: 'info', prettyPrint: false },
  },
}));

import { HttpError, errorHandler, notFoundHandler, asyncHandler } from '../../../../api/middleware/errorHandler.js';
import { ZodError, z } from 'zod';

function createMockReq(url = '/test', method = 'GET', ip = '127.0.0.1') {
  return { url, method, ip } as any;
}

function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockNext() {
  return vi.fn();
}

describe('Error Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HttpError class', () => {
    it('should set name, statusCode, and isOperational correctly', () => {
      const err = new HttpError('Not found', 404);

      expect(err.name).toBe('HttpError');
      expect(err.statusCode).toBe(404);
      expect(err.isOperational).toBe(true);
      expect(err.message).toBe('Not found');
    });

    it('should default to 500 statusCode and isOperational true', () => {
      const err = new HttpError('Server error');

      expect(err.statusCode).toBe(500);
      expect(err.isOperational).toBe(true);
    });
  });

  describe('errorHandler', () => {
    it('should return 400 with details for ZodError', () => {
      let zodErr: ZodError;
      try {
        z.object({ name: z.string() }).parse({ name: 123 });
      } catch (e) {
        zodErr = e as ZodError;
      }

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      errorHandler(zodErr!, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          details: expect.any(Array),
        })
      );
    });

    it('should return correct statusCode for HttpError', () => {
      const err = new HttpError('Forbidden', 403);
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Forbidden' })
      );
    });

    it('should return 500 for generic Error', () => {
      const err = new Error('Something broke');
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Something broke' })
      );
    });

    it('should include stack trace in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const err = new Error('Dev error');
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      errorHandler(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ stack: expect.any(String) })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should omit stack trace in non-development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const err = new Error('Prod error');
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      errorHandler(err, req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response).not.toHaveProperty('stack');

      process.env.NODE_ENV = originalEnv;
    });

    it('should log error with request context', () => {
      const err = new Error('Logged error');
      const req = createMockReq('/api/test', 'POST', '10.0.0.1');
      const res = createMockRes();
      const next = createMockNext();

      errorHandler(err, req, res, next);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Logged error',
          url: '/api/test',
          method: 'POST',
          ip: '10.0.0.1',
        }),
        'Request error'
      );
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with route info', () => {
      const req = createMockReq('/unknown', 'GET');
      const res = createMockRes();

      notFoundHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Route GET /unknown not found',
      });
    });
  });

  describe('asyncHandler', () => {
    it('should resolve successful handler', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      const wrapped = asyncHandler(handler);
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      wrapped(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('should catch rejected promise and call next with error', async () => {
      const error = new Error('Async failed');
      const handler = vi.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(handler);
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      wrapped(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
