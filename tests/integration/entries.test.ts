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
    date: '2026-08-18T09:15:00.000Z',
    jurisdiction: 'Victoria',
    schoolCode: 'SCH-4471',
    userId: 'u-8823',
    username: 'mrs.patel',
    userType: 'teacher',
    resourceType: 'attendance_record',
    resourceId: 'student-5521',
    ...overrides,
  };
}

describe('POST /entries', () => {
  it('rejects an entry missing a required field', async () => {
    const res = await request(app)
      .post('/entries')
      .send({ jurisdiction: 'Victoria', schoolCode: 'SCH-4471' });
    expect(res.status).toBe(422);
  });

  it('accepts a single entry and stores required fields, userId, and extras', async () => {
    const res = await request(app).post('/entries').send(entry());
    expect(res.status).toBe(201);
    expect(res.body.accepted).toBe(1);

    const stored = await prisma.entry.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0].jurisdiction).toBe('Victoria');
    expect(stored[0].schoolCode).toBe('SCH-4471');
    expect(stored[0].userId).toBe('u-8823');
    expect(stored[0].extra).toMatchObject({
      username: 'mrs.patel',
      userType: 'teacher',
      resourceType: 'attendance_record',
      resourceId: 'student-5521',
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
  it('filters by jurisdiction and schoolCode', async () => {
    await request(app)
      .post('/entries')
      .send([
        entry({ jurisdiction: 'Victoria', schoolCode: 'SCH-4471' }),
        entry({ jurisdiction: 'NSW', schoolCode: 'SCH-9001' }),
      ]);

    const res = await request(app).get('/entries').query({ jurisdiction: 'Victoria' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].jurisdiction).toBe('Victoria');
  });

  it('filters by userId, the promoted column', async () => {
    await request(app)
      .post('/entries')
      .send([entry({ userId: 'u-8823' }), entry({ userId: 'u-9999' })]);

    const res = await request(app).get('/entries').query({ userId: 'u-8823' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe('u-8823');
  });

  it('filters by date range', async () => {
    await request(app)
      .post('/entries')
      .send([
        entry({ date: '2026-01-01T00:00:00.000Z' }),
        entry({ date: '2026-08-18T09:15:00.000Z' }),
      ]);

    const res = await request(app)
      .get('/entries')
      .query({ dateFrom: '2026-08-01T00:00:00.000Z', dateTo: '2026-08-31T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters on an arbitrary extra field (not a required field)', async () => {
    await request(app)
      .post('/entries')
      .send([
        entry({ resourceType: 'attendance_record' }),
        entry({ resourceType: 'health_record' }),
      ]);

    const res = await request(app)
      .get('/entries')
      .query({ 'extra[resourceType]': 'health_record' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].extra.resourceType).toBe('health_record');
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
