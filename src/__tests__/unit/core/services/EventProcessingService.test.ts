import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HikvisionEventData } from '../../../../core/domain/RecordEvent.js';

// Mock config before anything that depends on it
vi.mock('../../../../config/index.js', () => ({
  config: {
    server: { port: 3000, nodeEnv: 'test' },
    device: { user: 'test', password: 'test' },
    db: { server: 'localhost', database: 'test', user: 'test', password: 'test', encrypt: false, trustServerCertificate: true, connectionTimeout: 5000, requestTimeout: 5000 },
    email: { host: '', port: 587, secure: false, from: 'test@test.com', to: [], subject: 'test' },
    security: { jwtSecret: 'test-secret', jwtExpiresIn: '1h', apiRateLimit: 100 },
    logging: { level: 'info', prettyPrint: false },
  },
}));

// Mock the logger to avoid loading config in tests
vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the buffer and reader status store
vi.mock('../../../../infrastructure/buffer/EventBuffer.js', () => ({
  eventBuffer: {
    add: vi.fn(),
    size: vi.fn(() => 0),
  },
}));

vi.mock('../../../../stores/ReaderStatusStore.js', () => ({
  readerStatusStore: {
    updateLastEventTime: vi.fn(),
  },
}));

import { EventProcessingService } from '../../../../core/services/EventProcessingService.js';

describe('EventProcessingService', () => {
  let service: EventProcessingService;
  let mockEventBuffer: any;
  let mockReaderStatusStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    const { eventBuffer } = await import('../../../../infrastructure/buffer/EventBuffer.js');
    const { readerStatusStore } = await import('../../../../stores/ReaderStatusStore.js');

    mockEventBuffer = eventBuffer;
    mockReaderStatusStore = readerStatusStore;

    service = new EventProcessingService();
  });

  const createMockEventData = (employeeNo = '12345'): HikvisionEventData => ({
    ipAddress: '192.168.1.100',
    portNo: 80,
    protocol: 'HTTP',
    dateTime: '2026-03-25T13:53:37+02:00',
    activePostCount: 1,
    eventType: 'AccessControllerEvent',
    eventState: 'active',
    eventDescription: 'Access Controller Event',
    AccessControllerEvent: {
      deviceName: 'DS-K1A802AMF-B',
      majorEventType: 5,
      subEventType: 1,
      cardNo: '0783293105',
      cardType: 1,
      cardReaderNo: 1,
      doorNo: 1,
      employeeNoString: employeeNo,
      serialNo: 150,
      userType: 'normal',
      attendanceStatus: 'undefined',
      statusValue: 0,
      picturesNumber: 0,
      purePwdVerifyEnable: true,
    },
  });

  describe('processEvent', () => {
    it('should process a valid card event successfully', async () => {
      const mockData = createMockEventData('7400');

      const result = await service.processEvent('Reader1', '192.168.1.100', mockData);

      expect(result.success).toBe(true);
      expect(result.readerName).toBe('Reader1');
      expect(result.employeeNo).toBe('7400');
      expect(result.cardNo).toBe('0783293105');
      expect(result.eventType).toBe('valid');
      expect(mockEventBuffer.add).toHaveBeenCalled();
      expect(mockReaderStatusStore.updateLastEventTime).toHaveBeenCalled();
    });

    it('should process an invalid (unregistered) card event', async () => {
      const mockData = createMockEventData(''); // Empty employee number

      const result = await service.processEvent('Reader1', '192.168.1.100', mockData);

      expect(result.success).toBe(true);
      expect(result.employeeNo).toBeNull();
      expect(result.eventType).toBe('invalid');
    });

    it('should parse event date correctly', async () => {
      const mockData = createMockEventData('7400');

      await service.processEvent('Reader1', '192.168.1.100', mockData);

      const addCall = mockEventBuffer.add.mock.calls[0][0];
      expect(addCall.eventDateTime).toBeInstanceOf(Date);
      // Service strips timezone and stores wall-clock time reported by the device
      expect(addCall.eventDateTime.toISOString()).toContain('2026-03-25T13:53:37');
    });

    it('should include all event details in stored record', async () => {
      const mockData = createMockEventData('7400');

      await service.processEvent('Reader1', '192.168.1.100', mockData);

      const addCall = mockEventBuffer.add.mock.calls[0][0];
      expect(addCall).toMatchObject({
        readerName: 'Reader1',
        readerIp: '192.168.1.100',
        employeeNo: '7400',
        cardNo: '0783293105',
        deviceName: 'DS-K1A802AMF-B',
        majorEventType: 5,
        subEventType: 1,
        cardReaderNo: 1,
        doorNo: 1,
        userType: 'normal',
        statusValue: 0,
      });
    });

    // Note: console.log tests removed — logEvent() is commented out in the service
  });
});
