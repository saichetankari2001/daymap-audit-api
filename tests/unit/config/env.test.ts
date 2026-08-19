import { parseEnv, EnvValidationError } from '../../../src/config/env';

describe('parseEnv', () => {
  const validEnv = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' };

  it('parses valid env with defaults applied', () => {
    const result = parseEnv(validEnv);
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(4000);
  });

  it('throws EnvValidationError when DATABASE_URL is missing', () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
  });
});
