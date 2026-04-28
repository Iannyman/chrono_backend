import DigestFetch from 'digest-fetch';
import type { HikvisionEventData } from '../../core/domain/RecordEvent.js';
import { logger } from '../logging/logger.js';
import { alertService } from '../../core/services/AlertService.js';

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
 * Hikvision Alert Stream Client
 * Handles persistent HTTP streaming connection to Hikvision devices
 */
export class HikvisionAlertStream {
  private readonly readerName: string;
  private readonly ip: string;
  private readonly client: DigestFetch;
  private readonly url: string;
  private readonly reconnectDelay: number;
  private readonly onEvent?: EventCallback;
  private readonly onStatusChange?: StatusCallback;

  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(config: HikvisionAlertStreamConfig) {
    this.readerName = config.readerName;
    this.ip = config.ip;
    this.client = new DigestFetch(config.username, config.password);
    this.url = `http://${config.ip}/ISAPI/Event/notification/alertStream?format=json`;
    this.reconnectDelay = config.reconnectDelay ?? 3000;
    this.onEvent = config.onEvent;
    this.onStatusChange = config.onStatusChange;
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ reader: this.readerName, error: errorMessage }, 'Alert stream error');

        // Account lockout detection — back off longer on 401
        const isAuthError = errorMessage.includes('401');
        const delay = isAuthError ? 60000 : this.reconnectDelay;

        if (isAuthError) {
          logger.warn({ reader: this.readerName }, 'Auth failed — waiting 60s before retry to avoid device lockout');
        }

        alertService.sendReaderOfflineAlert(this.readerName, errorMessage);
        await this.notifyStatusChange(false, errorMessage);

        if (this.isRunning) {
          await this.delay(delay);
        }
      }
    }
  }

  /**
   * Connect to device and process event stream
   */
  private async connectAndProcess(): Promise<void> {
    const signal = this.abortController?.signal;

    const response = await this.client.fetch(this.url, {
      signal,
      headers: { 'Accept': 'multipart/mixed' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Extract boundary from Content-Type header
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
