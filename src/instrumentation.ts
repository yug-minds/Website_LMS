import * as Sentry from '@sentry/nextjs';

import { initializeServer } from './lib/server-init';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    
    // Initialize server optimizations on startup (non-blocking)
    // This warms the cache for faster first requests
    initializeServer().catch((error) => {
      // Log but don't throw - initialization failure shouldn't block server startup
      console.warn('Server initialization failed:', error);
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
