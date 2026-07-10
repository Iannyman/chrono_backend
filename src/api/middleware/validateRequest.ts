import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodError } from 'zod';
import { HttpError } from './errorHandler.js';

/**
 * Middleware to validate request against a Zod schema
 * @param schema - Zod schema to validate against
 * @param target - Which part of request to validate ('body', 'query', 'params')
 */
export function validateRequest(
  schema: ZodTypeAny,
  target: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req[target] = schema.parse(req[target]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new HttpError(
          `Validation failed for ${target}: ${details}`,
          400
        );
      }
      next(error);
    }
  };
}

/**
 * Middleware to validate request body
 */
export function validateBody(schema: ZodTypeAny) {
  return validateRequest(schema, 'body');
}

/**
 * Middleware to validate request query parameters
 */
export function validateQuery(schema: ZodTypeAny) {
  return validateRequest(schema, 'query');
}

/**
 * Middleware to validate request params
 */
export function validateParams(schema: ZodTypeAny) {
  return validateRequest(schema, 'params');
}
