import DigestFetch from 'digest-fetch';
import type { HikvisionEventData } from '../../core/domain/RecordEvent.js';
import { logger } from '../logging/logger.js';
import { alertService } from '../../core/services/AlertService.js';

/** Response type returned by digest-fetch's fetch(). */
type AlertStreamResponse = Awaited<ReturnType<DigestFetch['fetch']>>;

export interface EventCallback {
  (data: HikvisionEventData): void | Promise<void>;
}

export interface StatusCallback {
  (online: boolean, error?: string): void | Promise<void>;
}

export interface HikvisionAlertStreamConfig {
  readerName: string;
  ip: string;
  username: string;
  password: string;
  reconnectDelay?: number;
  onEvent?: EventCallback;
  onStatusChange?: StatusCallback;
}

/**
 * Auth failure surfaced from the device, enriched by a userCheck probe with the
 * fields needed to back off correctly (lockStatus / unlockTime). Carried as a
 * typed error so listen() can distinguish a locked account from a wrong password.
 */
export class AlertStreamAuthError extends Error {
  readonly status: number;
  readonly lockStatus?: string;
  readonly unlockTime?: number; // seconds remaining until the device unlocks the account
  readonly retryLoginTime?: number;
  readonly credentialsValid?: boolean; // userCheck accepted the credentials (probe returned 200)

  constructor(
    message: string,
    opts: { status: number; lockStatus?: string; unlockTime?: number; retryLoginTime?: number; credentialsValid?: boolean },
  ) {
    super(message);
    this.name = 'AlertStreamAuthError';
    this.status = opts.status;
    this.lockStatus = opts.lockStatus;
    this.unlockTime = opts.unlockTime;
    this.retryLoginTime = opts.retryLoginTime;
    this.credentialsValid = opts.credentialsValid;
  }

  get isLocked(): boolean {
    return this.lockStatus === 'lock';
  }
}

/**
 * Hikvision Alert Stream Client
 * Handles persistent HTTP streaming connection to Hikvision devices
 */
export class HikvisionAlertStream {
  private readonly readerName: string;
  private readonly ip: string;
  private readonly username: string;
  private readonly password: string;
  private readonly url: string;
  private readonly reconnectDelay: number;
  private readonly onEvent?: EventCallback;
  private readonly onStatusChange?: StatusCallback;

  private isRunning = false;
  private abortController: AbortController | null = null;
  private consecutiveFailures = 0;
  private readonly offlineAlertThreshold = 2;

  constructor(config: HikvisionAlertStreamConfig) {
    this.readerName = config.readerName;
    this.ip = config.ip;
    this.username = config.username;
    this.password = config.password;
    this.url = `http://${config.ip}/ISAPI/Event/notification/alertStream?format=json`;
    this.reconnectDelay = config.reconnectDelay ?? 3000;
    this.onEvent = config.onEvent;
    this.onStatusChange = config.onStatusChange;
  }

  /**
   * Build a fresh digest client for a single connection attempt. We deliberately
   * do NOT reuse one across reconnects: digest-fetch caches the server nonce, and
   * resending a stale nonce after a stream drop / nonce TTL / challenge
   * invalidation makes Hikvision return a counted 401 (and eventually lock the
   * account). A fresh client mirrors curl's handshake and avoids the stale-nonce
   * failure entirely.
   */
  private createClient(): DigestFetch {
    return new DigestFetch(this.username, this.password);
  }

  /**
   * Start listening for events from the device
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn({ reader: this.readerName }, 'Alert stream already running');
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    logger.info({ reader: this.readerName, ip: this.ip }, 'Starting alert stream listener');

    await this.listen();
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    logger.info({ reader: this.readerName }, 'Alert stream listener stopped');
  }

  /**
   * Main listening loop with automatic reconnection
   */
  private async listen(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.connectAndProcess();
        this.consecutiveFailures = 0;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ reader: this.readerName, error: errorMessage }, 'Alert stream error');

        this.consecutiveFailures += 1;
        const delay = this.computeBackoff(error);

        // Only email after consecutive failures cross the threshold, so a single
        // recoverable blip (one that survived the in-connect retry) doesn't spam
        // an offline alert. notifyStatusChange still marks the reader offline.
        if (this.consecutiveFailures >= this.offlineAlertThreshold) {
          alertService.sendReaderOfflineAlert(this.readerName, errorMessage);
        } else {
          logger.debug(
            { reader: this.readerName, consecutiveFailures: this.consecutiveFailures },
            'Suppressing offline alert below threshold',
          );
        }
        await this.notifyStatusChange(false, errorMessage);

        if (this.isRunning) {
          await this.delay(delay);
        }
      }
    }
  }

  /**
   * Connect to device and process event stream.
   *
   * On a 401 we probe userCheck to learn why. If the probe says credentials are
   * valid (200) and the account isn't locked, the rejection is transient — some
   * reader firmware (e.g. 304W) sporadically rejects the first streaming
   * handshake and accepts the next one. Retry once before surfacing the failure,
   * so a recoverable blip doesn't trigger a false "reader offline" alarm. Bounded
   * to a single extra attempt, so it can't itself accumulate into a lockout.
   */
  private async connectAndProcess(): Promise<void> {
    const signal = this.abortController?.signal;

    const response = await this.fetchAlertStream(signal);
    if (response.ok) {
      await this.handleAlertStreamResponse(response);
      return;
    }

    const body = await response.text().catch(() => '<body unreadable>');

    // The alertStream path returns a bare 401 (empty body, no challenge) when the
    // account is locked, so the response itself doesn't say WHY. Probe the device's
    // userCheck endpoint once to recover lockStatus / unlockTime — that's how we tell
    // a locked account from a wrong password and back off correctly. Run only on 401
    // and at most once per failure so the probe doesn't itself extend the lock.
    if (response.status === 401) {
      const authError = await this.probeAuthStatus();
      if (authError) {
        if (authError.credentialsValid && !authError.isLocked) {
          const retryResponse = await this.fetchAlertStream(signal);
          if (retryResponse.ok) {
            logger.info({ reader: this.readerName }, 'Alert stream connected on retry after transient rejection');
            await this.handleAlertStreamResponse(retryResponse);
            return;
          }
        }

        logger.error(
          {
            reader: this.readerName,
            status: response.status,
            authDetail: authError.message,
            lockStatus: authError.lockStatus,
            unlockTime: authError.unlockTime,
            retryLoginTime: authError.retryLoginTime,
          },
          'Alert stream auth rejected by device',
        );
        throw authError;
      }
    }

    // Fallback for non-401 errors, or when the userCheck probe itself failed.
    const detail = this.extractAuthFailureDetail(body);
    logger.error({
      reader: this.readerName,
      status: response.status,
      statusText: response.statusText,
      server: response.headers.get('server') ?? '',
      contentType: response.headers.get('content-type') ?? '',
      wwwAuthenticate: response.headers.get('www-authenticate') ?? '',
      via: response.headers.get('via') ?? '',
      authDetail: detail,
      body,
    }, 'Alert stream rejected by device');

    throw new Error(`HTTP ${response.status}: ${detail ?? response.statusText}`);
  }

  /**
   * Open the alertStream with a fresh digest client (see createClient()).
   */
  private fetchAlertStream(signal: AbortSignal | undefined): Promise<AlertStreamResponse> {
    return this.createClient().fetch(this.url, {
      signal,
      headers: { 'Accept': 'multipart/mixed' },
    });
  }

  /**
   * Handle a successful (200) alertStream response: parse the multipart boundary
   * and begin processing the stream. Extracted so the initial attempt and the
   * transient-rejection retry share a single code path.
   */
  private async handleAlertStreamResponse(response: AlertStreamResponse): Promise<void> {
    const contentType = response.headers.get('content-type') ?? '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    const boundary = boundaryMatch ? boundaryMatch[1].trim().replace(/^"|"$/g, '') : null;

    if (!boundary) {
      logger.warn({ reader: this.readerName }, 'No boundary in Content-Type, falling back to brace-counting');
    }

    await this.notifyStatusChange(true);
    logger.info({ reader: this.readerName, boundary }, 'Connected to device alert stream');

    await this.processStream(response.body, boundary);
  }

  /**
   * Probe /ISAPI/Security/userCheck to find out why a 401 happened. The alertStream
   * endpoint returns a bare 401 with no body when the account is locked, but userCheck
   * returns a <userCheck> XML carrying lockStatus, unlockTime and retryLoginTime.
   * Returns null if the probe itself fails (network/parse) so the caller can fall back.
   */
  private async probeAuthStatus(): Promise<AlertStreamAuthError | null> {
    const probeUrl = `http://${this.ip}/ISAPI/Security/userCheck`;
    try {
      const response = await this.createClient().fetch(probeUrl, {
        headers: { 'Accept': 'application/xml' },
      });
      const body = await response.text().catch(() => '');

      const lockStatus = this.pickXml(body, 'lockStatus');
      const unlockTime = this.pickXmlInt(body, 'unlockTime');
      const retryLoginTime = this.pickXmlInt(body, 'retryLoginTime');
      const statusString = this.pickXml(body, 'statusString');

      // userCheck returned 200 ⇒ credentials are valid, so the alertStream 401 is
      // not an auth problem. On stricter reader firmware (e.g. 304W / DS-B300C886)
      // this is a transient rejection of the streaming endpoint that clears on the
      // next attempt — the stream is NOT disabled.
      if (response.ok) {
        logger.warn(
          { reader: this.readerName, probeStatus: response.status },
          'Credentials valid (userCheck 200) but alertStream rejected — transient device-side rejection, will retry',
        );
        return new AlertStreamAuthError(
          'HTTP 401: credentials valid but alertStream rejected',
          { status: 401, credentialsValid: true },
        );
      }

      const parts: string[] = [];
      if (statusString) parts.push(statusString);
      if (lockStatus) parts.push(`lock=${lockStatus}`);
      if (unlockTime !== undefined) parts.push(`unlockIn=${unlockTime}s`);
      if (retryLoginTime !== undefined) parts.push(`retriesLeft=${retryLoginTime}`);
      const detail = parts.length ? parts.join(', ') : `HTTP ${response.status}`;

      return new AlertStreamAuthError(`HTTP 401: ${detail}`, {
        status: 401,
        lockStatus,
        unlockTime,
        retryLoginTime,
      });
    } catch (error) {
      logger.warn(
        { reader: this.readerName, error: error instanceof Error ? error.message : String(error) },
        'userCheck probe failed; cannot determine lock status',
      );
      return null;
    }
  }

  /**
   * Parse a Hikvision XML_ResponseStatus_AuthenticationFailed body into a readable
   * detail string (statusString, lockStatus, retryTimes, resLockTime). Returns null
   * for empty / non-XML bodies.
   */
  private extractAuthFailureDetail(body: string): string | null {
    if (!body) return null;

    const statusCode = this.pickXml(body, 'statusCode');
    const statusString = this.pickXml(body, 'statusString');
    const lockStatus = this.pickXml(body, 'lockStatus');
    const retryTimes = this.pickXml(body, 'retryTimes');
    const resLockTime = this.pickXml(body, 'resLockTime');

    const parts: string[] = [];
    if (statusCode) parts.push(`code ${statusCode}`);
    if (statusString) parts.push(statusString);
    if (lockStatus) parts.push(`lock=${lockStatus}`);
    if (retryTimes) parts.push(`retriesLeft=${retryTimes}`);
    if (resLockTime) parts.push(`lockTime=${resLockTime}s`);

    return parts.length ? parts.join(', ') : null;
  }

  /**
   * Extract the trimmed text of the first <tag>...</tag> in body (case-insensitive).
   */
  private pickXml(body: string, tag: string): string | undefined {
    if (!body) return undefined;
    const match = body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
    const value = match?.[1].trim();
    return value || undefined;
  }

  /**
   * pickXml parsed as an integer, or undefined if missing / non-numeric.
   */
  private pickXmlInt(body: string, tag: string): number | undefined {
    const raw = this.pickXml(body, tag);
    if (raw === undefined) return undefined;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : n;
  }

  /**
   * Process the streaming response body
   */
  private async processStream(body: ReadableStream | null, boundary: string | null): Promise<void> {
    if (!body) {
      throw new Error('Response body is null');
    }

    const reader = body.getReader();
    let buffer = '';

    try {
      while (this.isRunning) {
        const { value, done } = await reader.read();

        if (done) {
          logger.warn({ reader: this.readerName }, 'Stream ended, will reconnect');
          throw new Error('Stream ended');
        }

        buffer += new TextDecoder().decode(value);

        if (boundary) {
          // Multipart boundary parsing
          const parts = buffer.split(`--${boundary}`);
          // Last part may be incomplete — keep it in the buffer
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const bodyText = this.stripMultipartHeaders(part);
            if (bodyText.trim()) {
              await this.tryParseEvent(bodyText.trim());
            }
          }
        } else {
          // Fallback: brace-counting parser
          buffer = await this.parseByBraceCount(buffer);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Strip multipart headers (everything before first blank line)
   */
  private stripMultipartHeaders(part: string): string {
    const idx = part.indexOf('\r\n\r\n');
    if (idx !== -1) return part.substring(idx + 4);
    // Try just \n\n as fallback
    const idx2 = part.indexOf('\n\n');
    if (idx2 !== -1) return part.substring(idx2 + 2);
    return part;
  }

  /**
   * Fallback brace-counting parser for devices that don't send boundaries
   */
  private async parseByBraceCount(buffer: string): Promise<string> {
    let braceCount = 0;
    let insideJson = false;
    let start = 0;

    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === '{') {
        if (braceCount === 0) start = i;
        braceCount++;
        insideJson = true;
      }
      if (buffer[i] === '}') {
        braceCount--;
        if (braceCount === 0 && insideJson) {
          await this.tryParseEvent(buffer.substring(start, i + 1));
          insideJson = false;
        }
      }
    }

    // Return remaining buffer (partial JSON)
    if (insideJson) return buffer.substring(start);
    return '';
  }

  /**
   * Try to parse and handle an event from JSON string
   */
  private async tryParseEvent(jsonString: string): Promise<void> {
    try {
      const data = JSON.parse(jsonString) as HikvisionEventData;

      if (this.isAccessControllerEvent(data)) {
        await this.onEvent?.(data);
      }
    } catch {
      // Silently ignore malformed JSON
    }
  }

  /**
   * Type guard to check if event is AccessControllerEvent
   */
  private isAccessControllerEvent(data: any): data is HikvisionEventData {
    return (
      data.eventType === 'AccessControllerEvent' &&
      data.AccessControllerEvent?.majorEventType === 5
    );
  }

  /**
   * Notify status change listeners
   */
  private async notifyStatusChange(online: boolean, error?: string): Promise<void> {
    await this.onStatusChange?.(online, error);
  }

  /**
   * Decide how long to wait before reconnecting after a failure.
   *
   * - Locked account: wait out the device's unlock window (+ buffer) so retries
   *   don't keep topping up the lock and turn it into a permanent lockout loop.
   * - Other auth failure (wrong creds / probe failed): back off 60s to avoid
   *   hammering the device into a lock.
   * - Anything else: the normal reconnect delay.
   */
  private computeBackoff(error: unknown): number {
    if (error instanceof AlertStreamAuthError) {
      if (error.isLocked && error.unlockTime !== undefined) {
        const waitSec = error.unlockTime + 30;
        logger.warn(
          { reader: this.readerName, unlockTime: error.unlockTime, retryLoginTime: error.retryLoginTime, waitSec },
          'Account locked — backing off until the unlock window expires',
        );
        return waitSec * 1000;
      }
      logger.warn({ reader: this.readerName }, 'Auth failed — waiting 60s before retry to avoid device lockout');
      return 60000;
    }

    return this.reconnectDelay;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create and start an alert stream for a reader
 */
export async function createAlertStream(
  readerName: string,
  ip: string,
  username: string,
  password: string,
  onEvent?: EventCallback,
  onStatusChange?: StatusCallback
): Promise<HikvisionAlertStream> {
  const stream = new HikvisionAlertStream({
    readerName,
    ip,
    username,
    password,
    onEvent,
    onStatusChange,
  });
  await stream.start();
  return stream;
}
