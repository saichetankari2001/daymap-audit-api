import 'dotenv/config';
import { loadArchivalConfig } from '../config/archival';
import { ColdStorageFilters, readColdStorage } from '../jobs/archival/readColdStorage';

/* eslint-disable no-console */

/**
 * Usage:
 *   npm run cold-storage:read -- --day 2026-09-16 --tenant RiverbendDistrict --limit 5
 *
 * Flags (all optional): --day, --tenant, --school, --user, --event, --limit
 */

const FLAGS: Record<string, keyof ColdStorageFilters> = {
  '--day': 'day',
  '--tenant': 'tenantId',
  '--school': 'schoolId',
  '--user': 'userId',
  '--event': 'eventType',
  '--limit': 'limit',
};

function parseArgs(args: string[]): ColdStorageFilters {
  const filters: Record<string, string | number> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = FLAGS[args[i]];
    const value = args[i + 1];
    if (!key || value === undefined) {
      throw new Error(`Unknown or incomplete flag "${args[i]}". Allowed: ${Object.keys(FLAGS)}`);
    }
    if (key === 'limit') {
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit <= 0)
        throw new Error('--limit must be a positive whole number');
      filters[key] = limit;
    } else {
      filters[key] = value;
    }
  }
  return filters as ColdStorageFilters;
}

async function main(): Promise<void> {
  const filters = parseArgs(process.argv.slice(2));
  const { coldStorageDir } = loadArchivalConfig();

  const entries = await readColdStorage(coldStorageDir, filters);
  for (const entry of entries) console.log(JSON.stringify(entry));
  console.error(
    `[cold-storage] ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from ${coldStorageDir}`,
  );
}

main().catch((err) => {
  console.error(`[cold-storage] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
