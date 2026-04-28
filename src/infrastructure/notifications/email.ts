import nodemailer from 'nodemailer';
import { config } from '../../config/index.js';
import { logger } from '../logging/logger.js';

export interface EmailResult {
  email: string;
  success: boolean;
  error?: string;
  messageId?: string;
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
   */
  async sendReaderAlert(readerName: string, error: string): Promise<void> {
    const message = `Reader Communication Alert\n\n` +
      `Reader: ${readerName}\n` +
      `Status: Offline\n` +
      `Error: ${error}\n` +
      `Time: ${new Date().toISOString()}\n\n` +
      `Please check the device connectivity.`;

    await this.send(message, `Alert: Reader ${readerName} Offline`);
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
