import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockConfig } from '../../../helpers/mocks.js';

const { mockLogger, mockSendReaderAlert, mockSendSystemAlert, mockSendReaderBackOnlineAlert } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockSendReaderAlert: vi.fn(),
  mockSendSystemAlert: vi.fn(),
  mockSendReaderBackOnlineAlert: vi.fn(),
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../../infrastructure/notifications/email.js', () => ({
  emailService: {
    sendReaderAlert: mockSendReaderAlert,
    sendReaderBackOnlineAlert: mockSendReaderBackOnlineAlert,
    sendSystemAlert: mockSendSystemAlert,
    send: vi.fn(),
  },
}));

import { AlertService } from '../../../../core/services/AlertService.js';

describe('AlertService', () => {
  let service: AlertService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AlertService();
  });

  describe('sendReaderOfflineAlert', () => {
    it('should send alert on first call (no prior state)', async () => {
      mockSendReaderAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('Reader1', 'Connection lost');

      expect(mockSendReaderAlert).toHaveBeenCalledWith('Reader1', 'Connection lost');
    });

    it('should skip alert when within cooldown and under maxConsecutiveAlerts', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('Reader1', 'Error 1');
      mockSendReaderAlert.mockClear();

      // Second alert immediately after - should be skipped (within 15-min cooldown)
      await service.sendReaderOfflineAlert('Reader1', 'Error 2');

      expect(mockSendReaderAlert).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should send alert when consecutiveFailures reaches maxConsecutiveAlerts', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);

      // Send 3 alerts by advancing time past cooldown each time
      await service.sendReaderOfflineAlert('Reader1', 'Error 1');
      vi.advanceTimersByTime(16 * 60 * 1000);
      await service.sendReaderOfflineAlert('Reader1', 'Error 2');
      vi.advanceTimersByTime(16 * 60 * 1000);
      mockSendReaderAlert.mockClear();

      // 3rd alert
      await service.sendReaderOfflineAlert('Reader1', 'Error 3');
      expect(mockSendReaderAlert).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should send alert after cooldown expires', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('Reader1', 'Error 1');
      mockSendReaderAlert.mockClear();

      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      await service.sendReaderOfflineAlert('Reader1', 'Error 2');
      expect(mockSendReaderAlert).toHaveBeenCalledWith('Reader1', 'Error 2');
      vi.useRealTimers();
    });

    it('should increment consecutiveFailures on successive sends', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('Reader1', 'Error 1');
      expect(service.getAlertStates().get('Reader1')?.consecutiveFailures).toBe(1);

      vi.advanceTimersByTime(16 * 60 * 1000);
      await service.sendReaderOfflineAlert('Reader1', 'Error 2');
      expect(service.getAlertStates().get('Reader1')?.consecutiveFailures).toBe(2);
      vi.useRealTimers();
    });

    it('should catch and log when emailService rejects', async () => {
      mockSendReaderAlert.mockRejectedValue(new Error('SMTP down'));

      await service.sendReaderOfflineAlert('Reader1', 'Error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ reader: 'Reader1' }),
        'Failed to send reader offline alert'
      );
    });
  });

  describe('sendReaderOnlineAlert', () => {
    it('should send a back-online alert when a prior offline alert was sent', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);
      mockSendReaderBackOnlineAlert.mockResolvedValue(undefined);

      // Offline alert goes out at T0 (state.offlineSince = T0)
      await service.sendReaderOfflineAlert('Reader1', 'Connection lost');

      // Reader recovers 2 minutes later
      vi.advanceTimersByTime(2 * 60 * 1000);
      await service.sendReaderOnlineAlert('Reader1');

      expect(mockSendReaderBackOnlineAlert).toHaveBeenCalledWith('Reader1', '2m 0s');
      vi.useRealTimers();
    });

    it('should be a no-op when no offline alert was ever sent (e.g. startup connect)', async () => {
      await service.sendReaderOnlineAlert('Reader1');

      expect(mockSendReaderBackOnlineAlert).not.toHaveBeenCalled();
    });

    it('should clear the alert state so a fresh outage alerts from zero', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);
      mockSendReaderBackOnlineAlert.mockResolvedValue(undefined);

      // Offline alert goes out, then the reader recovers
      await service.sendReaderOfflineAlert('Reader1', 'Error 1');
      vi.advanceTimersByTime(60 * 1000);
      await service.sendReaderOnlineAlert('Reader1');

      expect(service.getAlertStates().has('Reader1')).toBe(false);
      vi.useRealTimers();
    });

    it('should clear state even when the recovery email fails', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);
      mockSendReaderBackOnlineAlert.mockRejectedValue(new Error('SMTP down'));

      await service.sendReaderOfflineAlert('Reader1', 'Error');
      vi.advanceTimersByTime(60 * 1000);
      await service.sendReaderOnlineAlert('Reader1');

      expect(service.getAlertStates().has('Reader1')).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ reader: 'Reader1' }),
        'Failed to send reader back-online alert'
      );
      vi.useRealTimers();
    });

    it('should format durations over an hour correctly', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);
      mockSendReaderBackOnlineAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('Reader1', 'Error');

      vi.advanceTimersByTime((65 * 60 + 10) * 1000); // 1h 5m 10s
      await service.sendReaderOnlineAlert('Reader1');

      expect(mockSendReaderBackOnlineAlert).toHaveBeenCalledWith('Reader1', '1h 05m');
      vi.useRealTimers();
    });
  });

  describe('clearReaderAlert', () => {
    it('should reset state so next alert is treated as fresh', async () => {
      mockSendReaderAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('Reader1', 'Error');
      service.clearReaderAlert('Reader1');

      await service.sendReaderOfflineAlert('Reader1', 'Error again');
      expect(mockSendReaderAlert).toHaveBeenCalledTimes(2);
    });

    it('should be a no-op for unknown reader', () => {
      expect(() => service.clearReaderAlert('Unknown')).not.toThrow();
    });
  });

  describe('sendSystemAlert', () => {
    it('should delegate to emailService.sendSystemAlert', async () => {
      mockSendSystemAlert.mockResolvedValue(undefined);

      await service.sendSystemAlert('Something broke', 'Critical Alert');

      expect(mockSendSystemAlert).toHaveBeenCalledWith('Something broke', 'Critical Alert');
    });

    it('should catch and log when emailService rejects', async () => {
      mockSendSystemAlert.mockRejectedValue(new Error('SMTP down'));

      await service.sendSystemAlert('Something broke');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({}),
        'Failed to send system alert'
      );
    });
  });

  describe('getAlertStates', () => {
    it('should return a copy not the internal map', async () => {
      mockSendReaderAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('Reader1', 'Error');

      const states = service.getAlertStates();
      expect(states).toBeInstanceOf(Map);
      expect(states.get('Reader1')).toBeDefined();

      states.delete('Reader1');
      expect(service.getAlertStates().has('Reader1')).toBe(true);
    });
  });

  describe('resetAll', () => {
    it('should clear all states', async () => {
      mockSendReaderAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('Reader1', 'Error');
      await service.sendReaderOfflineAlert('Reader2', 'Error');

      service.resetAll();

      expect(service.getAlertStates().size).toBe(0);
    });
  });

  describe('multiple readers', () => {
    it('should track readers independently', async () => {
      vi.useFakeTimers();
      mockSendReaderAlert.mockResolvedValue(undefined);

      await service.sendReaderOfflineAlert('ReaderA', 'Error');
      service.clearReaderAlert('ReaderA');
      await service.sendReaderOfflineAlert('ReaderB', 'Error');

      const states = service.getAlertStates();
      expect(states.has('ReaderA')).toBe(false);
      expect(states.has('ReaderB')).toBe(true);
      vi.useRealTimers();
    });
  });
});
