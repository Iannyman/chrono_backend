import { z } from 'zod';

export const sessionsDataDetailedSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  line_id: z.string().default(''),
  person_id: z.string().default(''),
});
