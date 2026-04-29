import type { ReaderConfig } from '../core/domain/Reader.js';
import { sqlService } from '../infrastructure/database/SqlService.js';
import { logger } from '../infrastructure/logging/logger.js';

const envReaders: ReaderConfig[] = [];

// Load readers from environment variable as JSON
// Example: READERS=[{"name":"308","ip":"172.23.43.92"},{"name":"304DW","ip":"172.23.43.16"}]
if (process.env.READERS) {
  try {
    const parsed = JSON.parse(process.env.READERS) as ReaderConfig[];
    envReaders.splice(0, envReaders.length, ...parsed);
  } catch {
    throw new Error('Invalid READERS environment variable. Must be a valid JSON array.');
  }
}

/**
 * Load readers based on READERS_SOURCE env var.
 * - "sql": load from SQL stored procedure (falls back to .env on failure)
 * - "env" or unset: load from READERS env variable
 */
export async function loadReaders(): Promise<ReaderConfig[]> {
  const source = process.env.READERS_SOURCE?.toLowerCase();

  if (source === 'sql') {
    try {
      const readers = await sqlService.getReaders();
      logger.info({ source: 'sql', count: readers.length }, 'Readers loaded from SQL Server');
      return readers;
    } catch (error) {
      logger.warn({
        source: 'env',
        count: envReaders.length,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to load readers from SQL, falling back to .env configuration');
      return envReaders;
    }
  }

  logger.info({ source: 'env', count: envReaders.length }, 'Readers loaded from .env configuration');
  return envReaders;
}

export default envReaders;
