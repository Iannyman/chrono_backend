import { app } from './app.js';
import { config } from './config/index.js';
import { readerMonitoringService } from './core/services/ReaderMonitoringService.js';
import { emailService } from './infrastructure/notifications/email.js';
import { eventBuffer } from './infrastructure/buffer/EventBuffer.js';
import { sqlService } from './infrastructure/database/SqlService.js';
import { logger } from './infrastructure/logging/logger.js';
import readers from './config/readers.js';
import type { RecordEvent } from './core/domain/RecordEvent.js';

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    logger.info({
      port: config.server.port,
      nodeEnv: config.server.nodeEnv,
      readers: readers.length,
    }, 'Starting Hikvision Card Reader Backend');

    // Verify email service (optional, don't fail if not configured)
    await emailService.verifyConnection();

    // Connect to SQL Server
    await sqlService.connect();

    // Start event buffer with flush callback
    await eventBuffer.start(async (events: RecordEvent[]) => {
      await sqlService.insertBatch(events);
    });

    // Start HTTP server
    const server = app.listen(config.server.port, () => {
      logger.info(
        `Express server running at http://localhost:${config.server.port}`
      );
    });

    // Start monitoring card readers
    await readerMonitoringService.startReaders(readers);

    // Log buffer stats every minute
    setInterval(() => {
      const stats = eventBuffer.getStats();
      if (stats.bufferSize > 0) {
        logger.info(stats, 'Event buffer stats');
      }
    }, 60000);

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Stop reader monitoring
      readerMonitoringService.stopAll();

      // Flush and stop event buffer
      await eventBuffer.stop();

      // Disconnect from SQL Server
      await sqlService.disconnect();

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
start().catch((error) => {
  console.error('Unhandled error during startup:', error);
  process.exit(1);
});
