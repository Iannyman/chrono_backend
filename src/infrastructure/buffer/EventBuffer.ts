import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../logging/logger.js';
import type { RecordEvent } from '../../core/domain/RecordEvent.js';
import { emailService } from '../notifications/email.js';

export interface EventBufferOptions {
  maxMemoryItems?: number;
  persistPath?: string;
  flushInterval?: number;
  maxRetries?: number;
}

export interface BufferedEvent {
  event: RecordEvent;
  retries: number;
  addedAt: number;
}

/**
 * Event buffer that stores events in memory and persists to disk
 * Handles peaks and SQL downtime gracefully
 */
export class EventBuffer {
  private buffer: BufferedEvent[] = [];
  private persistPath: string;
  private maxMemoryItems: number;
  private flushInterval: number;
  private maxRetries: number;
  private flushTimer?: NodeJS.Timeout;
  private isFlushing = false;
  private isPaused = false;
  private flushCallback?: (events: RecordEvent[]) => Promise<void>;

  constructor(options: EventBufferOptions = {}) {
    this.maxMemoryItems = options.maxMemoryItems ?? 10000;
    this.persistPath = options.persistPath ?? './dead-letter/dead-letter-events.json';
    this.flushInterval = options.flushInterval ?? 5000; // 5 seconds
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * Start the buffer with a flush callback
   * @param callback - Function to flush events to SQL (called by background worker)
   */
  async start(callback: (events: RecordEvent[]) => Promise<void>): Promise<void> {
    this.flushCallback = callback;

    // Load persisted events from disk
    await this.loadPersisted();

    // Start background flush worker
    this.startFlushWorker();

    logger.info({
      bufferSize: this.buffer.length,
      flushInterval: this.flushInterval,
    }, 'Event buffer started');
  }

  /**
   * Stop the buffer and flush remaining events
   */
  async stop(): Promise<void> {
    this.isPaused = true;

    // Stop the flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush remaining events
    await this.flush();

    // Persist to disk before stopping
    await this.persist();

    logger.info('Event buffer stopped');
  }

  /**
   * Add an event to the buffer
   */
  async add(event: RecordEvent): Promise<void> {
    if (this.isPaused) {
      logger.warn('Event buffer is paused, event not added');
      return;
    }

    const bufferedEvent: BufferedEvent = {
      event,
      retries: 0,
      addedAt: Date.now(),
    };

    this.buffer.push(bufferedEvent);

    // If buffer is getting full, trigger immediate flush
    if (this.buffer.length >= this.maxMemoryItems) {
      logger.warn({ bufferSize: this.buffer.length }, 'Buffer nearing capacity, triggering immediate flush');
      setImmediate(() => this.flush());
    }

    // Periodically persist to disk
    if (this.buffer.length % 100 === 0) {
      this.persist().catch(err => logger.error({ error: err }, 'Failed to persist buffer'));
    }
  }

  /**
   * Get current buffer stats
   */
  getStats() {
    return {
      bufferSize: this.buffer.length,
      maxMemoryItems: this.maxMemoryItems,
      isFlushing: this.isFlushing,
      isPaused: this.isPaused,
      oldestEventAge: this.buffer.length > 0
        ? Date.now() - this.buffer[0].addedAt
        : 0,
    };
  }

  /**
   * Clear all events from buffer
   */
  clear(): void {
    this.buffer = [];
    logger.info('Event buffer cleared');
  }

  /**
   * Pause the buffer (stop accepting new events)
   */
  pause(): void {
    this.isPaused = true;
    logger.info('Event buffer paused');
  }

  /**
   * Resume the buffer
   */
  resume(): void {
    this.isPaused = false;
    logger.info('Event buffer resumed');
  }

  /**
   * Flush events to SQL via callback
   */
  private async flush(): Promise<boolean> {
    if (this.isFlushing || this.buffer.length === 0 || !this.flushCallback) {
      return false;
    }

    this.isFlushing = true;

    // Take all events from buffer
    const eventsToFlush = this.buffer.splice(0, this.buffer.length);

    try {

      logger.info({ count: eventsToFlush.length }, 'Flushing events to SQL');

      await this.flushCallback(eventsToFlush.map(e => e.event));

      // Successfully flushed, try to flush any previously persisted events
      const hadPersisted = existsSync(this.persistPath);
      await this.loadPersisted();
      if (this.buffer.length > 0) {
        logger.info({ count: this.buffer.length }, 'Re-flushing previously persisted events');
        await this.flushCallback(this.buffer.splice(0, this.buffer.length).map(e => e.event));
      }
      await this.clearPersisted();

      // Send email when persisted events were recovered
      if (hadPersisted) {
        const message = `Event Buffer Recovery\n\n` +
          `SQL connection restored.\n` +
          `Persisted events have been successfully flushed and cleared from disk.`;

        await emailService.send(message, 'Info: Event Buffer - SQL Connection Restored');
      }

      logger.info({ count: eventsToFlush.length }, 'Events flushed successfully');
      return true;
    } catch (error) {
      // Flush failed, put events back with incremented retry count
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({
        error: errorMsg,
        count: eventsToFlush.length,
      }, 'Failed to flush events to SQL, keeping in buffer');

      // Increment retry counts and separate max-retry events
      const toRetry: BufferedEvent[] = [];
      const toDeadLetter: BufferedEvent[] = [];

      for (const bufferedEvent of eventsToFlush) {
        bufferedEvent.retries++;
        if (bufferedEvent.retries >= this.maxRetries) {
          toDeadLetter.push(bufferedEvent);
        } else {
          toRetry.push(bufferedEvent);
        }
      }

      // Put events still under max retries back into buffer
      if (toRetry.length > 0) {
        this.buffer.unshift(...toRetry);
      }

      // Save max-retry events to persist file on disk
      if (toDeadLetter.length > 0) {
        const dir = this.persistPath.substring(0, this.persistPath.lastIndexOf('/'));
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }
        let existing: BufferedEvent[] = [];
        if (existsSync(this.persistPath)) {
          const data = await readFile(this.persistPath, 'utf-8');
          existing = JSON.parse(data) as BufferedEvent[];
        }
        existing.push(...toDeadLetter);
        await writeFile(this.persistPath, JSON.stringify(existing), 'utf-8');

        logger.warn({
          count: toDeadLetter.length,
          path: this.persistPath,
        }, 'Events persisted to disk after max retries');

        // Send email with event details (rate limited by email service)
        const eventDetails = toDeadLetter
          .map((e, i) => `${i + 1}. Reader: ${e.event.readerName}, Employee: ${e.event.employeeNo}, Card: ${e.event.cardNo ?? 'N/A'}, Time: ${e.event.eventDateTime}`)
          .join('\n');

        const message = `Event Buffer Alert\n\n` +
          `Failed to flush events to SQL after ${this.maxRetries} retries.\n` +
          `Events saved to persist file for later retry:\n\n` +
          eventDetails + '\n\n' +
          `Events remaining in buffer: ${this.buffer.length}\n` +
          `Please check SQL Server connectivity.`;

        await emailService.send(message, 'Alert: Event Buffer - SQL Flush Failed');

        logger.warn({
          persistedCount: toDeadLetter.length,
          remainingInBuffer: this.buffer.length,
        }, 'Sent email notification for persisted events');
      }

      return false;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Background worker that periodically flushes buffer
   */
  private startFlushWorker(): void {
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0 && !this.isFlushing && !this.isPaused) {
        await this.flush();
      }
    }, this.flushInterval);
  }

  /**
   * Persist buffer to disk
   */
  private async persist(): Promise<void> {
    try {
      const data = JSON.stringify(this.buffer);
      await writeFile(this.persistPath, data, 'utf-8');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to persist buffer to disk');
    }
  }

  /**
   * Load persisted buffer from disk
   */
  private async loadPersisted(): Promise<void> {
    if (!existsSync(this.persistPath)) {
      return;
    }

    try {
      const data = await readFile(this.persistPath, 'utf-8');
      const persisted = JSON.parse(data) as BufferedEvent[];

      // Validate and load persisted events
      const validEvents = persisted.filter(e => e.event && e.event.readerName);

      this.buffer = validEvents;

      logger.info({ count: this.buffer.length }, 'Loaded persisted events from disk');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to load persisted buffer');
    }
  }

  /**
   * Clear persisted file from disk
   */
  private async clearPersisted(): Promise<void> {
    try {
      if (existsSync(this.persistPath)) {
        await unlink(this.persistPath);
      }
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to clear persisted buffer');
    }
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.buffer.length === 0;
  }
}

export const eventBuffer = new EventBuffer();
