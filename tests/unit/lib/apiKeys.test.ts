import { generateRawKey, hashKey } from '../../../src/lib/apiKeys';

describe('generateRawKey', () => {
  it('starts with the dma_ prefix', () => {
    expect(generateRawKey().startsWith('dma_')).toBe(true);
  });

  it('gives a different key each time', () => {
    expect(generateRawKey()).not.toBe(generateRawKey());
  });
});

describe('hashKey', () => {
  it('gives the same hash for the same key', () => {
    expect(hashKey('dma_abc')).toBe(hashKey('dma_abc'));
  });

  it('gives different hashes for different keys', () => {
    expect(hashKey('dma_abc')).not.toBe(hashKey('dma_xyz'));
  });
});
