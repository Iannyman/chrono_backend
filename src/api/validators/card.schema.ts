import { z } from 'zod';

export const createCardSchema = z.object({
  readerName: z.string().min(1),
  employeeNo: z.string().min(1),
  cardNo: z.string().min(1),
  cardType: z.string().default('normalCard'),
});

export const searchCardsSchema = z.object({
  readerName: z.string().min(1),
  employeeNoList: z.array(z.string()).optional(),
  maxResults: z.number().min(1).max(500).default(100),
  searchResultPosition: z.number().min(0).default(0),
});

export const modifyCardSchema = z.object({
  readerName: z.string().min(1),
  employeeNo: z.string().min(1),
  cardNo: z.string().optional(),
  cardType: z.string().optional(),
});

export const deleteCardSchema = z.object({
  readerName: z.string().min(1),
  employeeNoList: z.array(z.string().min(1)).min(1),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type SearchCardsInput = z.infer<typeof searchCardsSchema>;
export type ModifyCardInput = z.infer<typeof modifyCardSchema>;
export type DeleteCardInput = z.infer<typeof deleteCardSchema>;
