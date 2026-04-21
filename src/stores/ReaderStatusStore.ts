import type { Reader } from '../core/domain/Reader.js';

/**
 * In-memory reader status storage
 * TODO: Replace with database persistence
 */
class ReaderStatusStore {
  private readers = new Map<string, Reader>();

  initialize(readers: Array<{ name: string; ip: string }>): void {
    for (const reader of readers) {
      if (!this.readers.has(reader.name)) {
        this.readers.set(reader.name, {
          name: reader.name,
          ip: reader.ip,
          isOnline: false,
          lastEventDateTime: null,
          lastError: null,
          updatedAt: new Date(),
        });
      }
    }
  }

  setOnline(name: string): void {
    const reader = this.readers.get(name);
    if (reader) {
      reader.isOnline = true;
      reader.lastError = null;
      reader.updatedAt = new Date();
    }
  }

  setOffline(name: string, error?: string): void {
    const reader = this.readers.get(name);
    if (reader) {
      reader.isOnline = false;
      reader.lastError = error || 'Connection lost';
      reader.updatedAt = new Date();
    }
  }

  updateLastEventTime(name: string, eventTime: Date): void {
    const reader = this.readers.get(name);
    if (reader) {
      reader.isOnline = true;
      reader.lastEventDateTime = eventTime;
      reader.lastError = null;
      reader.updatedAt = new Date();
    }
  }

  getByName(name: string): Reader | undefined {
    return this.readers.get(name);
  }

  getAll(): Reader[] {
    return Array.from(this.readers.values());
  }

  getOnline(): Reader[] {
    return this.getAll().filter(r => r.isOnline);
  }

  getOffline(): Reader[] {
    return this.getAll().filter(r => !r.isOnline);
  }
}

export const readerStatusStore = new ReaderStatusStore();
