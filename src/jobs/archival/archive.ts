import fs from 'fs/promises';
import path from 'path';
import { Entry } from '@prisma/client';
import { ArchivalRepository } from '../../repositories/archival.repository';
import { ArchivalConfig, computeCutoffDate } from '../../config/archival';

export interface ArchivalRunResult {
  cutoffDate: Date;
  batchesProcessed: number;
  entriesArchived: number;
  filesWritten: string[];
}

function groupByDay(entries: Entry[]): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const day = entry.timestampUtc.toISOString().slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), entry]);
  }
  return groups;
}

/** Appends to that day's file as newline-delimited JSON, so appending stays cheap at scale. */
async function appendToDayFile(dir: string, day: string, entries: Entry[]): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${day}.jsonl`);
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.appendFile(filePath, lines, 'utf-8');
  return filePath;
}

/**
 * Moves entries past the retention window from Postgres to cold storage.
 * Writes to disk before deleting from Postgres, so a crash mid-run never
 * loses data (worst case: an entry is written to disk twice).
 */
export async function runArchivalPass(config: ArchivalConfig): Promise<ArchivalRunResult> {
  const cutoffDate = computeCutoffDate(config.retentionDays);
  const filesWritten = new Set<string>();
  let batchesProcessed = 0;
  let entriesArchived = 0;

  for (;;) {
    const batch = await ArchivalRepository.findBatchOlderThan(cutoffDate, config.batchSize);
    if (batch.length === 0) break;

    for (const [day, entries] of groupByDay(batch)) {
      filesWritten.add(await appendToDayFile(config.coldStorageDir, day, entries));
    }
    await ArchivalRepository.deleteByIds(batch.map((e) => e.id));

    batchesProcessed += 1;
    entriesArchived += batch.length;
    if (batch.length < config.batchSize) break;
  }

  return { cutoffDate, batchesProcessed, entriesArchived, filesWritten: [...filesWritten] };
}
