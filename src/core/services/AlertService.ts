import { emailService } from '../../infrastructure/notifications/email.js';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Reader alert tracking to prevent spam
 */
interface ReaderAlertState {
  lastAlertTime: number;
  consecutiveFailures: number;
  offlineSince: number; // when the first alert of the current outage streak was sent
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
      offlineSince: now,
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
        offlineSince: state.offlineSince,
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
   * Send a recovery alert for a reader that came back online after an outage we
   * alerted on. Fires only when an offline alert was actually sent (state exists),
   * so ordinary (re)connects — startup, single recoverable blips — never produce a
   * "back online" email. Clears the reader's alert state either way, so a fresh
   * outage starts counting from zero (and maxConsecutiveAlerts doesn't stay
   * exhausted from the previous one).
   * @param readerName - Name of the reader
   */
  async sendReaderOnlineAlert(readerName: string): Promise<void> {
    const state = this.readerStates.get(readerName);

    if (!state) {
      // No offline alert went out for this reader — nothing to resolve.
      logger.debug({ reader: readerName }, 'No prior offline alert, skipping back-online alert');
      return;
    }

    const offlineForMs = Date.now() - state.offlineSince;

    try {
      await emailService.sendReaderBackOnlineAlert(readerName, this.formatOfflineDuration(offlineForMs));

      logger.info({
        reader: readerName,
        offlineForMs,
      }, 'Reader back-online alert sent');
    } catch (error) {
      logger.error({
        reader: readerName,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to send reader back-online alert');
    } finally {
      this.clearReaderAlert(readerName);
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
   * Format a duration in ms as a compact human string, e.g. "45s", "2m 30s", "1h 05m".
   */
  private formatOfflineDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
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
