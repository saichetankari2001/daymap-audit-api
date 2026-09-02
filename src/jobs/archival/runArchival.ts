import 'dotenv/config';
import cron from 'node-cron';
import { prisma } from '../../lib/prisma';
import { loadArchivalConfig } from '../../config/archival';
import { runArchivalPass } from './archive';

/* eslint-disable no-console */

async function runOnce(): Promise<void> {
  const config = loadArchivalConfig();
  console.log(`[archival] retention=${config.retentionDays}d, dir=${config.coldStorageDir}`);

  const result = await runArchivalPass(config);
  console.log(
    `[archival] archived ${result.entriesArchived} entries across ${result.batchesProcessed} batch(es), ` +
      `${result.filesWritten.length} file(s) touched`,
  );
}

async function main(): Promise<void> {
  if (!process.argv.includes('--schedule')) {
    await runOnce();
    await prisma.$disconnect();
    return;
  }

  const config = loadArchivalConfig();
  console.log(`[archival] scheduling with cron "${config.cronSchedule}"`);
  cron.schedule(config.cronSchedule, () => {
    runOnce().catch((err) => console.error('[archival] scheduled run failed:', err));
  });
  await runOnce(); // also run once immediately so --schedule is easy to demo
}

main().catch(async (err) => {
  console.error('[archival] fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
