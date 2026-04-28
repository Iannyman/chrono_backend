import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { validateBody } from '../middleware/validateRequest.js';
import { authenticateUser } from '../../core/services/ldap.js';

const router = Router();

/**
 * Schema for login request
 */
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/**
 * POST /auth/login - Authenticate and get JWT token
 */
router.post('/login',
  authRateLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Authenticate against LDAP
    let ldapUser;
    try {
      ldapUser = await authenticateUser(username, password);
    } catch {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { username: ldapUser.sAMAccountName, displayName: ldapUser.displayName },
      config.security.jwtSecret,
      { expiresIn: config.security.jwtExpiresIn } as jwt.SignOptions
    );

    return res.json({
      token,
      expiresIn: config.security.jwtExpiresIn,
      user: {
        username: ldapUser.sAMAccountName,
        displayName: ldapUser.displayName,
        department: ldapUser.department,
      },
    });
  })
);

/**
 * POST /auth/verify - Verify a JWT token
 */
router.post('/verify', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.security.jwtSecret) as { username: string; exp: number };
    return res.json({
      valid: true,
      user: { username: decoded.username },
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}));

export default router;
