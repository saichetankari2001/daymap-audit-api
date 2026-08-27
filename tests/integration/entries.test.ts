import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from './helpers/resetDb';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function entry(overrides: Record<string, unknown> = {}) {
  return {
    timestampUtc: '2026-08-27T06:41:45.000Z',
    tenantId: 'DaymapHostDev',
    schoolId: 'DaymapDev',
    userId: '1642',
    eventType: 'Read',
    entityType: 'Parent',
    entityId: '47',
    category: 'StudentProfile',
    application: 'ParentPortal',
    success: true,
    ...overrides,
  };
}

describe('POST /entries', () => {
  it('rejects an entry missing a required field', async () => {
    const res = await request(app)
      .post('/entries')
      .send({ tenantId: 'DaymapHostDev', schoolId: 'DaymapDev' });
    expect(res.status).toBe(422);
  });

  it('accepts a single entry and stores required fields, promoted columns, and extras', async () => {
    const res = await request(app)
      .post('/entries')
      .send(entry({ eventVersion: 1, data: { note: 'sample' } }));
    expect(res.status).toBe(201);
    expect(res.body.accepted).toBe(1);

    const stored = await prisma.entry.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0].tenantId).toBe('DaymapHostDev');
    expect(stored[0].schoolId).toBe('DaymapDev');
    expect(stored[0].userId).toBe('1642');
    expect(stored[0].eventType).toBe('Read');
    expect(stored[0].entityType).toBe('Parent');
    expect(stored[0].entityId).toBe('47');
    expect(stored[0].category).toBe('StudentProfile');
    expect(stored[0].application).toBe('ParentPortal');
    expect(stored[0].success).toBe(true);
    expect(stored[0].extra).toMatchObject({
      eventVersion: 1,
      data: { note: 'sample' },
    });
  });

  it('accepts an array of entries in one request', async () => {
    const res = await request(app)
      .post('/entries')
      .send([entry({ userId: 'u-1' }), entry({ userId: 'u-2' }), entry({ userId: 'u-3' })]);
    expect(res.status).toBe(201);
    expect(res.body.accepted).toBe(3);

    const stored = await prisma.entry.findMany();
    expect(stored).toHaveLength(3);
  });
});

describe('GET /entries filtering', () => {
  it('filters by tenantId and schoolId', async () => {
    await request(app)
      .post('/entries')
      .send([
        entry({ tenantId: 'DaymapHostDev', schoolId: 'DaymapDev' }),
        entry({ tenantId: 'OtherTenant', schoolId: 'OtherSchool' }),
      ]);

    const res = await request(app).get('/entries').query({ tenantId: 'DaymapHostDev' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].tenantId).toBe('DaymapHostDev');
  });

  it('filters by userId, the promoted column', async () => {
    await request(app)
      .post('/entries')
      .send([entry({ userId: '1642' }), entry({ userId: '9999' })]);

    const res = await request(app).get('/entries').query({ userId: '1642' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe('1642');
  });

  it('filters by eventType, entityType, application, and success', async () => {
    await request(app)
      .post('/entries')
      .send([
        entry({ eventType: 'Read', entityType: 'Parent', application: 'ParentPortal', success: true }),
        entry({ eventType: 'Delete', entityType: 'Staff', application: 'Daymap', success: false }),
      ]);

    const res = await request(app)
      .get('/entries')
      .query({ eventType: 'Delete', entityType: 'Staff', application: 'Daymap', success: 'false' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].eventType).toBe('Delete');
    expect(res.body.data[0].success).toBe(false);
  });

  it('filters by date range', async () => {
    await request(app)
      .post('/entries')
      .send([
        entry({ timestampUtc: '2026-01-01T00:00:00.000Z' }),
        entry({ timestampUtc: '2026-08-27T09:15:00.000Z' }),
      ]);

    const res = await request(app)
      .get('/entries')
      .query({ dateFrom: '2026-08-01T00:00:00.000Z', dateTo: '2026-08-31T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters on an arbitrary extra field not covered by a named column', async () => {
    await request(app)
      .post('/entries')
      .send([
        entry({ deviceType: 'desktop' }),
        entry({ deviceType: 'mobile' }),
      ]);

    const res = await request(app).get('/entries').query({ 'extra[deviceType]': 'mobile' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].extra.deviceType).toBe('mobile');
  });
});

describe('GET /entries snapshot-consistent pagination', () => {
  it('ignores entries written after the first page of a query was requested', async () => {
    // Three entries exist when the first page is requested.
    await request(app)
      .post('/entries')
      .send([entry({ userId: 'u-1' }), entry({ userId: 'u-2' }), entry({ userId: 'u-3' })]);

    const firstPage = await request(app).get('/entries').query({ limit: 2 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data).toHaveLength(2);
    const { nextCursor, snapshotSequence } = firstPage.body;
    expect(nextCursor).not.toBeNull();

    // More entries get written in between page 1 and page 2.
    await request(app)
      .post('/entries')
      .send([entry({ userId: 'u-4' }), entry({ userId: 'u-5' })]);

    // Page 2, using the cursor AND snapshot from page 1, should only see the
    // one remaining original entry — not the two written in between.
    const secondPage = await request(app)
      .get('/entries')
      .query({ limit: 2, cursor: nextCursor, snapshotSequence });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.nextCursor).toBeNull();

    // A completely fresh query (no snapshot) sees all 5.
    const freshQuery = await request(app).get('/entries').query({ limit: 50 });
    expect(freshQuery.body.data).toHaveLength(5);
  });
});
