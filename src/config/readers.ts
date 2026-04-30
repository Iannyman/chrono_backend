import type { ReaderConfig } from '../core/domain/Reader.js';
import { sqlService } from '../infrastructure/database/SqlService.js';
import { logger } from '../infrastructure/logging/logger.js';

const envReaders: ReaderConfig[] = [];
const source = process.env.READERS_SOURCE?.toLowerCase();

// Only parse .env READERS when not using SQL as the source
if (source !== 'sql' && process.env.READERS) {
  try {
    const parsed = JSON.parse(process.env.READERS) as ReaderConfig[];
    envReaders.splice(0, envReaders.length, ...parsed);
  } catch {
    throw new Error('Invalid READERS environment variable. Must be a valid JSON array.');
  }
}

// Shared mutable reference — updated by loadReaders(), consumed by route handlers and ISAPI service
export let activeReaders: ReaderConfig[] = envReaders;

/**
 * Load readers based on READERS_SOURCE env var.
 * - "sql": load from SQL stored procedure (falls back to .env on failure)
 * - "env" or unset: load from READERS env variable
 */
export async function loadReaders(): Promise<ReaderConfig[]> {
  if (source === 'sql') {
    try {
      const readers = await sqlService.getReaders();
      activeReaders = readers;
      logger.info({ source: 'sql', count: readers.length }, 'Readers loaded from SQL Server');
      return readers;
    } catch (error) {
      activeReaders = envReaders;
      logger.warn({
        source: 'env',
        count: envReaders.length,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to load readers from SQL, falling back to .env configuration');
      return envReaders;
    }
  }

  activeReaders = envReaders;
  logger.info({ source: 'env', count: envReaders.length, readers:envReaders }, 'Readers loaded from .env configuration');
  return envReaders;
}
