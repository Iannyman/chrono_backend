import express from 'express';
import { rateLimiter } from './api/middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import { corsMiddleware } from './api/middleware/cors.js';
import { logger } from './infrastructure/logging/logger.js';
import eventsRoutes from './api/routes/events.js';
import readersRoutes from './api/routes/readers.js';
import healthRoutes from './api/routes/health.js';
import authRoutes from './api/routes/auth.js';
import bufferRoutes from './api/routes/buffer.js';
import logsRoutes from './api/routes/logs.js';

/**
 * Create and configure Express application
 */
export function createApp(): express.Express {
  const app = express();

  // Request logging middleware
  app.use((req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info({
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration,
      }, 'HTTP request');
    });

    next();
  });

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS
  app.use(corsMiddleware);
  app.options(/.*/, corsMiddleware);
  
  // Apply rate limiting to all routes
  app.use(rateLimiter);

  // API routes
  app.use('/health', healthRoutes);
  app.use('/auth', authRoutes);
  app.use('/events', eventsRoutes);
  app.use('/readers', readersRoutes);
  app.use('/buffer', bufferRoutes);
  app.use('/logs', logsRoutes);

  // Root endpoint
  app.get('/', (_req, res) => {
    res.redirect('/health');
  });

  // Not found handler (must be after all routes)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

export const app = createApp();
