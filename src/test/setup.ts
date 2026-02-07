import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock environment variables (NodeJS.ProcessEnv allows string index)
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = 'test';
env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
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

