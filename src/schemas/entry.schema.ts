import { z } from 'zod';

// Field names match Daymap's real audit log format (per the sample log
// Harry shared 2026-08-27): timestampUtc, tenantId, and schoolId are
// required. eventId, userId, eventType, entityType, entityId, category,
// application, and success are all common but not strictly required, and
// get pulled out into their own columns by the repository. Anything else
// (including the source format's `data` object and `eventVersion`) is
// preserved as-is via .passthrough() and ends up in the flexible `extra`
// field.
const entryFieldsSchema = z
  .object({
    timestampUtc: z.coerce.date(),
    tenantId: z.string().min(1),
    schoolId: z.string().min(1),
    eventId: z.string().optional(),
    userId: z.string().optional(),
    eventType: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    category: z.string().optional(),
    application: z.string().optional(),
    success: z.boolean().optional(),
  })
  .passthrough();

export const createEntrySchema = entryFieldsSchema;
export const createEntryBatchSchema = z.array(entryFieldsSchema).min(1).max(1000);

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

export const entryQuerySchema = z.object({
  tenantId: z.string().optional(),
  schoolId: z.string().optional(),
  userId: z.string().optional(),
  eventType: z.string().optional(),
  entityType: z.string().optional(),
  application: z.string().optional(),
  // Not z.coerce.boolean() — that does JS's Boolean(x), so the literal
  // string "false" (a non-empty string) would coerce to true.
  success: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  extra: z.record(z.string()).optional(),
  cursor: z.coerce.number().int().nonnegative().optional(),
  snapshotSequence: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

export type EntryQueryInput = z.infer<typeof entryQuerySchema>;
