import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from './errorHandler.js';
import { config } from '../../config/index.js';

export interface JwtPayload {
  username: string;
  iat: number;
  exp: number;
}

/**
 * Extended Request interface with user property
 */
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Authentication middleware using JWT
 */
export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError('Authentication token required', 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    // Verify token
    const decoded = jwt.verify(token, config.security.jwtSecret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (_error) {
    throw new HttpError('Invalid or expired authentication token', 401);
  }
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
export function optionalAuthenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.security.jwtSecret) as JwtPayload;
      req.user = decoded;
    } catch {
      // Silently ignore invalid tokens for optional auth
    }
  }

  next();
}
