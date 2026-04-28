import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockConfig } from '../../../helpers/mocks.js';

const { mockJwtVerify } = vi.hoisted(() => ({
  mockJwtVerify: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: mockJwtVerify,
    sign: vi.fn(),
  },
}));

vi.mock('../../../../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { authenticate, optionalAuthenticate } from '../../../../api/middleware/auth.js';
import type { AuthenticatedRequest } from '../../../../api/middleware/auth.js';
import { HttpError } from '../../../../api/middleware/errorHandler.js';

function createMockReq(authHeader?: string): AuthenticatedRequest {
  return {
    headers: { authorization: authHeader },
  } as unknown as AuthenticatedRequest;
}

function createMockRes() {
  return {} as any;
}

function createMockNext() {
  return vi.fn();
}

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should throw 401 when Authorization header is missing', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      expect(() => authenticate(req, res, next)).toThrow(HttpError);
      expect(() => authenticate(req, res, next)).toThrow('Authentication token required');
    });

    it('should throw 401 when header does not start with Bearer', () => {
      const req = createMockReq('Basic abc123');
      const res = createMockRes();
      const next = createMockNext();

      expect(() => authenticate(req, res, next)).toThrow(HttpError);
    });

    it('should throw 401 when token is invalid/expired', () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const req = createMockReq('Bearer invalid-token');
      const res = createMockRes();
      const next = createMockNext();

      expect(() => authenticate(req, res, next)).toThrow('Invalid or expired authentication token');
    });

    it('should set req.user and call next() for valid token', () => {
      const decoded = { username: 'admin', iat: 123, exp: 456 };
      mockJwtVerify.mockReturnValue(decoded);

      const req = createMockReq('Bearer valid-token');
      const res = createMockRes();
      const next = createMockNext();

      authenticate(req, res, next);

      expect(req.user).toEqual(decoded);
      expect(next).toHaveBeenCalled();
    });

    it('should pass only the token portion to jwt.verify', () => {
      mockJwtVerify.mockReturnValue({ username: 'admin', iat: 1, exp: 2 });

      const req = createMockReq('Bearer my-token-here');
      const res = createMockRes();
      const next = createMockNext();

      authenticate(req, res, next);

      expect(mockJwtVerify).toHaveBeenCalledWith('my-token-here', mockConfig.security.jwtSecret);
    });
  });

  describe('optionalAuthenticate', () => {
    it('should set user when valid Bearer token is present', () => {
      const decoded = { username: 'admin', iat: 123, exp: 456 };
      mockJwtVerify.mockReturnValue(decoded);

      const req = createMockReq('Bearer valid-token');
      const res = createMockRes();
      const next = createMockNext();

      optionalAuthenticate(req, res, next);

      expect(req.user).toEqual(decoded);
      expect(next).toHaveBeenCalled();
    });

    it('should call next() with no Authorization header', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      optionalAuthenticate(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should call next() with invalid token (silently ignores)', () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('expired');
      });

      const req = createMockReq('Bearer expired-token');
      const res = createMockRes();
      const next = createMockNext();

      optionalAuthenticate(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should call next() with non-Bearer scheme', () => {
      const req = createMockReq('Basic abc123');
      const res = createMockRes();
      const next = createMockNext();

      optionalAuthenticate(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
});
