import { emailService } from '../../infrastructure/notifications/email.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Reader alert tracking to prevent spam
 */
interface ReaderAlertState {
  lastAlertTime: number;
  consecutiveFailures: number;
}

/**
 * Service for managing alerts and notifications
 * Handles rate limiting and deduplication of alerts
 */
export class AlertService {
  private readonly alertCooldown = 15 * 60 * 1000; // 15 minutes between alerts for same reader
  private readonly maxConsecutiveAlerts = 3;
  private readerStates = new Map<string, ReaderAlertState>();

  /**
   * Send an alert for a reader that has gone offline
   * @param readerName - Name of the reader
   * @param error - Error message
   */
  async sendReaderOfflineAlert(readerName: string, error: string): Promise<void> {
    const now = Date.now();
    const state = this.readerStates.get(readerName) || {
      lastAlertTime: 0,
      consecutiveFailures: 0,
    };

    // Per-reader rate limiting (cooldown + max consecutive alerts)
    const timeSinceLastAlert = now - state.lastAlertTime;
    const withinCooldown = timeSinceLastAlert <= this.alertCooldown;
    const exceededMaxAlerts = state.consecutiveFailures >= this.maxConsecutiveAlerts;

    if (withinCooldown || exceededMaxAlerts) {
      logger.debug({
        reader: readerName,
        timeSinceLastAlert,
        consecutiveFailures: state.consecutiveFailures,
      }, 'Skipping alert due to rate limit');
      return;
    }

    // Send the alert
    try {
      await emailService.sendReaderAlert(readerName, error);

      // Update state
      this.readerStates.set(readerName, {
        lastAlertTime: now,
        consecutiveFailures: state.consecutiveFailures + 1,
      });

      logger.info({
        reader: readerName,
        consecutiveFailures: state.consecutiveFailures + 1,
      }, 'Reader offline alert sent');
    } catch (error) {
      logger.error({
        reader: readerName,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to send reader offline alert');
    }
  }

  /**
   * Clear alert state for a reader (called when reader comes back online)
   * @param readerName - Name of the reader
   */
  clearReaderAlert(readerName: string): void {
    this.readerStates.delete(readerName);
    logger.debug({ reader: readerName }, 'Reader alert state cleared');
  }

  /**
   * Send a system alert for critical issues
   * @param message - Alert message
   * @param subject - Optional custom subject
   */
  async sendSystemAlert(message: string, subject?: string): Promise<void> {
    try {
      await emailService.sendSystemAlert(message, subject);
      logger.info('System alert sent');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to send system alert');
    }
  }

  /**
   * Get current alert states (for monitoring)
   */
  getAlertStates(): Map<string, ReaderAlertState> {
    return new Map(this.readerStates);
  }

  /**
   * Reset all alert states
   */
  resetAll(): void {
    this.readerStates.clear();
    logger.info('All alert states reset');
  }
}

export const alertService = new AlertService();
