import type { RecordEvent } from '../core/domain/RecordEvent.js';

/**
 * In-memory event storage
 * TODO: Replace with database persistence
 */
class EventStore {
  private events: RecordEvent[] = [];

  add(event: RecordEvent): void {
    this.events.push(event);
  }

  getAll(): RecordEvent[] {
    return this.events;
  }

  getByReader(readerName: string): RecordEvent[] {
    return this.events.filter(e => e.readerName === readerName);
  }

  getByEmployee(employeeNo: string): RecordEvent[] {
    return this.events.filter(e => e.employeeNo === employeeNo);
  }

  getCount(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
  }
}

export const eventStore = new EventStore();
