import { z } from 'zod';

/**
 * Parameters for getting reader by name
 */
export const readerByNameSchema = z.object({
  name: z.string().min(1),
});

/**
 * Query parameters for filtering readers
 */
export const readerFilterSchema = z.object({
  online: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
});

export type ReaderFilter = z.infer<typeof readerFilterSchema>;
