import { createAlertStream, type HikvisionAlertStream, type StatusCallback } from '../../infrastructure/devices/HikvisionAlertStream.js';
import { eventProcessingService } from './EventProcessingService.js';
import { config } from '../../config/index.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { readerStatusStore } from '../../stores/ReaderStatusStore.js';
import type { ReaderConfig } from '../domain/Reader.js';

/**
 * Service for monitoring multiple Hikvision card readers
 */
export class ReaderMonitoringService {
  private streams = new Map<string, HikvisionAlertStream>();

  /**
   * Start monitoring all configured readers
   */
  async startReaders(readers: ReaderConfig[]): Promise<void> {
    logger.info({ count: readers.length }, 'Starting reader monitoring');

    // Initialize reader status in store
    readerStatusStore.initialize(readers);

    // Start alert streams for all readers
    const startPromises = readers.map(reader => this.startReader(reader));
    await Promise.allSettled(startPromises);
  }

  /**
   * Start monitoring a single reader
   */
  async startReader(reader: ReaderConfig): Promise<void> {
    const { name, ip } = reader;

    if (this.streams.has(name)) {
      logger.warn({ reader: name }, 'Reader already being monitored');
      return;
    }

    logger.info({ reader: name, ip }, 'Starting reader alert stream');

    // Create status change callback
    const onStatusChange: StatusCallback = async (online, error) => {
      if (online) {
        readerStatusStore.setOnline(name);
      } else {
        readerStatusStore.setOffline(name, error);
      }
    };

    // Create event callback
    const onEvent = async (data: import('../domain/RecordEvent.js').HikvisionEventData) => {
      await eventProcessingService.processEvent(name, ip, data);
    };

    try {
      const stream = await createAlertStream(
        name,
        ip,
        config.device.user,
        config.device.password,
        onEvent,
        onStatusChange
      );

      this.streams.set(name, stream);
    } catch (error) {
      logger.error({
        reader: name,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to start reader alert stream');
      throw error;
    }
  }

  /**
   * Stop monitoring a specific reader
   */
  stopReader(readerName: string): void {
    const stream = this.streams.get(readerName);
    if (stream) {
      stream.stop();
      this.streams.delete(readerName);
      logger.info({ reader: readerName }, 'Stopped reader monitoring');
    }
  }

  /**
   * Stop monitoring all readers
   */
  stopAll(): void {
    for (const [name] of this.streams) {
      this.stopReader(name);
    }
    logger.info('Stopped all reader monitoring');
  }

  /**
   * Get list of currently monitored readers
   */
  getMonitoredReaders(): string[] {
    return Array.from(this.streams.keys());
  }

  /**
   * Check if a reader is being monitored
   */
  isMonitoring(readerName: string): boolean {
    return this.streams.has(readerName);
  }
}

export const readerMonitoringService = new ReaderMonitoringService();
