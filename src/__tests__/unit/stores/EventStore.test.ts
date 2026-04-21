import { describe, it, expect, beforeEach } from 'vitest';
import { eventStore } from '../../../stores/EventStore.js';
import type { RecordEvent } from '../../../core/domain/RecordEvent.js';

describe('EventStore', () => {
  // eventStore is a singleton — we clear before each test for isolation
  beforeEach(() => {
    eventStore.clear();
  });

  const createEvent = (readerName: string, employeeNo: string | null, cardNo = '123'): RecordEvent => ({
    readerName,
    readerIp: '192.168.1.100',
    employeeNo,
    cardNo,
    eventDateTime: new Date('2026-04-11T10:00:00Z'),
    createdAt: new Date('2026-04-11T10:00:00Z'),
  });

  it('should add and retrieve events', () => {
    const event = createEvent('Reader1', '7400');
    eventStore.add(event);

    const all = eventStore.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].readerName).toBe('Reader1');
  });

  it('should store multiple events in order', () => {
    eventStore.add(createEvent('Reader1', '1'));
    eventStore.add(createEvent('Reader2', '2'));
    eventStore.add(createEvent('Reader3', '3'));

    const all = eventStore.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].readerName).toBe('Reader1');
    expect(all[2].readerName).toBe('Reader3');
  });

  it('getByReader should return only matching events', () => {
    eventStore.add(createEvent('Reader1', '1'));
    eventStore.add(createEvent('Reader2', '2'));
    eventStore.add(createEvent('Reader1', '3'));

    const result = eventStore.getByReader('Reader1');
    expect(result).toHaveLength(2);
    expect(result.every(e => e.readerName === 'Reader1')).toBe(true);
  });

  it('getByReader should return empty array when no matches', () => {
    eventStore.add(createEvent('Reader1', '1'));

    expect(eventStore.getByReader('Reader99')).toEqual([]);
  });

  it('getByEmployee should return only matching events', () => {
    eventStore.add(createEvent('Reader1', '7400'));
    eventStore.add(createEvent('Reader2', '7401'));
    eventStore.add(createEvent('Reader3', '7400'));

    const result = eventStore.getByEmployee('7400');
    expect(result).toHaveLength(2);
    expect(result.every(e => e.employeeNo === '7400')).toBe(true);
  });

  it('getByEmployee should return empty array when no matches', () => {
    eventStore.add(createEvent('Reader1', '7400'));

    expect(eventStore.getByEmployee('9999')).toEqual([]);
  });

  it('getCount should return correct count', () => {
    expect(eventStore.getCount()).toBe(0);

    eventStore.add(createEvent('Reader1', '1'));
    expect(eventStore.getCount()).toBe(1);

    eventStore.add(createEvent('Reader2', '2'));
    expect(eventStore.getCount()).toBe(2);
  });

  it('clear should empty the store', () => {
    eventStore.add(createEvent('Reader1', '1'));
    eventStore.add(createEvent('Reader2', '2'));
    expect(eventStore.getCount()).toBe(2);

    eventStore.clear();

    expect(eventStore.getCount()).toBe(0);
    expect(eventStore.getAll()).toEqual([]);
  });
});
