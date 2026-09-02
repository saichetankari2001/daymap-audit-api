import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from './helpers/resetDb';
import { createTestKey } from './helpers/createTestKey';
import { runArchivalPass } from '../../src/jobs/archival/archive';
import { ArchivalConfig } from '../../src/config/archival';

const app = createApp();

// A distant-past date is always past any retention window, however this
// test file's env vars are configured — avoids depending on / mutating
// process.env.RETENTION_DAYS.
const LONG_AGO = '2000-01-01T00:00:00.000Z';

let coldStorageDir: string;
let adminKey: string;

function testEntry(overrides: Record<string, unknown> = {}) {
  return {
    timestampUtc: LONG_AGO,
    tenantId: 'TenantA',
    schoolId: 'School1',
    eventType: 'Read',
    ...overrides,
  };
}

function testConfig(overrides: Partial<ArchivalConfig> = {}): ArchivalConfig {
  return {
    retentionDays: 30,
    coldStorageDir,
    batchSize: 500,
    cronSchedule: '0 2 * * *',
    ...overrides,
  };
}

// The HTTP endpoint tests go through loadArchivalConfig(), which reads
// COLD_STORAGE_DIR from process.env (set in .env.test) rather than the
// per-test temp dir used for direct runArchivalPass() calls below — clean
// that one up too so repeated runs don't accumulate files.
const envColdStorageDir = path.resolve(process.env.COLD_STORAGE_DIR ?? './cold-storage-test');

beforeEach(async () => {
  await resetDb();
  adminKey = await createTestKey({ permission: 'admin' });
  coldStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daymap-archival-test-'));
  await fs.rm(envColdStorageDir, { recursive: true, force: true });
});

afterEach(async () => {
  await fs.rm(coldStorageDir, { recursive: true, force: true });
  await fs.rm(envColdStorageDir, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runArchivalPass', () => {
  it('moves entries older than the cutoff to a cold-storage file and removes them from Postgres', async () => {
    await request(app).post('/entries').set('x-api-key', adminKey).send(testEntry());

    const result = await runArchivalPass(testConfig());
    expect(result.entriesArchived).toBe(1);
    expect(result.filesWritten).toHaveLength(1);

    const remaining = await prisma.entry.findMany();
    expect(remaining).toHaveLength(0);

    const fileContents = await fs.readFile(result.filesWritten[0], 'utf-8');
    expect(fileContents).toContain('"tenantId":"TenantA"');
  });

  it('leaves recent entries untouched', async () => {
    await request(app)
      .post('/entries')
      .set('x-api-key', adminKey)
      .send(testEntry({ timestampUtc: new Date().toISOString() }));

    const result = await runArchivalPass(testConfig());
    expect(result.entriesArchived).toBe(0);

    const remaining = await prisma.entry.findMany();
    expect(remaining).toHaveLength(1);
  });

  it('is a no-op when nothing is eligible for archival', async () => {
    const result = await runArchivalPass(testConfig());
    expect(result.entriesArchived).toBe(0);
    expect(result.batchesProcessed).toBe(0);
    expect(result.filesWritten).toHaveLength(0);
  });

  it('respects a shorter, configurable retention window', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await request(app)
      .post('/entries')
      .set('x-api-key', adminKey)
      .send(testEntry({ timestampUtc: twoDaysAgo }));

    // With the default 30-day retention, this entry is untouched.
    const longRetention = await runArchivalPass(testConfig({ retentionDays: 30 }));
    expect(longRetention.entriesArchived).toBe(0);

    // With a 1-day retention window, the same entry is now eligible.
    const shortRetention = await runArchivalPass(testConfig({ retentionDays: 1 }));
    expect(shortRetention.entriesArchived).toBe(1);
  });

  it('splits entries into separate files by calendar day', async () => {
    await request(app)
      .post('/entries')
      .set('x-api-key', adminKey)
      .send([
        testEntry({ timestampUtc: '2020-01-01T00:00:00.000Z' }),
        testEntry({ timestampUtc: '2020-06-15T00:00:00.000Z' }),
      ]);

    const result = await runArchivalPass(testConfig());
    expect(result.entriesArchived).toBe(2);
    expect(result.filesWritten).toHaveLength(2);
    expect(result.filesWritten.some((f) => f.endsWith('2020-01-01.jsonl'))).toBe(true);
    expect(result.filesWritten.some((f) => f.endsWith('2020-06-15.jsonl'))).toBe(true);
  });
});

describe('Archival HTTP endpoints', () => {
  it('POST /admin/archive requires admin permission', async () => {
    const writeKey = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });
    const res = await request(app).post('/admin/archive').set('x-api-key', writeKey);
    expect(res.status).toBe(403);
  });

  it('POST /admin/archive triggers a run and returns a summary', async () => {
    await request(app).post('/entries').set('x-api-key', adminKey).send(testEntry());

    const res = await request(app).post('/admin/archive').set('x-api-key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body.entriesArchived).toBeGreaterThanOrEqual(0);
  });

  it('GET /admin/cold-storage requires admin permission', async () => {
    const readKey = await createTestKey({
      permission: 'read',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });
    const res = await request(app).get('/admin/cold-storage').set('x-api-key', readKey);
    expect(res.status).toBe(403);
  });
});
