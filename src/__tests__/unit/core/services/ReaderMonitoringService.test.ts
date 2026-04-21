import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockConfig } from '../../../helpers/mocks.js';

const { mockLogger, mockProcessEvent, mockSetOnline, mockSetOffline, mockInitialize, mockCreateAlertStream } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockProcessEvent: vi.fn().mockResolvedValue({ success: true }),
  mockSetOnline: vi.fn(),
  mockSetOffline: vi.fn(),
  mockInitialize: vi.fn(),
  mockCreateAlertStream: vi.fn(),
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../../core/services/EventProcessingService.js', () => ({
  eventProcessingService: { processEvent: mockProcessEvent },
}));

vi.mock('../../../../stores/ReaderStatusStore.js', () => ({
  readerStatusStore: {
    initialize: mockInitialize,
    setOnline: mockSetOnline,
    setOffline: mockSetOffline,
  },
}));

vi.mock('../../../../infrastructure/devices/HikvisionAlertStream.js', () => ({
  createAlertStream: (...args: any[]) => mockCreateAlertStream(...args),
}));

import { ReaderMonitoringService } from '../../../../core/services/ReaderMonitoringService.js';

describe('ReaderMonitoringService', () => {
  let service: ReaderMonitoringService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReaderMonitoringService();
  });

  const createMockStream = () => ({ stop: vi.fn() });

  describe('startReaders', () => {
    it('should initialize readerStatusStore with provided readers', async () => {
      mockCreateAlertStream.mockResolvedValue(createMockStream());

      const readers = [
        { name: 'Reader1', ip: '192.168.1.100' },
        { name: 'Reader2', ip: '192.168.1.101' },
      ];

      await service.startReaders(readers);

      expect(mockInitialize).toHaveBeenCalledWith(readers);
    });

    it('should start alert stream for each reader', async () => {
      mockCreateAlertStream.mockResolvedValue(createMockStream());

      await service.startReaders([
        { name: 'Reader1', ip: '192.168.1.100' },
        { name: 'Reader2', ip: '192.168.1.101' },
      ]);

      expect(mockCreateAlertStream).toHaveBeenCalledTimes(2);
    });

    it('should use Promise.allSettled so one failure does not prevent others', async () => {
      mockCreateAlertStream
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(createMockStream());

      await service.startReaders([
        { name: 'Reader1', ip: '192.168.1.100' },
        { name: 'Reader2', ip: '192.168.1.101' },
      ]);

      expect(mockCreateAlertStream).toHaveBeenCalledTimes(2);
      expect(service.getMonitoredReaders()).toEqual(['Reader2']);
    });
  });

  describe('startReader', () => {
    it('should create alert stream with correct config', async () => {
      mockCreateAlertStream.mockResolvedValue(createMockStream());

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });

      expect(mockCreateAlertStream).toHaveBeenCalledWith(
        'Reader1',
        '192.168.1.100',
        mockConfig.device.user,
        mockConfig.device.password,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('should skip and log warning if reader already monitored', async () => {
      mockCreateAlertStream.mockResolvedValue(createMockStream());

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });
      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });

      expect(mockCreateAlertStream).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reader: 'Reader1' }),
        'Reader already being monitored'
      );
    });

    it('should throw when createAlertStream rejects', async () => {
      mockCreateAlertStream.mockRejectedValue(new Error('Connection failed'));

      await expect(
        service.startReader({ name: 'Reader1', ip: '192.168.1.100' })
      ).rejects.toThrow('Connection failed');
    });

    it('should call setOnline when status callback fires with online=true', async () => {
      let statusCallback: Function = () => {};
      mockCreateAlertStream.mockImplementation(async (_n: any, _ip: any, _u: any, _p: any, _evt: any, onStatus: any) => {
        statusCallback = onStatus;
        return createMockStream();
      });

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });
      await statusCallback(true);

      expect(mockSetOnline).toHaveBeenCalledWith('Reader1');
    });

    it('should call setOffline when status callback fires with online=false', async () => {
      let statusCallback: Function = () => {};
      mockCreateAlertStream.mockImplementation(async (_n: any, _ip: any, _u: any, _p: any, _evt: any, onStatus: any) => {
        statusCallback = onStatus;
        return createMockStream();
      });

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });
      await statusCallback(false, 'Timeout');

      expect(mockSetOffline).toHaveBeenCalledWith('Reader1', 'Timeout');
    });

    it('should call processEvent on event callback', async () => {
      let eventCallback: Function = () => {};
      mockCreateAlertStream.mockImplementation(async (_n: any, _ip: any, _u: any, _p: any, onEvent: any) => {
        eventCallback = onEvent;
        return createMockStream();
      });

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });
      const mockData = { eventType: 'AccessControllerEvent' };
      await eventCallback(mockData);

      expect(mockProcessEvent).toHaveBeenCalledWith('Reader1', '192.168.1.100', mockData);
    });
  });

  describe('stopReader', () => {
    it('should call stream.stop() and remove from map', async () => {
      const stream = createMockStream();
      mockCreateAlertStream.mockResolvedValue(stream);

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });
      service.stopReader('Reader1');

      expect(stream.stop).toHaveBeenCalled();
      expect(service.isMonitoring('Reader1')).toBe(false);
    });

    it('should be a no-op for unknown reader', () => {
      expect(() => service.stopReader('Unknown')).not.toThrow();
    });
  });

  describe('stopAll', () => {
    it('should stop all monitored readers', async () => {
      const stream1 = createMockStream();
      const stream2 = createMockStream();
      mockCreateAlertStream
        .mockResolvedValueOnce(stream1)
        .mockResolvedValueOnce(stream2);

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });
      await service.startReader({ name: 'Reader2', ip: '192.168.1.101' });
      service.stopAll();

      expect(stream1.stop).toHaveBeenCalled();
      expect(stream2.stop).toHaveBeenCalled();
      expect(service.getMonitoredReaders()).toEqual([]);
    });
  });

  describe('getMonitoredReaders', () => {
    it('should return array of monitored reader names', async () => {
      mockCreateAlertStream.mockResolvedValue(createMockStream());

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });
      await service.startReader({ name: 'Reader2', ip: '192.168.1.101' });

      expect(service.getMonitoredReaders()).toEqual(['Reader1', 'Reader2']);
    });
  });

  describe('isMonitoring', () => {
    it('should return true/false correctly', async () => {
      mockCreateAlertStream.mockResolvedValue(createMockStream());

      await service.startReader({ name: 'Reader1', ip: '192.168.1.100' });

      expect(service.isMonitoring('Reader1')).toBe(true);
      expect(service.isMonitoring('Reader99')).toBe(false);
    });
  });
});
