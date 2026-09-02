import { prisma } from '../lib/prisma';
import { Entry } from '@prisma/client';

export const ArchivalRepository = {
  findBatchOlderThan(cutoff: Date, batchSize: number): Promise<Entry[]> {
    return prisma.entry.findMany({
      where: { timestampUtc: { lt: cutoff } },
      orderBy: { sequence: 'asc' },
      take: batchSize,
    });
  },

  deleteByIds(ids: string[]): Promise<{ count: number }> {
    return prisma.entry.deleteMany({ where: { id: { in: ids } } });
  },
};
