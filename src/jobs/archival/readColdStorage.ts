import fs from 'fs/promises';
import path from 'path';

/** One archived entry, as written by archive.ts (dates are ISO strings in the file). */
export interface ColdStorageEntry {
  timestampUtc: string;
  tenantId: string;
  schoolId: string;
  [field: string]: unknown;
}

export interface ColdStorageFilters {
  /** Calendar day, YYYY-MM-DD. Only that day's file is read. */
  day?: string;
  tenantId?: string;
  schoolId?: string;
  userId?: string;
  eventType?: string;
  /** Stop after this many matching entries. */
  limit?: number;
}

export class ColdStorageReadError extends Error {}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Tenant/school IDs are compared case-insensitively, same as the API's
// permission checks, so a search behaves the same here as it does there.
const sameText = (a: unknown, b: string): boolean =>
  typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

function matches(entry: ColdStorageEntry, f: ColdStorageFilters): boolean {
  if (f.tenantId !== undefined && !sameText(entry.tenantId, f.tenantId)) return false;
  if (f.schoolId !== undefined && !sameText(entry.schoolId, f.schoolId)) return false;
  if (f.userId !== undefined && entry.userId !== f.userId) return false;
  if (f.eventType !== undefined && entry.eventType !== f.eventType) return false;
  return true;
}

async function listDayFiles(dir: string, day?: string): Promise<string[]> {
  if (day !== undefined && !DAY_PATTERN.test(day)) {
    throw new ColdStorageReadError(`Invalid day "${day}": expected YYYY-MM-DD`);
  }
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  return names
    .filter((name) => name.endsWith('.jsonl') && (day === undefined || name === `${day}.jsonl`))
    .sort();
}

/**
 * Reads archived entries back out of the cold-storage folder, oldest day first.
 * This is a read-only maintenance tool. The API deliberately never reads cold
 * storage (the client confirmed archived data is not queried through it).
 */
export async function readColdStorage(
  dir: string,
  filters: ColdStorageFilters = {},
): Promise<ColdStorageEntry[]> {
  const results: ColdStorageEntry[] = [];

  for (const name of await listDayFiles(dir, filters.day)) {
    const contents = await fs.readFile(path.join(dir, name), 'utf-8');
    const lines = contents.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim() === '') continue;

      let entry: ColdStorageEntry;
      try {
        entry = JSON.parse(lines[i]) as ColdStorageEntry;
      } catch {
        throw new ColdStorageReadError(`${name} line ${i + 1} is not valid JSON`);
      }

      if (!matches(entry, filters)) continue;
      results.push(entry);
      if (filters.limit !== undefined && results.length >= filters.limit) return results;
    }
  }

  return results;
}
