import { prisma } from '../lib/prisma';
import { ApiKey, ApiKeyScope } from '@prisma/client';

export type ApiKeyWithScopes = ApiKey & { scopes: ApiKeyScope[] };

export const ApiKeyRepository = {
  create(data: {
    hashedKey: string;
    label?: string;
    permission: string;
    scopes: { scopeType: string; scopeValue: string; scopeTenantId?: string }[];
  }): Promise<ApiKeyWithScopes> {
    const { scopes, ...rest } = data;
    return prisma.apiKey.create({
      data: { ...rest, scopes: scopes.length > 0 ? { create: scopes } : undefined },
      include: { scopes: true },
    });
  },

  findMany(): Promise<ApiKeyWithScopes[]> {
    return prisma.apiKey.findMany({ include: { scopes: true }, orderBy: { createdAt: 'desc' } });
  },

  findById(id: string): Promise<ApiKey | null> {
    return prisma.apiKey.findUnique({ where: { id } });
  },

  revoke(id: string): Promise<ApiKey> {
    return prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  },
};
