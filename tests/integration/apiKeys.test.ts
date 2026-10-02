import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { resetDb } from './helpers/resetDb';
import { createTestKey } from './helpers/createTestKey';

const app = createApp();

let adminKey: string;

beforeEach(async () => {
  await resetDb();
  adminKey = await createTestKey({ permission: 'admin' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function entry(overrides: Record<string, unknown> = {}) {
  return {
    timestampUtc: '2026-08-27T06:41:45.000Z',
    tenantId: 'TenantA',
    schoolId: 'School1',
    eventType: 'Read',
    ...overrides,
  };
}

describe('Authentication', () => {
  it('rejects a write request with no API key', async () => {
    const res = await request(app).post('/entries').send(entry());
    expect(res.status).toBe(401);
  });

  it('rejects a read request with no API key', async () => {
    const res = await request(app).get('/entries');
    expect(res.status).toBe(401);
  });

  it('rejects an unrecognised API key', async () => {
    const res = await request(app).get('/entries').set('x-api-key', 'dma_not-a-real-key');
    expect(res.status).toBe(401);
  });
});

describe('Tenant-scoped keys', () => {
  it('can write to every school under its own tenant', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });

    const res1 = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ schoolId: 'School1' }));
    const res2 = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ schoolId: 'School2' }));

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  it('is rejected outside its own tenant', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });

    const res = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ tenantId: 'TenantB', schoolId: 'School9' }));
    expect(res.status).toBe(403);
  });
});

describe('School-scoped keys', () => {
  it('can write to its own school', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'school', scopeValue: 'School1', scopeTenantId: 'TenantA' }],
    });

    const res = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ tenantId: 'TenantA', schoolId: 'School1' }));
    expect(res.status).toBe(201);
  });

  it('is rejected for a sibling school under the same tenant', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'school', scopeValue: 'School1', scopeTenantId: 'TenantA' }],
    });

    const res = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ tenantId: 'TenantA', schoolId: 'School2' }));
    expect(res.status).toBe(403);
  });

  // Regression test: a school scope must be tied to (tenant, school) together,
  // not just a bare school ID — school IDs are not guaranteed unique across
  // tenants (Harry's data model has them as separate fields). A key scoped
  // to "SharedCode" under TenantA must NOT reach "SharedCode" under an
  // unrelated tenant just because the school ID string matches.
  it('is rejected for a same-named school under a DIFFERENT tenant', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'school', scopeValue: 'SharedCode', scopeTenantId: 'TenantA' }],
    });

    const sameTenant = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ tenantId: 'TenantA', schoolId: 'SharedCode' }));
    expect(sameTenant.status).toBe(201);

    const differentTenant = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ tenantId: 'UnrelatedTenant', schoolId: 'SharedCode' }));
    expect(differentTenant.status).toBe(403);
  });
});

describe('Case-insensitive identifier matching', () => {
  // Regression test for a known limitation: tenant/school scope checks were
  // doing exact string comparison, so a key scoped to "DaymapDev" would be
  // rejected for an otherwise-identical "daymapdev" — the same tenant, just
  // a different casing a caller happened to use. Identifiers should match
  // regardless of case on both the write-side permission check and the
  // read-side query scoping.
  it('a tenant-scoped key can write using a different case than the scope was created with', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'tenant', scopeValue: 'DaymapHostDev' }],
    });

    const res = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ tenantId: 'daymaphostdev', schoolId: 'DaymapDev' }));
    expect(res.status).toBe(201);
  });

  it('a school-scoped key can write using a different case for both tenant and school', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'school', scopeValue: 'DaymapDev', scopeTenantId: 'DaymapHostDev' }],
    });

    const res = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ tenantId: 'DAYMAPHOSTDEV', schoolId: 'daymapdev' }));
    expect(res.status).toBe(201);
  });

  it('read-side scoping also matches case-insensitively', async () => {
    await request(app)
      .post('/entries')
      .set('x-api-key', adminKey)
      .send(entry({ tenantId: 'DaymapHostDev', schoolId: 'DaymapDev' }));

    const readKey = await createTestKey({
      permission: 'read',
      scopes: [{ scopeType: 'tenant', scopeValue: 'daymaphostdev' }],
    });

    const res = await request(app).get('/entries').set('x-api-key', readKey).query({ limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('still rejects a genuinely different tenant, case aside', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'tenant', scopeValue: 'DaymapHostDev' }],
    });

    const res = await request(app)
      .post('/entries')
      .set('x-api-key', key)
      .send(entry({ tenantId: 'RiverbendDistrict', schoolId: 'Riverbend-High' }));
    expect(res.status).toBe(403);
  });
});

describe('Permission levels', () => {
  it('a read-only key cannot write, even within its own scope', async () => {
    const key = await createTestKey({
      permission: 'read',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });

    const res = await request(app).post('/entries').set('x-api-key', key).send(entry());
    expect(res.status).toBe(403);
  });

  it('a write-only key cannot read, even within its own scope', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });

    const res = await request(app).get('/entries').set('x-api-key', key);
    expect(res.status).toBe(403);
  });

  it('admin bypasses scoping entirely for both read and write', async () => {
    await request(app)
      .post('/entries')
      .set('x-api-key', adminKey)
      .send(entry({ tenantId: 'TenantX', schoolId: 'SchoolX' }));

    const res = await request(app).get('/entries').set('x-api-key', adminKey);
    expect(res.status).toBe(200);
    expect(res.body.data.some((e: { tenantId: string }) => e.tenantId === 'TenantX')).toBe(true);
  });
});

describe('Read-side scope enforcement', () => {
  it('scopes reads even when no filter is given', async () => {
    await request(app)
      .post('/entries')
      .set('x-api-key', adminKey)
      .send(entry({ tenantId: 'TenantA', schoolId: 'School1' }));
    await request(app)
      .post('/entries')
      .set('x-api-key', adminKey)
      .send(entry({ tenantId: 'TenantB', schoolId: 'School9' }));

    const readKey = await createTestKey({
      permission: 'read',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });

    const res = await request(app).get('/entries').set('x-api-key', readKey).query({ limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.data.every((e: { tenantId: string }) => e.tenantId === 'TenantA')).toBe(true);
  });

  it('does not leak out-of-scope data even if the caller explicitly asks for it via query params', async () => {
    await request(app)
      .post('/entries')
      .set('x-api-key', adminKey)
      .send(entry({ tenantId: 'TenantB', schoolId: 'School9' }));

    const readKey = await createTestKey({
      permission: 'read',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });

    const res = await request(app)
      .get('/entries')
      .set('x-api-key', readKey)
      .query({ tenantId: 'TenantB' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('Key management (admin only)', () => {
  it('lets an admin create a key', async () => {
    const res = await request(app)
      .post('/api-keys')
      .set('x-api-key', adminKey)
      .send({
        label: 'test key',
        permission: 'write',
        scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.rawKey).toMatch(/^dma_/);
  });

  it('rejects a non-admin key creating another key', async () => {
    const key = await createTestKey({
      permission: 'write',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });

    const res = await request(app)
      .post('/api-keys')
      .set('x-api-key', key)
      .send({ permission: 'read', scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }] });
    expect(res.status).toBe(403);
  });

  it('requires a "school" scope to include scopeTenantId', async () => {
    const res = await request(app)
      .post('/api-keys')
      .set('x-api-key', adminKey)
      .send({ permission: 'write', scopes: [{ scopeType: 'school', scopeValue: 'School1' }] });
    expect(res.status).toBe(422);
  });

  it('requires at least one scope for a non-admin key', async () => {
    const res = await request(app)
      .post('/api-keys')
      .set('x-api-key', adminKey)
      .send({ permission: 'write', scopes: [] });
    expect(res.status).toBe(422);
  });

  it('revokes a key, and the key is rejected immediately afterward', async () => {
    const createRes = await request(app)
      .post('/api-keys')
      .set('x-api-key', adminKey)
      .send({ permission: 'read', scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }] });
    const { id, rawKey } = createRes.body;

    const revokeRes = await request(app).delete(`/api-keys/${id}`).set('x-api-key', adminKey);
    expect(revokeRes.status).toBe(204);

    const useRes = await request(app).get('/entries').set('x-api-key', rawKey);
    expect(useRes.status).toBe(401);
  });
  
  it('rejects write requests immediately after a write key is revoked', async () => {
  const createRes = await request(app)
    .post('/api-keys')
    .set('x-api-key', adminKey)
    .send({
      permission: 'write',
      scopes: [{ scopeType: 'tenant', scopeValue: 'TenantA' }],
    });

  expect(createRes.status).toBe(201);

  const { id, rawKey } = createRes.body;

  const beforeRevoke = await request(app)
    .post('/entries')
    .set('x-api-key', rawKey)
    .send(entry());

  expect(beforeRevoke.status).toBe(201);

  const revokeRes = await request(app)
    .delete(`/api-keys/${id}`)
    .set('x-api-key', adminKey);

  expect(revokeRes.status).toBe(204);

  const afterRevoke = await request(app)
    .post('/entries')
    .set('x-api-key', rawKey)
    .send(entry());

  expect(afterRevoke.status).toBe(401);
});
});
