import { describe, it, expect, beforeEach } from 'vitest';

// Import the singleton and use it directly (class is not exported)
import { readerStatusStore } from '../../../stores/ReaderStatusStore.js';

// We'll test against the singleton by resetting state between tests
// The store has no reset method, so we test by initializing with different readers

describe('ReaderStatusStore', () => {
  beforeEach(() => {
    // The store is a singleton. We can't reset it, but we can
    // re-initialize it. Since initialize() skips existing readers,
    // we use unique names per test or rely on the fact that
    // initialize only adds new readers.
  });

  describe('initialize + setOnline', () => {
    it('should create entries with isOnline: false', () => {
      const uniqueName = `TestInit_${Date.now()}`;
      readerStatusStore.initialize([{ name: uniqueName, ip: '10.0.0.1' }]);

      const reader = readerStatusStore.getByName(uniqueName);
      expect(reader).toBeDefined();
      expect(reader?.isOnline).toBe(false);
      expect(reader?.ip).toBe('10.0.0.1');
    });

    it('should not overwrite existing reader entries', () => {
      const uniqueName = `TestNoOverwrite_${Date.now()}`;
      readerStatusStore.initialize([{ name: uniqueName, ip: '10.0.0.2' }]);
      readerStatusStore.setOnline(uniqueName);

      // Re-initialize with same reader
      readerStatusStore.initialize([{ name: uniqueName, ip: '10.0.0.2' }]);

      const reader = readerStatusStore.getByName(uniqueName);
      expect(reader?.isOnline).toBe(true);
    });
  });

  describe('setOnline', () => {
    it('should set isOnline to true and clear lastError', () => {
      const uniqueName = `TestOnline_${Date.now()}`;
      readerStatusStore.initialize([{ name: uniqueName, ip: '10.0.0.3' }]);
      readerStatusStore.setOffline(uniqueName, 'Some error');
      readerStatusStore.setOnline(uniqueName);

      const reader = readerStatusStore.getByName(uniqueName);
      expect(reader?.isOnline).toBe(true);
      expect(reader?.lastError).toBeNull();
    });

    it('should be a no-op for unknown reader', () => {
      expect(() => readerStatusStore.setOnline('UnknownReader_9999')).not.toThrow();
    });
  });

  describe('setOffline', () => {
    it('should set isOnline to false and set lastError', () => {
      const uniqueName = `TestOffline_${Date.now()}`;
      readerStatusStore.initialize([{ name: uniqueName, ip: '10.0.0.4' }]);
      readerStatusStore.setOnline(uniqueName);
      readerStatusStore.setOffline(uniqueName, 'Connection refused');

      const reader = readerStatusStore.getByName(uniqueName);
      expect(reader?.isOnline).toBe(false);
      expect(reader?.lastError).toBe('Connection refused');
    });

    it('should use default error message when none provided', () => {
      const uniqueName = `TestOfflineDefault_${Date.now()}`;
      readerStatusStore.initialize([{ name: uniqueName, ip: '10.0.0.5' }]);
      readerStatusStore.setOffline(uniqueName);

      const reader = readerStatusStore.getByName(uniqueName);
      expect(reader?.lastError).toBe('Connection lost');
    });
  });

  describe('updateLastEventTime', () => {
    it('should set lastEventDateTime and mark online', () => {
      const uniqueName = `TestEventTime_${Date.now()}`;
      readerStatusStore.initialize([{ name: uniqueName, ip: '10.0.0.6' }]);
      const eventTime = new Date('2026-04-11T10:00:00Z');
      readerStatusStore.updateLastEventTime(uniqueName, eventTime);

      const reader = readerStatusStore.getByName(uniqueName);
      expect(reader?.lastEventDateTime).toEqual(eventTime);
      expect(reader?.isOnline).toBe(true);
      expect(reader?.lastError).toBeNull();
    });

    it('should be a no-op for unknown reader', () => {
      expect(() => readerStatusStore.updateLastEventTime('UnknownReader_9999', new Date())).not.toThrow();
    });
  });

  describe('getByName', () => {
    it('should return undefined for unknown name', () => {
      expect(readerStatusStore.getByName('CompletelyUnknownReader')).toBeUndefined();
    });
  });

  describe('getOnline / getOffline', () => {
    it('getOnline should return only readers with isOnline true', () => {
      const online = readerStatusStore.getOnline();
      expect(Array.isArray(online)).toBe(true);
      expect(online.every(r => r.isOnline === true)).toBe(true);
    });

    it('getOffline should return only readers with isOnline false', () => {
      const offline = readerStatusStore.getOffline();
      expect(Array.isArray(offline)).toBe(true);
      expect(offline.every(r => r.isOnline === false)).toBe(true);
    });
  });
});
