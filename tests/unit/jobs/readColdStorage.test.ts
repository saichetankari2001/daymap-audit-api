import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ColdStorageReadError, readColdStorage } from '../../../src/jobs/archival/readColdStorage';

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'x',
  timestampUtc: '2026-09-01T10:00:00.000Z',
  tenantId: 'RiverbendDistrict',
  schoolId: 'Riverbend-High',
  userId: '1001',
  eventType: 'Read',
  ...over,
});

const toFile = (entries: object[]) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

describe('readColdStorage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cold-storage-test-'));
    await fs.writeFile(
      path.join(dir, '2026-09-01.jsonl'),
      toFile([entry(), entry({ userId: '1002', eventType: 'Delete' })]),
    );
    await fs.writeFile(
      path.join(dir, '2026-09-02.jsonl'),
      toFile([
        entry({ tenantId: 'HighlandUnified', schoolId: 'Highland-High' }),
        entry({ schoolId: 'Riverbend-Primary' }),
      ]),
    );
    await fs.writeFile(path.join(dir, 'notes.txt'), 'not an archive file');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads every entry from every day file, oldest day first', async () => {
    const result = await readColdStorage(dir);
    expect(result).toHaveLength(4);
    expect(result[0].userId).toBe('1001');
    expect(result[3].schoolId).toBe('Riverbend-Primary');
  });

  it('reads only the requested day', async () => {
    const result = await readColdStorage(dir, { day: '2026-09-02' });
    expect(result).toHaveLength(2);
  });

  it('filters by tenant, ignoring letter case', async () => {
    const result = await readColdStorage(dir, { tenantId: 'riverbenddistrict' });
    expect(result).toHaveLength(3);
  });

  it('filters by school, ignoring letter case', async () => {
    const result = await readColdStorage(dir, { schoolId: 'RIVERBEND-PRIMARY' });
    expect(result).toHaveLength(1);
  });

  it('filters by user and event type', async () => {
    expect(await readColdStorage(dir, { userId: '1002' })).toHaveLength(1);
    expect(await readColdStorage(dir, { eventType: 'Delete' })).toHaveLength(1);
  });

  it('combines filters', async () => {
    const result = await readColdStorage(dir, { tenantId: 'RiverbendDistrict', eventType: 'Read' });
    expect(result).toHaveLength(2);
  });

  it('stops at the limit', async () => {
    const result = await readColdStorage(dir, { limit: 3 });
    expect(result).toHaveLength(3);
  });

  it('returns nothing for a day with no file', async () => {
    expect(await readColdStorage(dir, { day: '2030-01-01' })).toEqual([]);
  });

  it('returns nothing when the cold-storage folder does not exist yet', async () => {
    expect(await readColdStorage(path.join(dir, 'missing'))).toEqual([]);
  });

  it('rejects a day that is not YYYY-MM-DD, including path tricks', async () => {
    await expect(readColdStorage(dir, { day: '../secrets' })).rejects.toThrow(ColdStorageReadError);
    await expect(readColdStorage(dir, { day: '2026-9-1' })).rejects.toThrow(ColdStorageReadError);
  });

  it('names the file and line when a line is not valid JSON', async () => {
    await fs.writeFile(path.join(dir, '2026-09-03.jsonl'), '{"tenantId":"A"}\n{broken\n');
    await expect(readColdStorage(dir, { day: '2026-09-03' })).rejects.toThrow(
      '2026-09-03.jsonl line 2',
    );
  });
});
