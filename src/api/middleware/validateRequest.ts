import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { HttpError } from './errorHandler.js';

/**
 * Middleware to validate request against a Zod schema
 * @param schema - Zod schema to validate against
 * @param target - Which part of request to validate ('body', 'query', 'params')
 */
export function validateRequest(
  schema: AnyZodObject,
  target: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req[target]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new HttpError(
          `Validation failed for ${target}`,
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
export function validateBody(schema: AnyZodObject) {
  return validateRequest(schema, 'body');
}

/**
 * Middleware to validate request query parameters
 */
export function validateQuery(schema: AnyZodObject) {
  return validateRequest(schema, 'query');
}

/**
 * Middleware to validate request params
 */
export function validateParams(schema: AnyZodObject) {
  return validateRequest(schema, 'params');
}
