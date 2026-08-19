import { z } from 'zod';

// Required fields per the brief (date, jurisdiction, schoolCode); everything
// else is arbitrary and preserved as-is via .passthrough().
const entryFieldsSchema = z
  .object({
    date: z.coerce.date(),
    jurisdiction: z.string().min(1),
    schoolCode: z.string().min(1),
  })
  .passthrough();

export const createEntrySchema = entryFieldsSchema;
export const createEntryBatchSchema = z.array(entryFieldsSchema).min(1).max(1000);

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

export const entryQuerySchema = z.object({
  jurisdiction: z.string().optional(),
  schoolCode: z.string().optional(),
  userId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  extra: z.record(z.string()).optional(),
  cursor: z.coerce.number().int().nonnegative().optional(),
  snapshotSequence: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

export type EntryQueryInput = z.infer<typeof entryQuerySchema>;
