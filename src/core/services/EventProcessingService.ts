import type { HikvisionEventData, RecordEvent } from '../domain/RecordEvent.js';
import { eventBuffer } from '../../infrastructure/buffer/EventBuffer.js';
import { readerStatusStore } from '../../stores/ReaderStatusStore.js';
import { logger } from '../../infrastructure/logging/logger.js';

export interface ProcessedEventResult {
  success: boolean;
  readerName: string;
  employeeNo: string | null;
  cardNo: string;
  eventType: 'valid' | 'invalid';
  eventDateTime: Date;
}

/**
 * Service for processing card access events from Hikvision devices
 */
export class EventProcessingService {
  /**
   * Process a raw event from a Hikvision device
   * Events are buffered and will be flushed to SQL by background worker
   */
  async processEvent(
    readerName: string,
    readerIp: string,
    data: HikvisionEventData
  ): Promise<ProcessedEventResult> {
    const evt = data.AccessControllerEvent;
    const employeeNo = evt.employeeNoString?.trim() || null;
    const cardNo = evt.cardNo;
    // Strip timezone info to get raw device time, then adjust UTC offset
    // so SQL stores the same wall-clock time the device reported
    const rawDate = new Date(data.dateTime.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, ''));
    const eventDateTime = new Date(rawDate.getTime() - rawDate.getTimezoneOffset() * 60 * 1000);

    const isValid = this.isRegisteredEmployee(employeeNo);
    const eventType: 'valid' | 'invalid' = isValid ? 'valid' : 'invalid';

    // Log the event to console
    // this.logEvent(readerName, eventType, employeeNo, cardNo, eventDateTime);

    // Create record event
    const recordEvent: RecordEvent = {
      readerName,
      readerIp,
      employeeNo,
      cardNo,
      eventDateTime,
      deviceName: evt.deviceName,
      majorEventType: evt.majorEventType,
      subEventType: evt.subEventType,
      cardReaderNo: evt.cardReaderNo,
      doorNo: evt.doorNo,
      userType: evt.userType,
      statusValue: evt.statusValue,
      createdAt: (() => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000); })(),
    };

    // Add to buffer (will be flushed to SQL by background worker)
    await eventBuffer.add(recordEvent);

    // Update reader status
    readerStatusStore.updateLastEventTime(readerName, eventDateTime);

    logger.info({
      reader: readerName,
      employeeNo,
      cardNo,
      eventType,
      bufferSize: eventBuffer.size(),
    }, 'Event processed and buffered');

    return {
      success: true,
      readerName,
      employeeNo,
      cardNo,
      eventType,
      eventDateTime,
    };
  }

  /**
   * Check if an employee number represents a registered employee
   */
  private isRegisteredEmployee(employeeNo: string | null): boolean {
    return employeeNo !== null && employeeNo !== '';
  }

  /**
   * Log event details to console
   */
  // private logEvent(
  //   readerName: string,
  //   eventType: 'valid' | 'invalid',
  //   employeeNo: string | null,
  //   cardNo: string,
  //   eventDateTime: Date
  // ): void {
  //   const date = eventDateTime.toLocaleDateString();
  //   const time = eventDateTime.toLocaleTimeString();

  //   if (eventType === 'valid') {
  //     console.log(`\n[${date} ${time}] Line: ${readerName} - Valid Card Event`);
  //     console.log(`[${date} ${time}] Line: ${readerName} - Employee: ${employeeNo} Card: ${cardNo}`);
  //   } else {
  //     console.log(`\n[${date} ${time}] Line: ${readerName} - Invalid Card Event`);
  //     console.log(`[${date} ${time}] Line: ${readerName} - Card: ${cardNo} Reason: Card unregistered`);
  //   }
  // }
}

export const eventProcessingService = new EventProcessingService();
