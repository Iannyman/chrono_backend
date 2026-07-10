import { z } from 'zod';

const now = new Date();
const beginTime = `${now.getFullYear()}-01-01T00:00:00`;
const endTime = `${now.getFullYear() + 10}-12-31T23:59:59`;

export const createPersonSchema = z.object({
  readerName: z.string().min(1),
  employeeNo: z.string().min(1),
  name: z.string().min(1),
  userType: z.string().default('normal'),
  valid: z.object({
    enable: z.boolean().default(true),
    beginTime: z.string().default(beginTime),
    endTime: z.string().default(endTime),
  }).default({ enable: true, beginTime: beginTime, endTime: endTime }),
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
    beginTime: z.string().default(beginTime),
    endTime: z.string().default(endTime),
  }).default({ enable: true, beginTime: beginTime, endTime: endTime }),
  doorRight: z.string().default('1'),
  rightPlan: z.array(z.object({
    doorNo: z.number(),
    planTemplateNo: z.string(),
  })).default([{ doorNo: 1, planTemplateNo: '1' }]),
});

// POST /persons/import-persons - import persons + cards from an employee.json file
export const importPersonsSchema = z.object({
  // Defaults to every configured reader; pass a single name to target one.
  readerName: z.string().min(1).default('all'),
  // Resolved relative to the server's working directory (the project root).
  filePath: z.string().min(1).default('employee.json'),
  // Max employees processed in parallel. If omitted, defaults at runtime to the
  // number of target readers (one slot per reader keeps each device at ~1
  // concurrent request). Override only to push devices harder.
  concurrency: z.number().int().min(1).max(60).optional(),
}).default({}); // tolerate a missing body so the field defaults above apply

// Shape of a single entry in employee.json
export const employeeEntrySchema = z.object({
  Marca: z.string().min(1),
  Nume: z.string().min(1),
  Prenume: z.string().min(1),
  CodCartela: z.string().min(1),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type SearchPersonsInput = z.infer<typeof searchPersonsSchema>;
export type ModifyPersonInput = z.infer<typeof modifyPersonSchema>;
export type DeletePersonInput = z.infer<typeof deletePersonSchema>;
export type CreatePersonWithCardInput = z.infer<typeof createPersonWithCardSchema>;
export type ImportPersonsInput = z.infer<typeof importPersonsSchema>;
export type EmployeeEntry = z.infer<typeof employeeEntrySchema>;
