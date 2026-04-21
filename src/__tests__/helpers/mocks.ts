import { vi } from 'vitest';

/**
 * Mock config object matching the Config interface
 * Prevents eager config evaluation that requires env vars
 */
export const mockConfig = {
  server: { port: 3000, nodeEnv: 'test' },
  device: { user: 'test', password: 'test' },
  db: {
    server: 'localhost',
    database: 'test',
    user: 'test',
    password: 'test',
    encrypt: false,
    trustServerCertificate: true,
    connectionTimeout: 5000,
    requestTimeout: 5000,
  },
  email: {
    host: '',
    port: 587,
    secure: false,
    from: 'test@test.com',
    to: [],
    subject: 'test',
  },
  security: {
    jwtSecret: 'test-jwt-secret-key-for-testing',
    jwtExpiresIn: '1h',
    apiRateLimit: 100,
  },
  logging: { level: 'info', prettyPrint: false },
};

/**
 * Creates a mock logger with vi.fn() for each method
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}
