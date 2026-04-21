import { describe, it, expect } from 'vitest';
import { readerByNameSchema, readerFilterSchema } from '../../../../api/validators/reader.schema.js';

describe('readerByNameSchema', () => {
  it('should accept non-empty string', () => {
    const result = readerByNameSchema.parse({ name: 'Reader1' });
    expect(result.name).toBe('Reader1');
  });

  it('should reject empty string', () => {
    expect(() => readerByNameSchema.parse({ name: '' })).toThrow();
  });
});

describe('readerFilterSchema', () => {
  it('should accept valid input with online=true', () => {
    const result = readerFilterSchema.parse({ online: 'true' });
    expect(result.online).toBe('true');
  });

  it('should accept valid input with online=false', () => {
    const result = readerFilterSchema.parse({ online: 'false' });
    expect(result.online).toBe('false');
  });

  it('should reject invalid online value', () => {
    expect(() => readerFilterSchema.parse({ online: 'maybe' })).toThrow();
  });

  it('should apply defaults: limit=100, offset=0', () => {
    const result = readerFilterSchema.parse({});
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });

  it('should reject limit > 1000', () => {
    expect(() => readerFilterSchema.parse({ limit: 1001 })).toThrow();
  });

  it('should reject negative offset', () => {
    expect(() => readerFilterSchema.parse({ offset: -1 })).toThrow();
  });
});
