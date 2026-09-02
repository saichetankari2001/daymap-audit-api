import { z } from 'zod';
import path from 'path';

// Separate from src/config/env.ts so the API server doesn't need archival
// env vars set to boot, and vice versa.
const archivalEnvSchema = z.object({
  RETENTION_DAYS: z.coerce.number().int().nonnegative().default(30),
  COLD_STORAGE_DIR: z.string().default('./cold-storage'),
  ARCHIVE_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  ARCHIVAL_CRON: z.string().default('0 2 * * *'),
});

export interface ArchivalConfig {
  retentionDays: number;
  coldStorageDir: string;
  batchSize: number;
  cronSchedule: string;
}

export class ArchivalEnvValidationError extends Error {}

export function loadArchivalConfig(source: NodeJS.ProcessEnv = process.env): ArchivalConfig {
  const result = archivalEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ArchivalEnvValidationError(`Invalid archival configuration: ${issues}`);
  }
  return {
    retentionDays: result.data.RETENTION_DAYS,
    coldStorageDir: path.resolve(result.data.COLD_STORAGE_DIR),
    batchSize: result.data.ARCHIVE_BATCH_SIZE,
    cronSchedule: result.data.ARCHIVAL_CRON,
  };
}

/** Entries with `timestampUtc` before this cutoff are eligible for archival. */
export function computeCutoffDate(retentionDays: number, now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff;
}
