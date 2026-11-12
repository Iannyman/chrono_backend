import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockConfig } from '../../../helpers/mocks.js';

const { mockConnect, mockExecute, mockLogger, mockSendSystemAlert, mockPool, mockRequest } = vi.hoisted(() => {
  const request = {
    input: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    execute: vi.fn(),
  };
  const pool = { request: vi.fn(() => request) };

  return {
    mockConnect: vi.fn(),
    mockExecute: request.execute,
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    mockSendSystemAlert: vi.fn(),
    mockPool: pool,
    mockRequest: request,
  };
});

vi.mock('mssql', () => ({
  default: {
    connect: mockConnect,
    NVarChar: vi.fn(() => 'nvarchar'),
    MAX: 'MAX',
  },
}));

vi.mock('../../../../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../core/services/AlertService.js', () => ({
  alertService: {
    sendSystemAlert: mockSendSystemAlert,
  },
}));

import { SqlService } from '../../../../infrastructure/database/SqlService.js';
import type { RecordEvent } from '../../../../core/domain/RecordEvent.js';

describe('SqlService reader context in alerts', () => {
  const event: RecordEvent = {
    readerName: '304DWT',
    readerIp: '172.23.71.12',
    employeeNo: '7268',
    cardNo: 'card-1',
    eventDateTime: new Date('2026-11-05T06:35:00.000Z'),
    deviceName: 'Line 4 reader',
    cardReaderNo: 4,
    doorNo: 2,
    createdAt: new Date('2026-11-05T06:35:01.000Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(mockPool);
  });

  it('includes reader details in SQL Event alerts', async () => {
    mockExecute.mockResolvedValue({
      output: {
        result: JSON.stringify({
          success: false,
          message: 'Cannot insert duplicate key row',
        }),
      },
    });
    const service = new SqlService();
    await service.connect();

    await expect(service.insertLoginEvent(event)).rejects.toThrow('Cannot insert duplicate key row');

    expect(mockSendSystemAlert).toHaveBeenCalledWith(
      expect.stringContaining(
        'Reader Details\nReader: 304DWT\nReader IP: 172.23.71.12\nDevice name: Line 4 reader\nCard reader number: 4\nDoor number: 2\nEvent time: 2026-11-05T06:35:00.000Z',
      ),
      'SQL Event',
    );
  });

  it('includes reader details in SQL Connection alerts', async () => {
    const service = new SqlService();

    await expect(service.insertBatch([event])).rejects.toThrow('Batch insert failed: 1/1 events could not be inserted');

    expect(mockSendSystemAlert).toHaveBeenCalledWith(
      expect.stringContaining(
        'SQL Server not connected\n\nReader Details\nReader: 304DWT\nReader IP: 172.23.71.12\nDevice name: Line 4 reader\nCard reader number: 4\nDoor number: 2\nEvent time: 2026-11-05T06:35:00.000Z',
      ),
      'SQL Connection',
    );
    expect(mockRequest.input).not.toHaveBeenCalled();
  });
});
