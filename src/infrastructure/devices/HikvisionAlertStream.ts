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
    this.url = `http://${config.ip}/ISAPI/Event/notification/alertStream`;
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
        alertService.sendReaderOfflineAlert(this.readerName, errorMessage)

        await this.notifyStatusChange(false, errorMessage);

        if (this.isRunning) {
          await this.delay(this.reconnectDelay);
        }
      }
    }
  }

  /**
   * Connect to device and process event stream
   */
  private async connectAndProcess(): Promise<void> {
    const signal = this.abortController?.signal;

    const response = await this.client.fetch(this.url, { signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    await this.notifyStatusChange(true);
    logger.info({ reader: this.readerName }, 'Connected to device alert stream');

    await this.processStream(response.body);
  }

  /**
   * Process the streaming response body
   */
  private async processStream(body: ReadableStream | null): Promise<void> {
    if (!body) {
      throw new Error('Response body is null');
    }

    const reader = body.getReader();
    let buffer = '';
    let braceCount = 0;
    let insideJson = false;

    try {
      while (this.isRunning) {
        const { value, done } = await reader.read();

        if (done) {
          logger.warn({ reader: this.readerName }, 'Stream ended, will reconnect');
          throw new Error('Stream ended');
        }

        const text = new TextDecoder().decode(value);
        await this.processBuffer(text, buffer, braceCount, insideJson, (newState) => {
          buffer = newState.buffer;
          braceCount = newState.braceCount;
          insideJson = newState.insideJson;
        });
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process incoming buffer character by character to extract JSON events
   */
  private async processBuffer(
    text: string,
    buffer: string,
    braceCount: number,
    insideJson: boolean,
    setState: (state: { buffer: string; braceCount: number; insideJson: boolean }) => void
  ): Promise<void> {
    for (const char of text) {
      if (char === '{') {
        braceCount++;
        insideJson = true;
      }

      if (insideJson) {
        buffer += char;
      }

      if (char === '}') {
        braceCount--;

        if (braceCount === 0 && insideJson) {
          await this.tryParseEvent(buffer);
          buffer = '';
          insideJson = false;
        }
      }
    }

    setState({ buffer, braceCount, insideJson });
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
