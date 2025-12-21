import { NextRequest, NextResponse } from 'next/server';
// Web Crypto API is available globally in Edge Runtime
// No import needed for randomBytes or timingSafeEqual replacement

import { logger } from './logger';

/**
 * CSRF Token Configuration
 */
export const CSRF_TOKEN_LENGTH = 32; // 32 bytes = 64 hex characters
export const CSRF_COOKIE_NAME = 'csrf-token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_TOKEN_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds
export const CSRF_COOKIE_OPTIONS = {
  path: '/',
  maxAge: CSRF_TOKEN_MAX_AGE,
  httpOnly: true, // Prevent JavaScript access
  sameSite: 'lax' as const, // CSRF protection while allowing OAuth flows
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
};

/**
 * Generate a secure random CSRF token
 * @returns A hex-encoded random token
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b: any) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time comparison for strings to prevent timing attacks
 * Helper function since crypto.timingSafeEqual is not available in all edge runtimes
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const aLen = a.length;
  const bLen = b.length;
  // Length check is already done, but for safety against optimization:
  if (aLen !== bLen) return false;

  let result = 0;
  for (let i = 0; i < aLen; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Get CSRF token from request cookie
 * @param request - Next.js request object
 * @returns CSRF token from cookie or null if not found
 */
export function getCsrfTokenFromCookie(request: NextRequest): string | null {
  return request.cookies.get(CSRF_COOKIE_NAME)?.value || null;
}

/**
 * Get CSRF token from request header
 * @param request - Next.js request object
 * @returns CSRF token from header or null if not found
 */
export function getCsrfTokenFromHeader(request: NextRequest): string | null {
  return request.headers.get(CSRF_HEADER_NAME) || null;
}

/**
 * Validate CSRF token
 * Compares the token from the cookie with the token from the header/body
 * Uses constant-time comparison to prevent timing attacks
 * 
 * @param cookieToken - Token from cookie
 * @param submittedToken - Token from header or body
 * @returns true if tokens match, false otherwise
 */
export function validateCsrfToken(
  cookieToken: string | undefined,
  submittedToken: string | undefined
): boolean {
  // Both tokens must be present
  if (!cookieToken || !submittedToken) {
    return false;
  }

  // Tokens must be the same length
  if (cookieToken.length !== submittedToken.length) {
    return false;
  }

  return timingSafeEqual(cookieToken, submittedToken);
}

/**
 * Set CSRF token in response cookie
 * @param response - Next.js response object
 * @param token - CSRF token to set
 */
export function setCsrfTokenCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
}

/**
 * Verify CSRF token from request
 * Checks if the token in the cookie matches the token in the header
 * Uses caching to reduce validation overhead
 * 
 * @param request - Next.js request object
 * @returns true if CSRF token is valid, false otherwise
 */
export async function verifyCsrfToken(request: NextRequest): Promise<boolean> {
  const cookieToken = getCsrfTokenFromCookie(request);
  const headerToken = getCsrfTokenFromHeader(request);
  const valid = validateCsrfToken(cookieToken || undefined, headerToken || undefined);

  if (!valid) {
    logger.warn('CSRF token validation failed', {
      endpoint: request.nextUrl.pathname,
      method: request.method,
      hasCookieToken: !!cookieToken,
      hasHeaderToken: !!headerToken,
    });
  } else {
    if (process.env.NODE_ENV === 'development') {
      logger.debug('CSRF token validated', {
        endpoint: request.nextUrl.pathname,
        method: request.method,
      });
    }
  }
  return valid;
}

/**
 * CSRF protection middleware
 * Validates CSRF token for state-changing operations
 * 
 * @param request - Next.js request object
 * @returns NextResponse with error if CSRF validation fails, null if valid
 */
export async function validateCsrfProtection(request: NextRequest): Promise<NextResponse | null> {
  const method = request.method;

  // Only validate state-changing methods
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!stateChangingMethods.includes(method)) {
    return null; // No CSRF check needed for GET, OPTIONS, etc.
  }

  // Skip CSRF for read-only or health check endpoints
  const pathname = request.nextUrl.pathname;
  const skipCsrfEndpoints = [
    '/api/health', // Health check (read-only)
  ];

  if (skipCsrfEndpoints.some((endpoint: any) => pathname.startsWith(endpoint))) {
    return null; // Skip CSRF for these endpoints
  }

  // Note: Public endpoints like /api/contact and /api/auth/password-reset-request
  // still need CSRF protection to prevent abuse and form submission attacks

  // Verify CSRF token (now async with caching)
  if (!(await verifyCsrfToken(request))) {
    logger.warn('CSRF protection: invalid or missing token', {
      endpoint: request.nextUrl.pathname,
      method: request.method,
    });
    return NextResponse.json(
      {
        error: 'CSRF token validation failed',
        message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
      },
      { status: 403 }
    );
  }

  return null; // CSRF validation passed
}

/**
 * Get or create CSRF token for a request
 * If token exists in cookie, returns it; otherwise generates a new one
 * 
 * @param request - Next.js request object
 * @returns CSRF token
 */
export function getOrCreateCsrfToken(request: NextRequest): string {
  const existingToken = getCsrfTokenFromCookie(request);
  if (existingToken) {
    return existingToken;
  }
  return generateCsrfToken();
}

/**
 * CSRF token response helper
 * Adds CSRF token to response cookie and returns token for client
 * 
 * @param response - Next.js response object
 * @param request - Next.js request object (optional, for getting existing token)
 * @returns CSRF token string
 */
export function addCsrfTokenToResponse(
  response: NextResponse,
  request?: NextRequest
): string {
  const token = request ? getOrCreateCsrfToken(request) : generateCsrfToken();
  setCsrfTokenCookie(response, token);
  if (process.env.NODE_ENV === 'development') {
    logger.debug('CSRF token set in response', {
      endpoint: request?.nextUrl.pathname,
      method: request?.method,
    });
  }
  return token;
}
