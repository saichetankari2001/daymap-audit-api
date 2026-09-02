import { z } from 'zod';

// A school scope must always name which tenant that school belongs to —
// school IDs aren't guaranteed unique across tenants (see the schema.prisma
// comment on ApiKeyScope for why). A tenant scope needs no tenant field of
// its own since scopeValue already IS the tenant ID.
const scopeSchema = z
  .object({
    scopeType: z.enum(['tenant', 'school']),
    scopeValue: z.string().min(1),
    scopeTenantId: z.string().min(1).optional(),
  })
  .refine((data) => data.scopeType === 'tenant' || !!data.scopeTenantId, {
    message: 'A "school" scope must include scopeTenantId (which tenant the school belongs to)',
    path: ['scopeTenantId'],
  });

export const createApiKeySchema = z
  .object({
    label: z.string().optional(),
    permission: z.enum(['read', 'write', 'admin']),
    scopes: z.array(scopeSchema).optional(),
  })
  .refine((data) => data.permission === 'admin' || (data.scopes?.length ?? 0) > 0, {
    message: 'Non-admin keys must have at least one scope',
    path: ['scopes'],
  });

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
