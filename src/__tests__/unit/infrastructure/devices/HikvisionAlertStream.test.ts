import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockConfig } from '../../../helpers/mocks.js';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../../core/services/AlertService.js', () => ({
  alertService: {
    sendReaderOfflineAlert: vi.fn(),
    clearReaderAlert: vi.fn(),
    sendSystemAlert: vi.fn(),
    getAlertStates: vi.fn(),
    resetAll: vi.fn(),
  },
}));

vi.mock('digest-fetch', () => ({
  default: class {
    fetch = vi.fn();
  },
}));

import { HikvisionAlertStream } from '../../../../infrastructure/devices/HikvisionAlertStream.js';

describe('HikvisionAlertStream', () => {
  let stream: HikvisionAlertStream;
  let onEvent: ReturnType<typeof vi.fn>;
  let onStatusChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onEvent = vi.fn();
    onStatusChange = vi.fn();
  });

  describe('start', () => {
    it('should warn and return if already running', async () => {
      stream = new HikvisionAlertStream({
        readerName: 'Reader1',
        ip: '192.168.1.100',
        username: 'admin',
        password: 'pass',
        onEvent,
        onStatusChange,
      });

      (stream as any).isRunning = true;

      await stream.start();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reader: 'Reader1' }),
        'Alert stream already running'
      );
    });
  });

  describe('stop', () => {
    it('should set isRunning to false and abort controller', () => {
      stream = new HikvisionAlertStream({
        readerName: 'Reader1',
        ip: '192.168.1.100',
        username: 'admin',
        password: 'pass',
        onEvent,
        onStatusChange,
      });

      stream.stop();

      expect((stream as any).isRunning).toBe(false);
      expect((stream as any).abortController).toBeNull();
    });
  });

  describe('processBuffer', () => {
    it('should extract a single complete JSON object', async () => {
      const localOnEvent = vi.fn();

      stream = new HikvisionAlertStream({
        readerName: 'Reader1',
        ip: '192.168.1.100',
        username: 'admin',
        password: 'pass',
        onEvent: localOnEvent,
      });

      const state = { buffer: '', braceCount: 0, insideJson: false };
      const setState = (newState: typeof state) => {
        Object.assign(state, newState);
      };

      const json = JSON.stringify({
        ipAddress: '192.168.1.100',
        eventType: 'AccessControllerEvent',
        AccessControllerEvent: { majorEventType: 5 },
      });

      await (stream as any).processBuffer(json, state.buffer, state.braceCount, state.insideJson, setState);

      expect(localOnEvent).toHaveBeenCalledTimes(1);
    });

    it('should handle partial JSON across chunks', async () => {
      const localOnEvent = vi.fn();

      stream = new HikvisionAlertStream({
        readerName: 'Reader1',
        ip: '192.168.1.100',
        username: 'admin',
        password: 'pass',
        onEvent: localOnEvent,
      });

      const state = { buffer: '', braceCount: 0, insideJson: false };
      const setState = (newState: typeof state) => {
        Object.assign(state, newState);
      };

      await (stream as any).processBuffer('{"eventType":"Access', state.buffer, state.braceCount, state.insideJson, setState);
      expect(localOnEvent).not.toHaveBeenCalled();

      await (stream as any).processBuffer(
        'ControllerEvent","AccessControllerEvent":{"majorEventType":5}}',
        state.buffer,
        state.braceCount,
        state.insideJson,
        setState
      );
      expect(localOnEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('tryParseEvent', () => {
    it('should invoke onEvent for valid AccessControllerEvent', async () => {
      const localOnEvent = vi.fn();

      stream = new HikvisionAlertStream({
        readerName: 'Reader1',
        ip: '192.168.1.100',
        username: 'admin',
        password: 'pass',
        onEvent: localOnEvent,
      });

      const json = JSON.stringify({
        eventType: 'AccessControllerEvent',
        AccessControllerEvent: { majorEventType: 5 },
      });

      await (stream as any).tryParseEvent(json);

      expect(localOnEvent).toHaveBeenCalledTimes(1);
    });

    it('should silently ignore malformed JSON', async () => {
      const localOnEvent = vi.fn();

      stream = new HikvisionAlertStream({
        readerName: 'Reader1',
        ip: '192.168.1.100',
        username: 'admin',
        password: 'pass',
        onEvent: localOnEvent,
      });

      await (stream as any).tryParseEvent('not valid json');

      expect(localOnEvent).not.toHaveBeenCalled();
    });
  });

  describe('isAccessControllerEvent', () => {
    beforeEach(() => {
      stream = new HikvisionAlertStream({
        readerName: 'Reader1',
        ip: '192.168.1.100',
        username: 'admin',
        password: 'pass',
      });
    });

    it('should return true for AccessControllerEvent with majorEventType=5', () => {
      expect((stream as any).isAccessControllerEvent({
        eventType: 'AccessControllerEvent',
        AccessControllerEvent: { majorEventType: 5 },
      })).toBe(true);
    });

    it('should return false for other event types', () => {
      expect((stream as any).isAccessControllerEvent({
        eventType: 'SomeOtherEvent',
        AccessControllerEvent: { majorEventType: 5 },
      })).toBe(false);
    });

    it('should return false for wrong majorEventType', () => {
      expect((stream as any).isAccessControllerEvent({
        eventType: 'AccessControllerEvent',
        AccessControllerEvent: { majorEventType: 3 },
      })).toBe(false);
    });
  });
});
