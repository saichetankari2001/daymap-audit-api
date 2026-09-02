import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { ApiKeyService } from '../services/apiKey.service';

/**
 * Bootstraps the first admin key — needed because POST /api-keys itself
 * requires an admin key to call. Usage: npm run create-admin-key
 */
async function main(): Promise<void> {
  const { rawKey } = await ApiKeyService.issue({ permission: 'admin', scopes: [] });
  // eslint-disable-next-line no-console
  console.log(`\nAdmin key (copy now, shown once):\n\n  ${rawKey}\n`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to create admin key:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
