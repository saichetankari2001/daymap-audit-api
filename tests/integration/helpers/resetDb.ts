import { prisma } from '../../../src/lib/prisma';

export async function resetDb() {
  await prisma.entry.deleteMany();
}
