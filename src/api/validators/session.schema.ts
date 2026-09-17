import { z } from 'zod';

export const sessionsDataDetailedSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
  line_id: z.string().default('').optional(),
  person_id: z.string().default('').optional(),
}).passthrough().refine(
  data => {
    // allow empty payload {}
    if (Object.keys(data).length === 0) return true;

    // allowed keys only
    const allowed = ['from', 'to', 'line_id', 'person_id'];
    return Object.keys(data).every(key => allowed.includes(key));
  },
  {
    message: 'Only "from", "to", "line_id", and "person_id" are allowed in payload'
  }
);

export const sessionsDataLiveSchema = z.object({
  line_id: z.string().default('')
}).passthrough().refine(
  data => {
    // allow empty payload {}
    if (Object.keys(data).length === 0) return true;

    // allow only payloads that contain line_id
    return Object.keys(data).every(key => key === 'line_id');
  },
  {
    message: 'Only "line_id" is allowed in payload'
  }
);

export const sessionsDataEditSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
  line_id: z.string().default('').optional(),
  log_id: z.string()
}).passthrough().refine(
  data => {
    // allow empty payload {}
    if (Object.keys(data).length === 0) return true;

    // allowed keys only
    const allowed = ['log_id', 'from', 'to', 'line_id'];
    return Object.keys(data).every(key => allowed.includes(key));
  },
  {
    message: 'Only "from", "to", "line_id", and "log_id" are allowed in payload'
  }
);