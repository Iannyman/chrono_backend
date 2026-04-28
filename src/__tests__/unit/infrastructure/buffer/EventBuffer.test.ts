import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockConfig } from '../../../helpers/mocks.js';

const { mockLogger, mockEmailSend } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockEmailSend: vi.fn(),
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../../infrastructure/notifications/email.js', () => ({
  emailService: {
    send: mockEmailSend,
    sendReaderAlert: vi.fn(),
    sendSystemAlert: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));

import { EventBuffer } from '../../../../infrastructure/buffer/EventBuffer.js';
import type { RecordEvent } from '../../../../core/domain/RecordEvent.js';
import { existsSync } from 'fs';
import { writeFile, readFile, mkdir } from 'fs/promises';

const createEvent = (readerName = 'Reader1', employeeNo = '7400'): RecordEvent => ({
  readerName,
  readerIp: '192.168.1.100',
  employeeNo,
  cardNo: '123456',
  eventDateTime: new Date('2026-04-11T10:00:00Z'),
  createdAt: new Date('2026-04-11T10:00:00Z'),
});

describe('EventBuffer', () => {
  let buffer: EventBuffer;
  let flushCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    flushCallback = vi.fn().mockResolvedValue(undefined);
    buffer = new EventBuffer({
      maxMemoryItems: 5,
      persistPath: './test-dead-letter.json',
      flushInterval: 5000,
      maxRetries: 3,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('add', () => {
    it('should append event when not paused', async () => {
      await buffer.start(flushCallback);
      await buffer.add(createEvent());

      expect(buffer.size()).toBe(1);
    });

    it('should reject event when paused (logs warning)', async () => {
      await buffer.start(flushCallback);
      buffer.pause();

      await buffer.add(createEvent());

      expect(buffer.size()).toBe(0);
    });

    it('should trigger immediate flush at maxMemoryItems capacity', async () => {
      await buffer.start(flushCallback);

      for (let i = 0; i < 5; i++) {
        await buffer.add(createEvent(`Reader${i}`));
      }

      await vi.advanceTimersByTimeAsync(0);

      expect(flushCallback).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should load persisted events from disk', async () => {
      const persistedEvents = [{ event: createEvent(), retries: 0, addedAt: Date.now() }];
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(persistedEvents));

      await buffer.start(flushCallback);

      expect(buffer.size()).toBe(1);
    });
  });

  describe('stop', () => {
    it('should pause, clear timer, and persist remaining', async () => {
      (writeFile as any).mockResolvedValue(undefined);

      await buffer.start(flushCallback);
      await buffer.add(createEvent());
      await buffer.stop();

      expect(buffer.getStats().isPaused).toBe(true);
    });
  });

  describe('flush', () => {
    it('happy path: splices events, calls callback', async () => {
      await buffer.start(flushCallback);
      await buffer.add(createEvent('R1'));
      await buffer.add(createEvent('R2'));

      await vi.advanceTimersByTimeAsync(5000);

      expect(flushCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ readerName: 'R1' }),
          expect.objectContaining({ readerName: 'R2' }),
        ])
      );
      expect(buffer.size()).toBe(0);
    });

    it('should skip when buffer is empty', async () => {
      (existsSync as any).mockReturnValue(false);
      const emptyBuffer = new EventBuffer({
        maxMemoryItems: 5,
        persistPath: './test-empty.json',
        flushInterval: 5000,
        maxRetries: 3,
      });
      const emptyFlush = vi.fn().mockResolvedValue(undefined);
      await emptyBuffer.start(emptyFlush);

      await vi.advanceTimersByTimeAsync(5000);

      expect(emptyFlush).not.toHaveBeenCalled();
    });

    it('should increment retries on callback failure and put events back', async () => {
      (existsSync as any).mockReturnValue(false);
      const retryBuffer = new EventBuffer({
        maxMemoryItems: 5,
        persistPath: './test-retry.json',
        flushInterval: 5000,
        maxRetries: 3,
      });
      const retryFlush = vi.fn().mockRejectedValue(new Error('SQL down'));
      await retryBuffer.start(retryFlush);
      await retryBuffer.add(createEvent());

      await vi.advanceTimersByTimeAsync(5000);

      expect(retryBuffer.size()).toBe(1);
    });

    it('should write events with retries >= maxRetries to dead-letter file', async () => {
      flushCallback.mockRejectedValue(new Error('SQL down'));
      (existsSync as any).mockReturnValue(false);
      (writeFile as any).mockResolvedValue(undefined);

      await buffer.start(flushCallback);
      await buffer.add(createEvent());

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      expect(writeFile).toHaveBeenCalled();
    });

    it('should send email notification on dead-letter', async () => {
      flushCallback.mockRejectedValue(new Error('SQL down'));
      (existsSync as any).mockReturnValue(false);
      (writeFile as any).mockResolvedValue(undefined);
      mockEmailSend.mockResolvedValue(undefined);

      await buffer.start(flushCallback);
      await buffer.add(createEvent());

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      expect(mockEmailSend).toHaveBeenCalledWith(
        expect.stringContaining('Failed to flush events'),
        expect.stringContaining('SQL Flush Failed')
      );
    });

    it('should delegate email rate limiting to email service', async () => {
      flushCallback.mockRejectedValue(new Error('SQL down'));
      (existsSync as any).mockReturnValue(false);
      (writeFile as any).mockResolvedValue(undefined);
      mockEmailSend.mockResolvedValue(undefined);

      await buffer.start(flushCallback);

      await buffer.add(createEvent('R1'));
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      // Email was sent once for the first dead-letter batch
      expect(mockEmailSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      await buffer.start(flushCallback);

      const stats = buffer.getStats();
      expect(stats).toEqual({
        bufferSize: 0,
        maxMemoryItems: 5,
        isFlushing: false,
        isPaused: false,
        oldestEventAge: 0,
      });
    });
  });

  describe('clear', () => {
    it('should empty the buffer', async () => {
      await buffer.start(flushCallback);
      await buffer.add(createEvent());
      await buffer.add(createEvent());

      buffer.clear();

      expect(buffer.size()).toBe(0);
    });
  });

  describe('pause / resume', () => {
    it('should toggle isPaused flag', async () => {
      await buffer.start(flushCallback);

      buffer.pause();
      expect(buffer.getStats().isPaused).toBe(true);

      buffer.resume();
      expect(buffer.getStats().isPaused).toBe(false);
    });
  });

  describe('loadPersisted', () => {
    it('should handle malformed JSON gracefully', async () => {
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue('not valid json {{{');

      await buffer.start(flushCallback);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({}),
        'Failed to load persisted buffer'
      );
      expect(buffer.size()).toBe(0);
    });
  });

  describe('size / isEmpty', () => {
    it('should report correct size and empty state', async () => {
      await buffer.start(flushCallback);

      expect(buffer.size()).toBe(0);
      expect(buffer.isEmpty()).toBe(true);

      await buffer.add(createEvent());
      expect(buffer.size()).toBe(1);
      expect(buffer.isEmpty()).toBe(false);
    });
  });
});
