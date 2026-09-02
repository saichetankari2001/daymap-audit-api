import path from 'path';
import {
  loadArchivalConfig,
  computeCutoffDate,
  ArchivalEnvValidationError,
} from '../../../src/config/archival';

describe('loadArchivalConfig', () => {
  it('applies defaults when no env vars are set', () => {
    const config = loadArchivalConfig({});
    expect(config.retentionDays).toBe(30);
    expect(config.coldStorageDir).toBe(path.resolve('./cold-storage'));
    expect(config.batchSize).toBe(500);
    expect(config.cronSchedule).toBe('0 2 * * *');
  });

  it('applies overrides from env vars', () => {
    const config = loadArchivalConfig({
      RETENTION_DAYS: '7',
      COLD_STORAGE_DIR: './custom-dir',
      ARCHIVE_BATCH_SIZE: '100',
      ARCHIVAL_CRON: '0 0 * * *',
    });
    expect(config.retentionDays).toBe(7);
    expect(config.coldStorageDir).toBe(path.resolve('./custom-dir'));
    expect(config.batchSize).toBe(100);
    expect(config.cronSchedule).toBe('0 0 * * *');
  });

  it('rejects a negative retention period', () => {
    expect(() => loadArchivalConfig({ RETENTION_DAYS: '-1' })).toThrow(ArchivalEnvValidationError);
  });

  it('rejects a non-positive batch size', () => {
    expect(() => loadArchivalConfig({ ARCHIVE_BATCH_SIZE: '0' })).toThrow(
      ArchivalEnvValidationError,
    );
  });
});

describe('computeCutoffDate', () => {
  it('subtracts the retention window from the given date', () => {
    const now = new Date('2026-09-15T00:00:00.000Z');
    const cutoff = computeCutoffDate(30, now);
    expect(cutoff.toISOString()).toBe('2026-08-16T00:00:00.000Z');
  });

  it('a retention of 0 days means the cutoff is "now"', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const cutoff = computeCutoffDate(0, now);
    expect(cutoff.toISOString()).toBe(now.toISOString());
  });
});
