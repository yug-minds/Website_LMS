/**
 * HTTP Cache Helper
 * Provides easy-to-use functions for tracking HTTP cache operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordHttpCacheOperation } from './http-cache-monitor';
import { addCacheHeaders, checkETag, CachePresets } from './http-cache';

/**
 * Create a cached response with automatic tracking
 */
export async function createCachedResponse(
  request: NextRequest,
  data: any,
  endpoint: string,
  startTime: number,
  options: {
    cachePreset?: keyof typeof CachePresets;
    maxAge?: number;
    staleWhileRevalidate?: number;
    private?: boolean;
    public?: boolean;
  } = {}
): Promise<NextResponse> {
  // Create response
  const response = NextResponse.json(data, { status: 200 });

  // Add cache headers
  const cacheOptions = options.cachePreset
    ? { ...CachePresets[options.cachePreset], ...options }
    : {
        maxAge: options.maxAge || 300,
        staleWhileRevalidate: options.staleWhileRevalidate,
        private: options.private,
        public: options.public,
        ...options
      };

  addCacheHeaders(response, data, {
    ...cacheOptions,
    lastModified: new Date()
  });

  // Check for 304 Not Modified
  const etag = response.headers.get('ETag');
  if (etag && checkETag(request, etag)) {
    recordHttpCacheOperation({
      endpoint,
      statusCode: 304,
      is304: true,
      hasETag: true,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: 0,
      duration: Date.now() - startTime
    });
    return new NextResponse(null, { status: 304 });
  }

  // Track 200 response
  recordHttpCacheOperation({
    endpoint,
    statusCode: 200,
    is304: false,
    hasETag: !!etag,
    cacheControl: response.headers.get('Cache-Control') || undefined,
    responseSize: JSON.stringify(data).length,
    duration: Date.now() - startTime
  });

  return response;
}


