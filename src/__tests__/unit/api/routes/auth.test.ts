import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockConfig } from '../../../helpers/mocks.js';

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../../api/middleware/rateLimit.js', () => ({
  rateLimiter: (req: any, res: any, next: any) => next(),
  authRateLimiter: (req: any, res: any, next: any) => next(),
}));

vi.mock('../../../../infrastructure/notifications/email.js', () => ({
  emailService: { send: vi.fn(), sendReaderAlert: vi.fn(), sendSystemAlert: vi.fn() },
}));

const { mockAuthenticateUser } = vi.hoisted(() => ({
  mockAuthenticateUser: vi.fn(),
}));

vi.mock('../../../../core/services/ldap.js', () => ({
  authenticateUser: (...args: any[]) => mockAuthenticateUser(...args),
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import authRoutes from '../../../../api/routes/auth.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  return app;
}

describe('Auth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('POST /auth/login', () => {
    it('should return token, expiresIn, and user on valid LDAP auth', async () => {
      mockAuthenticateUser.mockResolvedValue({
        sAMAccountName: 'admin',
        displayName: 'Admin User',
        department: 'IT',
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ username: 'admin', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.expiresIn).toBe('1h');
      expect(res.body.user.username).toBe('admin');
      expect(res.body.user.displayName).toBe('Admin User');
      expect(res.body.user.department).toBe('IT');
    });

    it('should return 401 on invalid credentials', async () => {
      mockAuthenticateUser.mockRejectedValue(new Error('Auth failed'));

      const res = await request(app)
        .post('/auth/login')
        .send({ username: 'admin', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 400 when body fails validation', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/verify', () => {
    it('should return valid:true for valid token', async () => {
      const token = jwt.sign(
        { username: 'admin', displayName: 'Admin' },
        mockConfig.security.jwtSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/auth/verify')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.user.username).toBe('admin');
      expect(res.body.expiresAt).toBeDefined();
    });

    it('should return 401 "No token provided" when missing', async () => {
      const res = await request(app).post('/auth/verify');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('should return 401 "Invalid token" for bad token', async () => {
      const res = await request(app)
        .post('/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });
  });
});
