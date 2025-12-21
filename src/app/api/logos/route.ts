import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { logger, handleApiError } from '../../../lib/logger';
import { getOrSetCache, CacheKeys, CacheTTL } from '../../../lib/cache';
import { addCacheHeaders, CachePresets } from '../../../lib/http-cache';

// Enable ISR - logos change infrequently, revalidate every 5 minutes
export const dynamic = 'force-dynamic';

// Note: Edge runtime disabled - Supabase admin client requires Node.js APIs

export async function GET(request: NextRequest) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.READ, endpoint: '/api/logos' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) {
      return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    }

    const logos = await getOrSetCache(
      CacheKeys.homepageLogos(),
      async () => {
        const { data, error } = await supabaseAdmin
          .from('school_logos')
          .select('id, school_name, description, image_url')
          .eq('is_deleted', false)
          .order('upload_date', { ascending: false })
          .limit(200);
        if (error) throw error;
        return (data || []).map((l: any) => ({
          id: l.id,
          description: l.school_name,
          image: l.image_url,
          className: 'h-20 md:h-28 lg:h-32 w-auto opacity-60 hover:opacity-100 transition-opacity',
        }));
      },
      CacheTTL.MEDIUM
    );

    const requestStartTime = Date.now();
    const resp = NextResponse.json({ logos }, { status: 200, headers });

    // Add HTTP caching headers (static content - longer cache)
    addCacheHeaders(resp, { logos }, {
      ...CachePresets.STATIC_CONTENT,
      lastModified: new Date()
    });

    // Note: We intentionally avoid returning 304 responses here.
    // A 304 has no body, and `fetch()` callers that expect JSON can break.
    // We still emit proper cache headers (ETag/Cache-Control) so browsers/CDNs
    // can cache the 200 response normally.
    const etag = resp.headers.get('ETag');

    // Track 200 response
    const { recordHttpCacheOperation } = await import('../../../lib/http-cache-monitor');
    recordHttpCacheOperation({
      endpoint: '/api/logos',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: resp.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify({ logos }).length,
      duration: Date.now() - requestStartTime
    });

    return resp;
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/logos' }, 'Failed to fetch logos');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
