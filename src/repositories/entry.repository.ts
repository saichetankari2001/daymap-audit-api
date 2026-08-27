import { prisma } from '../lib/prisma';
import { Entry, Prisma } from '@prisma/client';
import { CreateEntryInput, EntryQueryInput } from '../schemas/entry.schema';

export interface EntryPage {
  data: Entry[];
  nextCursor: number | null;
  snapshotSequence: number;
}

function splitEntry(input: CreateEntryInput): {
  timestampUtc: Date;
  tenantId: string;
  schoolId: string;
  eventId: string | null;
  userId: string | null;
  eventType: string | null;
  entityType: string | null;
  entityId: string | null;
  category: string | null;
  application: string | null;
  success: boolean | null;
  extra: Prisma.InputJsonValue;
} {
  const {
    timestampUtc,
    tenantId,
    schoolId,
    eventId,
    userId,
    eventType,
    entityType,
    entityId,
    category,
    application,
    success,
    ...extra
  } = input;
  return {
    timestampUtc,
    tenantId,
    schoolId,
    eventId: eventId ?? null,
    userId: userId ?? null,
    eventType: eventType ?? null,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    category: category ?? null,
    application: application ?? null,
    success: success ?? null,
    extra: extra as Prisma.InputJsonValue,
  };
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
      tenantId: filters.tenantId,
      schoolId: filters.schoolId,
      userId: filters.userId,
      eventType: filters.eventType,
      entityType: filters.entityType,
      application: filters.application,
      success: filters.success,
      sequence: {
        gt: filters.cursor,
        lte: snapshotSequence,
      },
      timestampUtc: {
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
