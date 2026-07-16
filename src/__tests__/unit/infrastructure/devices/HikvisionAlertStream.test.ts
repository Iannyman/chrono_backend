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

import { HikvisionAlertStream, AlertStreamAuthError } from '../../../../infrastructure/devices/HikvisionAlertStream.js';

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

  describe('probeAuthStatus', () => {
    it('parses a locked userCheck response into lockStatus / unlockTime', async () => {
      stream = new HikvisionAlertStream({
        readerName: '308', ip: '172.23.71.11', username: 'admin', password: 'x',
      });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          '<userCheck><statusString>Unauthorized</statusString><lockStatus>lock</lockStatus><unlockTime>460</unlockTime><retryLoginTime>0</retryLoginTime></userCheck>',
      });
      (stream as any).createClient = vi.fn().mockReturnValue({ fetch: fetchMock });

      const result = await (stream as any).probeAuthStatus();

      expect(result).toBeInstanceOf(AlertStreamAuthError);
      expect(result.isLocked).toBe(true);
      expect(result.unlockTime).toBe(460);
      expect(result.retryLoginTime).toBe(0);
      expect(result.message).toContain('lock=lock');
      expect(result.message).toContain('unlockIn=460s');
    });

    it('returns a non-locked error when userCheck accepts credentials (200)', async () => {
      stream = new HikvisionAlertStream({
        readerName: '308', ip: '172.23.71.11', username: 'admin', password: 'x',
      });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<userCheck><statusString>OK</statusString></userCheck>',
      });
      (stream as any).createClient = vi.fn().mockReturnValue({ fetch: fetchMock });

      const result = await (stream as any).probeAuthStatus();

      expect(result).toBeInstanceOf(AlertStreamAuthError);
      expect(result.isLocked).toBe(false);
      expect(result.unlockTime).toBeUndefined();
    });

    it('returns null when the probe itself throws', async () => {
      stream = new HikvisionAlertStream({
        readerName: '308', ip: '172.23.71.11', username: 'admin', password: 'x',
      });
      const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
      (stream as any).createClient = vi.fn().mockReturnValue({ fetch: fetchMock });

      const result = await (stream as any).probeAuthStatus();

      expect(result).toBeNull();
    });
  });

  describe('createClient (fresh digest client per connection)', () => {
    // Reusing one digest-fetch client across reconnects caches a server nonce;
    // resending it stale trips Hikvision's lockout. Each connection attempt must
    // build a fresh client (mirroring curl).
    it('returns a distinct client on each call so nonces are never reused', () => {
      stream = new HikvisionAlertStream({
        readerName: '308', ip: '172.23.71.11', username: 'admin', password: 'x',
      });
      const a = (stream as any).createClient();
      const b = (stream as any).createClient();
      expect(a).not.toBe(b);
    });

    it('connectAndProcess builds a fresh client for each attempt', async () => {
      stream = new HikvisionAlertStream({
        readerName: '308', ip: '172.23.71.11', username: 'admin', password: 'x',
      });
      (stream as any).abortController = new AbortController();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: { get: () => null },
        text: async () => '',
      });
      const createClientMock = vi.fn().mockReturnValue({ fetch: fetchMock });
      (stream as any).createClient = createClientMock;

      await expect((stream as any).connectAndProcess()).rejects.toThrow(/HTTP 500/);
      expect(createClientMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('connectAndProcess transient-rejection retry', () => {
    it('retries once when credentials are valid but the stream transiently 401s', async () => {
      stream = new HikvisionAlertStream({
        readerName: '308', ip: '172.23.71.11', username: 'admin', password: 'x',
      });
      (stream as any).abortController = new AbortController();
      // Stub processStream so handleAlertStreamResponse completes without a real stream body.
      (stream as any).processStream = vi.fn().mockResolvedValue(undefined);

      const streamFail = vi.fn().mockResolvedValue({
        ok: false, status: 401, statusText: 'Unauthorized',
        headers: { get: () => null }, text: async () => '',
      });
      const probeOk = vi.fn().mockResolvedValue({
        ok: true, status: 200,
        text: async () => '<userCheck><statusString>OK</statusString></userCheck>',
      });
      const streamOk = vi.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: { get: () => 'multipart/mixed; boundary=boundary' },
        body: null,
      });
      const clients = [{ fetch: streamFail }, { fetch: probeOk }, { fetch: streamOk }];
      let i = 0;
      (stream as any).createClient = vi.fn(() => clients[i++]);

      await expect((stream as any).connectAndProcess()).resolves.toBeUndefined();
      expect(streamFail).toHaveBeenCalledTimes(1);
      expect(probeOk).toHaveBeenCalledTimes(1);
      expect(streamOk).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry when the account is locked (avoids hammering a locked device)', async () => {
      stream = new HikvisionAlertStream({
        readerName: '308', ip: '172.23.71.11', username: 'admin', password: 'x',
      });
      (stream as any).abortController = new AbortController();

      const streamFail = vi.fn().mockResolvedValue({
        ok: false, status: 401, statusText: 'Unauthorized',
        headers: { get: () => null }, text: async () => '',
      });
      const probeLocked = vi.fn().mockResolvedValue({
        ok: false, status: 401,
        text: async () =>
          '<userCheck><lockStatus>lock</lockStatus><unlockTime>460</unlockTime><retryLoginTime>0</retryLoginTime></userCheck>',
      });
      const unused = { fetch: vi.fn() };
      const clients = [{ fetch: streamFail }, { fetch: probeLocked }, unused];
      let i = 0;
      (stream as any).createClient = vi.fn(() => clients[i++]);

      await expect((stream as any).connectAndProcess()).rejects.toThrow(/lock=lock/);
      expect(streamFail).toHaveBeenCalledTimes(1);
      expect(probeLocked).toHaveBeenCalledTimes(1);
      expect(unused.fetch).not.toHaveBeenCalled();
    });
  });

  describe('computeBackoff', () => {
    beforeEach(() => {
      stream = new HikvisionAlertStream({
        readerName: '308', ip: '172.23.71.11', username: 'admin', password: 'x',
        reconnectDelay: 3000,
      });
    });

    it('waits unlockTime + 30s for a locked account', () => {
      const err = new AlertStreamAuthError('HTTP 401: lock=lock, unlockIn=460s', {
        status: 401, lockStatus: 'lock', unlockTime: 460, retryLoginTime: 0,
      });
      expect((stream as any).computeBackoff(err)).toBe((460 + 30) * 1000);
    });

    it('uses 60s for a non-locked auth error', () => {
      const err = new AlertStreamAuthError('HTTP 401: Unauthorized', { status: 401 });
      expect((stream as any).computeBackoff(err)).toBe(60000);
    });

    it('uses the normal reconnect delay for other errors', () => {
      expect((stream as any).computeBackoff(new Error('boom'))).toBe(3000);
    });
  });
});
