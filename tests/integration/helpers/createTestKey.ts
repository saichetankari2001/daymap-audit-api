import { ApiKeyService } from '../../../src/services/apiKey.service';

interface TestKeyOptions {
  permission: 'read' | 'write' | 'admin';
  scopes?: { scopeType: 'tenant' | 'school'; scopeValue: string; scopeTenantId?: string }[];
}

/** Issues an API key directly (bypassing HTTP) for test setup. Returns the raw key. */
export async function createTestKey(options: TestKeyOptions): Promise<string> {
  const { rawKey } = await ApiKeyService.issue({
    permission: options.permission,
    scopes: options.scopes ?? [],
  });
  return rawKey;
}
