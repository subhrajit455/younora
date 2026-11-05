const { parseEnv } = require('../../src/config/env');

describe('Config: env.js', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    PORT: '5001',
    API_PREFIX: '/api/v1',
    CORS_ORIGIN: 'http://localhost:3000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/younora_test',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX: '50',
  };

  test('parses valid environment variables correctly', () => {
    const config = parseEnv(validBaseEnv);
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(5001);
    expect(config.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/younora_test');
    expect(config.RATE_LIMIT_MAX).toBe(50);
  });

  test('applies sensible defaults when optional vars are omitted', () => {
    const minimalEnv = {
      MONGODB_URI: 'mongodb://127.0.0.1:27017/younora_test',
    };
    const config = parseEnv(minimalEnv);
    expect(config.PORT).toBe(5000);
    expect(config.API_PREFIX).toBe('/api/v1');
    expect(config.NODE_ENV).toBe('development');
  });

  test('throws descriptive error when MONGODB_URI is missing', () => {
    const invalidEnv = { ...validBaseEnv };
    delete invalidEnv.MONGODB_URI;

    expect(() => parseEnv(invalidEnv)).toThrow(/MONGODB_URI is required/);
  });

  test('throws descriptive error when MONGODB_URI has invalid protocol', () => {
    const invalidEnv = {
      ...validBaseEnv,
      MONGODB_URI: 'postgres://localhost:5432/db',
    };

    expect(() => parseEnv(invalidEnv)).toThrow(/MONGODB_URI must start with mongodb:\/\/ or mongodb\+srv:\/\//);
  });
});

