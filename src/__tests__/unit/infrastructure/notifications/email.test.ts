import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockConfig } from '../../../helpers/mocks.js';

const { mockCreateTransport, mockSendMail } = vi.hoisted(() => ({
  mockCreateTransport: vi.fn(),
  mockSendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

vi.mock('../../../../config/index.js', () => ({
  config: mockConfig,
}));

vi.mock('../../../../infrastructure/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { EmailService } from '../../../../infrastructure/notifications/email.js';

describe('EmailService reader alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.email.host = 'smtp.example.com';
    mockConfig.email.to = ['ops@example.com'];
    mockSendMail.mockResolvedValue({ messageId: 'message-id' });
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
  });

  it('includes reader network details, nested cause, and likely checks', async () => {
    const service = new EmailService();

    await service.sendReaderAlert('Reader1', 'fetch failed', {
      ip: '192.168.1.100',
      endpoint: 'http://192.168.1.100/ISAPI/Event/notification/alertStream?format=json',
      errorName: 'TypeError',
      errorCode: 'ECONNREFUSED',
      cause: 'connect ECONNREFUSED 192.168.1.100:80',
    });

    const email = mockSendMail.mock.calls[0][0];
    expect(email.text).toContain('Error: fetch failed');
    expect(email.text).toContain('Reader IP: 192.168.1.100');
    expect(email.text).toContain('Endpoint: http://192.168.1.100/ISAPI/Event/notification/alertStream?format=json');
    expect(email.text).toContain('Error type: TypeError');
    expect(email.text).toContain('Error code: ECONNREFUSED');
    expect(email.text).toContain('Underlying cause: connect ECONNREFUSED 192.168.1.100:80');
    expect(email.text).toContain('The reader refused the connection.');
  });

  it('provides cautious guidance for a terminated stream', async () => {
    const service = new EmailService();

    await service.sendReaderAlert('Reader2', 'terminated', {
      ip: '192.168.1.101',
      endpoint: 'http://192.168.1.101/ISAPI/Event/notification/alertStream?format=json',
    });

    expect(mockSendMail.mock.calls[0][0].text).toContain(
      'The connection closed unexpectedly. Check for reader restarts, network interruptions, or issues with the device alert-stream service.',
    );
  });

  it('keeps the existing alert body when diagnostic context is unavailable', async () => {
    const service = new EmailService();

    await service.sendReaderAlert('Reader3', 'Connection lost');

    const message = mockSendMail.mock.calls[0][0].text as string;
    expect(message).toContain('Reader: Reader3\nStatus: Offline\nError: Connection lost\n');
    expect(message).not.toContain('Reader IP:');
    expect(message).not.toContain('Likely cause / next checks:');
  });
});
