import { describe, it, expect } from 'vitest';
import { eventFilterSchema, eventByIdSchema, eventByReaderSchema, eventByEmployeeSchema } from '../../../../api/validators/event.schema.js';

describe('eventFilterSchema', () => {
  it('should accept valid full input with all optional fields', () => {
    const result = eventFilterSchema.parse({
      readerName: 'Reader1',
      employeeNo: '7400',
      startDate: '2026-04-11T00:00:00Z',
      endDate: '2026-04-11T23:59:59Z',
      limit: 50,
      offset: 10,
    });

    expect(result.readerName).toBe('Reader1');
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('should accept empty object and apply defaults', () => {
    const result = eventFilterSchema.parse({});

    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
    expect(result.readerName).toBeUndefined();
  });

  it('should reject limit > 1000', () => {
    expect(() => eventFilterSchema.parse({ limit: 1001 })).toThrow();
  });

  it('should reject limit < 1', () => {
    expect(() => eventFilterSchema.parse({ limit: 0 })).toThrow();
  });

  it('should reject invalid datetime for startDate', () => {
    expect(() => eventFilterSchema.parse({ startDate: 'not-a-date' })).toThrow();
  });

  it('should reject invalid datetime for endDate', () => {
    expect(() => eventFilterSchema.parse({ endDate: 'yesterday' })).toThrow();
  });
});

describe('eventByIdSchema', () => {
  it('should accept positive integer and coerce string to number', () => {
    const result = eventByIdSchema.parse({ id: '42' });
    expect(result.id).toBe(42);
  });

  it('should reject non-positive integer', () => {
    expect(() => eventByIdSchema.parse({ id: '-1' })).toThrow();
  });

  it('should reject zero', () => {
    expect(() => eventByIdSchema.parse({ id: '0' })).toThrow();
  });
});

describe('eventByReaderSchema', () => {
  it('should accept non-empty string', () => {
    const result = eventByReaderSchema.parse({ name: 'Reader1' });
    expect(result.name).toBe('Reader1');
  });

  it('should reject empty string', () => {
    expect(() => eventByReaderSchema.parse({ name: '' })).toThrow();
  });
});

describe('eventByEmployeeSchema', () => {
  it('should accept non-empty string', () => {
    const result = eventByEmployeeSchema.parse({ id: '7400' });
    expect(result.id).toBe('7400');
  });

  it('should reject empty string', () => {
    expect(() => eventByEmployeeSchema.parse({ id: '' })).toThrow();
  });
});
