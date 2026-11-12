import nodemailer from 'nodemailer';
import { config } from '../../config/index.js';
import { logger } from '../logging/logger.js';

export interface EmailResult {
  email: string;
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface ReaderAlertDiagnostics {
  ip?: string;
  endpoint?: string;
  errorName?: string;
  errorCode?: string;
  cause?: string;
}

/**
 * Email notification service
 * Handles sending email alerts for reader failures and system events
 */
export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private readonly SEND_COOLDOWN = 15 * 60 * 1000; // 15 minutes per subject
  private lastSentBySubject = new Map<string, number>();

  constructor() {
    this.initializeTransporter();
  }

  /**
   * Initialize the email transporter
   */
  private initializeTransporter(): void {
    if (!config.email.host) {
      logger.warn('SMTP host not configured, email service disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: config.email.user && config.email.pass ? {
        user: config.email.user,
        pass: config.email.pass,
      } : undefined,
      tls: {
        rejectUnauthorized: false, // Only for development/self-signed certs
      },
    });
  }

  /**
   * Send an email to configured recipients
   * @param message - Plain text message content
   * @param subject - Optional custom subject (overrides default)
   */
  async send(message: string, subject?: string): Promise<EmailResult[]> {
    if (!this.transporter) {
      logger.warn('Email service not configured, skipping email send');
      return [];
    }

    if (config.email.to.length === 0) {
      logger.warn('No email recipients configured');
      return [];
    }

    // Per-subject rate limit: one email per SEND_COOLDOWN per subject
    const emailSubject = subject || config.email.subject;
    const now = Date.now();
    const lastSent = this.lastSentBySubject.get(emailSubject) ?? 0;
    if (now - lastSent < this.SEND_COOLDOWN) {
      logger.warn({
        subject: emailSubject,
        cooldownRemaining: Math.ceil((this.SEND_COOLDOWN - (now - lastSent)) / 1000),
      }, 'Email rate limited, skipping send');
      return [];
    }

    const html = this.textToHtml(message);
    const results: EmailResult[] = [];

    for (const email of config.email.to) {
      try {
        const info = await this.transporter!.sendMail({
          from: config.email.from,
          to: email,
          subject: subject || config.email.subject,
          text: message,
          html: html,
        });

        logger.info({ email, messageId: info.messageId }, 'Email sent successfully');
        this.lastSentBySubject.set(emailSubject, Date.now());
        results.push({
          email,
          success: true,
          messageId: info.messageId,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ email, error: errorMessage }, 'Failed to send email');
        results.push({
          email,
          success: false,
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * Send an alert about reader communication failure
   * @param readerName - Name of the reader
   * @param error - Error message
   * @param diagnostics - Additional connection and error details, when available
   */
  async sendReaderAlert(readerName: string, error: string, diagnostics?: ReaderAlertDiagnostics): Promise<void> {
    const details = diagnostics
      ? [
          diagnostics.ip && `Reader IP: ${diagnostics.ip}`,
          diagnostics.endpoint && `Endpoint: ${diagnostics.endpoint}`,
          diagnostics.errorName && `Error type: ${diagnostics.errorName}`,
          diagnostics.errorCode && `Error code: ${diagnostics.errorCode}`,
          diagnostics.cause && `Underlying cause: ${diagnostics.cause}`,
          `Likely cause / next checks: ${this.getReaderTroubleshootingHint(error, diagnostics)}`,
        ].filter(Boolean).join('\n')
      : '';
    const message = `Reader Communication Alert\n\n` +
      `Reader: ${readerName}\n` +
      `Status: Offline\n` +
      `Error: ${error}\n` +
      (details ? `${details}\n` : '') +
      `Time: ${new Date().toISOString()}\n\n` +
      `Please check the device connectivity.`;

    await this.send(message, `Alert: Reader ${readerName} Offline`);
  }

  private getReaderTroubleshootingHint(error: string, diagnostics: ReaderAlertDiagnostics): string {
    const failure = [error, diagnostics.errorCode, diagnostics.cause].filter(Boolean).join(' ').toLowerCase();

    if (failure.includes('econnrefused')) {
      return 'The reader refused the connection. Confirm it is powered on, the configured IP is correct, and HTTP port 80 is reachable from this server.';
    }

    if (failure.includes('etimedout') || failure.includes('und_err_connect_timeout') || failure.includes('timed out')) {
      return 'The connection timed out. Check network routing or firewall rules and confirm the reader is reachable from this server.';
    }

    if (failure.includes('enotfound') || failure.includes('eai_again')) {
      return 'The reader address could not be resolved. Verify the configured address and DNS/network settings.';
    }

    if (failure.includes('econnreset') || failure.includes('und_err_socket') ||
        failure.includes('terminated') || failure.includes('socket hang up') ||
        failure.includes('stream ended')) {
      return 'The connection closed unexpectedly. Check for reader restarts, network interruptions, or issues with the device alert-stream service.';
    }

    if (failure.includes('http 401') || failure.includes('http 403') ||
        failure.includes('authentication') || failure.includes('unauthorized')) {
      return 'The reader rejected the request. Verify the configured reader credentials and check the error above for account-lock details.';
    }

    if (/http 5\d\d/.test(failure)) {
      return 'The reader returned a server error. Check the device health and alert-stream service, then retry.';
    }

    return 'Confirm the reader is powered on and reachable at the listed IP, and that its HTTP alert-stream service is available. Compare the error details with device and network logs.';
  }

  /**
   * Send a recovery notice about a reader that came back online
   * @param readerName - Name of the reader
   * @param offlineDuration - How long the reader was offline, e.g. "2m 30s"
   */
  async sendReaderBackOnlineAlert(readerName: string, offlineDuration: string): Promise<void> {
    const message = `Reader Recovery Notification\n\n` +
      `Reader: ${readerName}\n` +
      `Status: Back Online\n` +
      `Was offline for: ${offlineDuration}\n` +
      `Time: ${new Date().toISOString()}\n\n` +
      `The reader has reconnected and is streaming events again.`;

    await this.send(message, `Resolved: Reader ${readerName} Back Online`);
  }

  /**
   * Send a system alert
   * @param message - Alert message
   * @param subject - Optional custom subject
   */
  async sendSystemAlert(message: string, subject?: string): Promise<void> {
    const fullMessage = `System Alert\n\n${message}\n\nTime: ${new Date().toISOString()}`;
    await this.send(fullMessage, `Alert: ${subject}` || 'System Alert');
  }

  /**
   * Convert plain text to HTML for email formatting
   */
  private textToHtml(text: string): string {
    if (!text) return '';

    return text
      .replace(/\n/g, '<br>')
      .replace(/ {2}/g, '&nbsp;&nbsp;');
  }

  /**
   * Verify SMTP connection (for startup checks)
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified');
      return true;
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'SMTP connection verification failed');
      return false;
    }
  }
}

export const emailService = new EmailService();
