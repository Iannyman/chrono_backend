import { z } from 'zod';

/**
 * Query parameters for filtering events
 */
export const eventFilterSchema = z.object({
  readerName: z.string().optional(),
  employeeNo: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * Parameters for getting event by ID
 */
export const eventByIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Parameters for getting events by reader name
 */
export const eventByReaderSchema = z.object({
  name: z.string().min(1),
});

/**
 * Parameters for getting events by employee ID
 */
export const eventByEmployeeSchema = z.object({
  id: z.string().min(1),
});

export type EventFilter = z.infer<typeof eventFilterSchema>;
