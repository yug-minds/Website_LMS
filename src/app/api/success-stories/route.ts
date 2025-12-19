import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { handleApiError } from '../../../lib/logger';
import { getOrSetCache, CacheKeys, CacheTTL } from '../../../lib/cache';
import { addCacheHeaders, CachePresets, checkETag } from '../../../lib/http-cache';

// Force dynamic rendering - API uses request headers and dynamic data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Note: Edge runtime disabled - Supabase admin client requires Node.js APIs

export async function GET(request: NextRequest) {
  try {
    const rl = await rateLimit(request, { ...RateLimitPresets.READ, endpoint: '/api/success-stories' });
    const headers = createRateLimitHeaders(rl);
    if (!rl.success) return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });

    type SuccessStoryRow = {
      id: string;
      title: string;
      body_primary: string;
      body_secondary: string | null;
      body_tertiary: string | null;
      image_url: string | null;
      storage_path: string | null;
      background: 'blue' | 'white';
      image_position: 'left' | 'right';
      order_index: number;
      is_published: boolean;
    };

    const sections = await getOrSetCache(
      CacheKeys.successStories(),
      async () => {
        const { data, error } = await supabaseAdmin
          .from('success_story_sections')
          .select('id,title,body_primary,body_secondary,body_tertiary,image_url,storage_path,background,image_position,order_index,is_published')
          .eq('is_published', true)
          .order('order_index', { ascending: true });
        if (error) throw error;
        const rows = (data || []) as SuccessStoryRow[];
        const mapped = await Promise.all(rows.map(async (row) => {
          if (row.storage_path) {
            try {
              // Create signed URL with longer expiry (24 hours) for better caching
              const { data: signed } = await supabaseAdmin
                .storage
                .from('school-logos')
                .createSignedUrl(row.storage_path, 86400); // 24 hours instead of 10 minutes
              return { ...row, image_url: signed?.signedUrl || row.image_url };
            } catch {
              return row;
            }
          }
          return row;
        }));
        return mapped;
      },
      CacheTTL.SHORT
    );

    const requestStartTime = Date.now();
    const response = NextResponse.json({ sections }, { status: 200, headers });
    
    // Add HTTP caching headers (static content - longer cache)
    addCacheHeaders(response, { sections }, {
      ...CachePresets.STATIC_CONTENT,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    if (etag && checkETag(request, etag)) {
      const { recordHttpCacheOperation } = await import('../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/success-stories',
        statusCode: 304,
        is304: true,
        hasETag: true,
        cacheControl: response.headers.get('Cache-Control') || undefined,
        responseSize: 0,
        duration: Date.now() - requestStartTime
      });
      return new NextResponse(null, { status: 304 });
    }

    // Track 200 response
    const { recordHttpCacheOperation } = await import('../../../lib/http-cache-monitor');
    recordHttpCacheOperation({
      endpoint: '/api/success-stories',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify({ sections }).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    const errorInfo = await handleApiError(error, { endpoint: '/api/success-stories' }, 'Failed to fetch success stories');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
