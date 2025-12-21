/**
 * HTTP Cache Tracker Middleware
 * Automatically tracks HTTP cache operations (304 Not Modified responses)
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordHttpCacheOperation } from './http-cache-monitor';

/**
 * Track HTTP cache response
 * Call this after creating a response with cache headers
 */
export function trackHttpCacheResponse(
  request: NextRequest,
  response: NextResponse,
  endpoint: string,
  startTime: number
): void {
  try {
    const statusCode = response.status;
    const is304 = statusCode === 304;
    const etag = response.headers.get('ETag');
    const cacheControl = response.headers.get('Cache-Control') || undefined;
    
    // Calculate response size (approximate)
    let responseSize = 0;
    if (!is304 && response.body) {
      // For 200 responses, we'd need to get the body size
      // This is an approximation - actual size would require reading the body
      responseSize = 100; // Default estimate
    }

    const duration = Date.now() - startTime;

    recordHttpCacheOperation({
      endpoint,
      statusCode,
      is304,
      hasETag: !!etag,
      cacheControl,
      responseSize,
      duration
    });
  } catch (error) {
    // Silently fail tracking to not affect request processing
    console.warn('[HTTP Cache Tracker] Failed to track response:', error);
  }
}

/**
 * Create a tracked response wrapper
 * Use this to automatically track cache operations
 */
export function createTrackedResponse(
  request: NextRequest,
  response: NextResponse,
  endpoint: string,
  startTime: number
): NextResponse {
  trackHttpCacheResponse(request, response, endpoint, startTime);
  return response;
}


