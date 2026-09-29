import { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { hashKey } from '../lib/apiKeys';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';

export type Permission = 'read' | 'write' | 'admin';

export interface SchoolScope {
  tenantId: string;
  schoolId: string;
}

export interface AuthedKey {
  id: string;
  permission: Permission;
  tenants: string[];
  schools: SchoolScope[];
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: AuthedKey;
    }
  }
}

/** Resolves the x-api-key header into req.apiKey, or rejects the request. */
export const authenticate: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const rawKey = req.header('x-api-key');
    if (!rawKey) throw new UnauthorizedError('Missing x-api-key header');

    const record = await prisma.apiKey.findUnique({
      where: { hashedKey: hashKey(rawKey) },
      include: { scopes: true },
    });
    if (!record || record.revokedAt) throw new UnauthorizedError('Invalid or revoked API key');

    const permission = record.permission as Permission;
    const scopes = record.scopes ?? [];

    req.apiKey = {
      id: record.id,
      permission,
      isAdmin: permission === 'admin',
      tenants: scopes.filter((s) => s.scopeType === 'tenant').map((s) => s.scopeValue),
      // A school scope is always a (tenant, school) pair, never a bare school
      // ID — school IDs aren't guaranteed unique across tenants, so matching
      // on schoolId alone would let a key issued for one tenant's school
      // reach a same-named school under a completely different tenant.
      schools: scopes
        .filter((s) => s.scopeType === 'school')
        .map((s) => ({ tenantId: s.scopeTenantId ?? '', schoolId: s.scopeValue })),
    };
    next();
  } catch (err) {
    next(err);
  }
};

/** Requires at least the given permission level. Admin satisfies any level. */
export function requirePermission(required: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.apiKey) return next(new UnauthorizedError('Not authenticated'));
    if (req.apiKey.isAdmin || req.apiKey.permission === required) return next();
    next(new ForbiddenError(`This key does not have "${required}" permission`));
  };
}

// Tenant/school identifiers are matched case-insensitively: Daymap's callers
// aren't guaranteed to send a given tenant/school ID with consistent casing
// (e.g. "DaymapDev" vs "daymapdev" are the same tenant), so a scope created
// with one casing must still match a request using another. Comparison-only —
// stored values keep whatever casing they were written with.
const normalize = (value: string): string => value.toLowerCase();

/**
 * A tenant scope covers every school under it; a school scope covers only
 * that exact (tenant, school) pair — never a same-named school under a
 * different tenant. Admin bypasses scoping entirely.
 */
export function keyCanAccess(key: AuthedKey, tenantId: string, schoolId: string): boolean {
  const normTenantId = normalize(tenantId);
  const normSchoolId = normalize(schoolId);
  return (
    key.isAdmin ||
    key.tenants.some((t) => normalize(t) === normTenantId) ||
    key.schools.some(
      (s) => normalize(s.tenantId) === normTenantId && normalize(s.schoolId) === normSchoolId,
    )
  );
}

/** Prisma `where` fragment restricting a query to a key's allowed tenants/schools. */
export function scopeWhereClause(key: AuthedKey): Record<string, unknown> | undefined {
  if (key.isAdmin) return undefined;

  const or: Record<string, unknown>[] = [];
  for (const tenant of key.tenants) {
    or.push({ tenantId: { equals: tenant, mode: 'insensitive' } });
  }
  for (const school of key.schools) {
    or.push({
      tenantId: { equals: school.tenantId, mode: 'insensitive' },
      schoolId: { equals: school.schoolId, mode: 'insensitive' },
    });
  }

  return or.length > 0 ? { OR: or } : { id: 'no-scopes-configured-for-this-key' };
}
