import { expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock environment variables
(process.env as any).NODE_ENV = 'test';
(process.env as any).NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
(process.env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
(process.env as any).SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.NEXT_PUBLIC_SENTRY_DSN = '';
process.env.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-redis-token';

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

