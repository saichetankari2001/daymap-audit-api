import { prisma } from '../lib/prisma';
import { Entry, Prisma } from '@prisma/client';
import { CreateEntryInput, EntryQueryInput } from '../schemas/entry.schema';

export interface EntryPage {
  data: Entry[];
  nextCursor: number | null;
  snapshotSequence: number;
}

function splitEntry(input: CreateEntryInput): {
  date: Date;
  jurisdiction: string;
  schoolCode: string;
  userId: string | null;
  extra: Prisma.InputJsonValue;
} {
  const { date, jurisdiction, schoolCode, ...extra } = input;
  const userId = typeof extra.userId === 'string' ? extra.userId : null;
  return { date, jurisdiction, schoolCode, userId, extra: extra as Prisma.InputJsonValue };
}

export const EntryRepository = {
  async createBatch(entries: CreateEntryInput[]): Promise<void> {
    if (entries.length === 0) return;
    await prisma.entry.createMany({
      data: entries.map((entry) => splitEntry(entry)),
    });
  },

  async findLatestSequence(): Promise<number> {
    const latest = await prisma.entry.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return latest?.sequence ?? 0;
  },

  async findMany(filters: EntryQueryInput): Promise<EntryPage> {
    const snapshotSequence =
      filters.snapshotSequence ?? (await EntryRepository.findLatestSequence());

    const extraConditions: Prisma.EntryWhereInput[] = filters.extra
      ? Object.entries(filters.extra).map(([key, value]) => ({
          extra: { path: [key], equals: value },
        }))
      : [];

    const where: Prisma.EntryWhereInput = {
      jurisdiction: filters.jurisdiction,
      schoolCode: filters.schoolCode,
      userId: filters.userId,
      sequence: {
        gt: filters.cursor,
        lte: snapshotSequence,
      },
      date: {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      },
      AND: extraConditions.length > 0 ? extraConditions : undefined,
    };

    const rows = await prisma.entry.findMany({
      where,
      orderBy: { sequence: 'asc' },
      take: filters.limit + 1,
    });
    const hasMore = rows.length > filters.limit;
    const data = hasMore ? rows.slice(0, filters.limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].sequence : null;

    return { data, nextCursor, snapshotSequence };
  },
};
