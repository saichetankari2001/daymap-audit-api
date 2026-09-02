import { ApiKeyRepository, ApiKeyWithScopes } from '../repositories/apiKey.repository';
import { generateRawKey, hashKey } from '../lib/apiKeys';
import { CreateApiKeyInput } from '../schemas/apiKey.schema';
import { NotFoundError } from '../errors/AppError';

export interface IssuedKey {
  id: string;
  label: string | null;
  permission: string;
  scopes: { scopeType: string; scopeValue: string; scopeTenantId: string | null }[];
  rawKey: string;
}

export const ApiKeyService = {
  async issue(input: CreateApiKeyInput): Promise<IssuedKey> {
    const rawKey = generateRawKey();
    const created = await ApiKeyRepository.create({
      hashedKey: hashKey(rawKey),
      label: input.label,
      permission: input.permission,
      scopes: input.scopes ?? [],
    });

    // rawKey is only ever returned here — it cannot be retrieved again.
    return {
      id: created.id,
      label: created.label,
      permission: created.permission,
      scopes: created.scopes.map(({ scopeType, scopeValue, scopeTenantId }) => ({
        scopeType,
        scopeValue,
        scopeTenantId,
      })),
      rawKey,
    };
  },

  list(): Promise<Omit<ApiKeyWithScopes, 'hashedKey'>[]> {
    return ApiKeyRepository.findMany().then((keys) =>
      keys.map(({ hashedKey: _h, ...rest }) => rest),
    );
  },

  async revoke(id: string): Promise<void> {
    if (!(await ApiKeyRepository.findById(id))) throw new NotFoundError('API key not found');
    await ApiKeyRepository.revoke(id);
  },
};
