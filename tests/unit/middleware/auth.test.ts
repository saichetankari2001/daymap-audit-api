import { describe, it, expect } from '@jest/globals';
import { keyCanAccess, AuthedKey } from '../../../src/middleware/auth';

// Builds a fake key so each test only sets the parts it cares about.
function makeKey(overrides: Partial<AuthedKey> = {}): AuthedKey {
  return {
    id: 'test-key',
    permission: 'read',
    isAdmin: false,
    tenants: [],
    schools: [],
    ...overrides,
  };
}

describe('keyCanAccess', () => {
  it('lets an admin key access any tenant and school', () => {
    const key = makeKey({ permission: 'admin', isAdmin: true });
    expect(keyCanAccess(key, 'AnyTenant', 'AnySchool')).toBe(true);
  });

  it('lets a tenant key access every school in that tenant', () => {
    const key = makeKey({ tenants: ['TenantA'] });
    expect(keyCanAccess(key, 'TenantA', 'School1')).toBe(true);
    expect(keyCanAccess(key, 'TenantA', 'School2')).toBe(true);
  });

  it('blocks a tenant key from a different tenant', () => {
    const key = makeKey({ tenants: ['TenantA'] });
    expect(keyCanAccess(key, 'TenantB', 'School1')).toBe(false);
  });

  it('lets a school key access only its own school', () => {
    const key = makeKey({ schools: [{ tenantId: 'TenantA', schoolId: 'School1' }] });
    expect(keyCanAccess(key, 'TenantA', 'School1')).toBe(true);
    expect(keyCanAccess(key, 'TenantA', 'School2')).toBe(false);
  });

  it('blocks a school key from a same-named school in another tenant', () => {
    const key = makeKey({ schools: [{ tenantId: 'TenantA', schoolId: 'School1' }] });
    expect(keyCanAccess(key, 'TenantB', 'School1')).toBe(false);
  });

  it('ignores upper/lower case differences', () => {
    const key = makeKey({ schools: [{ tenantId: 'TenantA', schoolId: 'School1' }] });
    expect(keyCanAccess(key, 'tenanta', 'SCHOOL1')).toBe(true);
  });

  it('blocks everything when the key has no scopes', () => {
    const key = makeKey();
    expect(keyCanAccess(key, 'TenantA', 'School1')).toBe(false);
  });
});