import { z } from 'zod';

export const createPersonSchema = z.object({
  readerName: z.string().min(1),
  employeeNo: z.string().min(1),
  name: z.string().min(1),
  userType: z.string().default('normal'),
  valid: z.object({
    enable: z.boolean().default(true),
    beginTime: z.string().default('2020-01-01T00:00:00'),
    endTime: z.string().default('2030-12-31T23:59:59'),
  }).default({ enable: true, beginTime: '2020-01-01T00:00:00', endTime: '2030-12-31T23:59:59' }),
  doorRight: z.string().default('1'),
  rightPlan: z.array(z.object({
    doorNo: z.number(),
    planTemplateNo: z.string(),
  })).default([{ doorNo: 1, planTemplateNo: '1' }]),
});

export const searchPersonsSchema = z.object({
  readerName: z.string().min(1),
  employeeNoList: z.array(z.string()).optional(),
  maxResults: z.number().min(1).max(500).default(100),
  searchResultPosition: z.number().min(0).default(0),
});

export const modifyPersonSchema = z.object({
  readerName: z.string().min(1),
  employeeNo: z.string().min(1),
  name: z.string().optional(),
  userType: z.string().optional(),
  valid: z.object({
    enable: z.boolean(),
    beginTime: z.string(),
    endTime: z.string(),
  }).optional(),
  doorRight: z.string().optional(),
  rightPlan: z.array(z.object({
    doorNo: z.number(),
    planTemplateNo: z.string(),
  })).optional(),
});

export const deletePersonSchema = z.object({
  readerName: z.string().min(1),
  employeeNoList: z.array(z.string().min(1)).min(1),
});

export const personDetailsSchema = z.object({
  readerName: z.string().min(1),
  employeeNoList: z.array(z.string().min(1)).min(1),
});

export const createPersonWithCardSchema = z.object({
  readerName: z.string().min(1),
  employeeNo: z.string().min(1),
  name: z.string().min(1),
  cardNo: z.string().min(1),
  userType: z.string().default('normal'),
  cardType: z.string().default('normalCard'),
  valid: z.object({
    enable: z.boolean().default(true),
    beginTime: z.string().default('2020-01-01T00:00:00'),
    endTime: z.string().default('2030-12-31T23:59:59'),
  }).default({ enable: true, beginTime: '2020-01-01T00:00:00', endTime: '2030-12-31T23:59:59' }),
  doorRight: z.string().default('1'),
  rightPlan: z.array(z.object({
    doorNo: z.number(),
    planTemplateNo: z.string(),
  })).default([{ doorNo: 1, planTemplateNo: '1' }]),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type SearchPersonsInput = z.infer<typeof searchPersonsSchema>;
export type ModifyPersonInput = z.infer<typeof modifyPersonSchema>;
export type DeletePersonInput = z.infer<typeof deletePersonSchema>;
