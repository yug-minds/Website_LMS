import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { logger, handleApiError } from '../../../lib/logger';
import { ensureCsrfToken } from '../../../lib/csrf-middleware';

// Enable ISR - schools list changes infrequently, revalidate every 5 minutes
export const dynamic = 'force-dynamic';

// Note: Edge runtime disabled - Supabase admin client requires Node.js APIs

export async function GET(request: NextRequest) {
  ensureCsrfToken(request);

  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
      },
      {
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult)
      }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .eq('is_active', true)

      .order('name') as any;

    if (error) {
      logger.error('Error fetching schools from database', {
        endpoint: '/api/schools',
        error: error.message,
      });
      return NextResponse.json({ error: 'Failed to fetch schools' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    logger.error('Unexpected error in GET /api/schools', {
      endpoint: '/api/schools',
    }, error instanceof Error ? error : new Error(String(error)));

    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/schools' },
      'Failed to fetch schools'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
