import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { EntryRepository } from '../repositories/entry.repository';
import { CreateEntryInput } from '../schemas/entry.schema';

/**
 * Generates realistic sample audit data for demoing and testing against —
 * multiple tenants, each with several schools, a spread of users, event
 * types, and applications, matching the shape of Harry's real sample log
 * (2026-08-27). Usage: npm run seed [count] (default 300).
 */

const TENANTS = ['DaymapHostDev', 'RiverbendDistrict', 'HighlandUnified'];
const SCHOOLS_PER_TENANT: Record<string, string[]> = {
  DaymapHostDev: ['DaymapDev'],
  RiverbendDistrict: ['Riverbend-Primary', 'Riverbend-High'],
  HighlandUnified: ['Highland-Elementary', 'Highland-Middle', 'Highland-High'],
};
const EVENT_TYPES = ['Read', 'Update', 'Delete', 'Download'];
const ENTITY_TYPES = ['Parent', 'Staff', 'Student'];
const CATEGORIES = ['StudentProfile', 'Record', 'ParentContact', 'File', 'Notes'];
const APPLICATIONS = ['Daymap', 'ParentPortal', 'StudentPortal'];
const USER_IDS = Array.from({ length: 20 }, (_, i) => String(1000 + i));

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomTimestampWithinDays(days: number): string {
  const now = Date.now();
  const offsetMs = Math.floor(Math.random() * days * 24 * 60 * 60 * 1000);
  return new Date(now - offsetMs).toISOString();
}

function generateEntry(): CreateEntryInput {
  const tenantId = pick(TENANTS);
  const schoolId = pick(SCHOOLS_PER_TENANT[tenantId]);
  const success = Math.random() > 0.08; // ~8% failed-access entries, worth being able to search for

  return {
    timestampUtc: new Date(randomTimestampWithinDays(45)),
    tenantId,
    schoolId,
    userId: pick(USER_IDS),
    eventType: pick(EVENT_TYPES),
    entityType: pick(ENTITY_TYPES),
    entityId: String(Math.floor(Math.random() * 5000)),
    category: pick(CATEGORIES),
    application: pick(APPLICATIONS),
    success,
  };
}

async function main(): Promise<void> {
  const count = Number(process.argv[2]) || 300;
  const entries = Array.from({ length: count }, generateEntry);

  // Insert in batches of 500 to match how the real write path batches.
  const BATCH_SIZE = 500;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    await EntryRepository.createBatch(entries.slice(i, i + BATCH_SIZE));
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${count} sample entries across ${TENANTS.length} tenants ` +
      `(${Object.values(SCHOOLS_PER_TENANT).flat().length} schools total).`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to seed sample data:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
