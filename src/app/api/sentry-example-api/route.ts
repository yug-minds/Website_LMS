import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

class SentryExampleBackendError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'SentryExampleBackendError';
  }
}

export async function GET(request: NextRequest) {
  Sentry.logger.info('Sentry example API route called');
  
  // This will trigger an error that Sentry will capture
  throw new SentryExampleBackendError(
    'This error is raised on the backend of the example page.'
  );
}
