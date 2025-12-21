import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { validateCsrfProtection, addCsrfTokenToResponse, getOrCreateCsrfToken, CSRF_COOKIE_NAME, CSRF_COOKIE_OPTIONS } from './csrf';

/**
 * CSRF Protection Middleware Helper
 * 
 * This function should be called at the beginning of state-changing API routes
 * to validate CSRF tokens. It also ensures a CSRF token cookie is set.
 * 
 * Usage:
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   // Validate CSRF protection
 *   const csrfError = validateCsrf(request);
 *   if (csrfError) return csrfError;
 *   
 *   // Your route logic here...
 * }
 * ```
 * 
 * @param request - Next.js request object
 * @param response - Optional Next.js response object (will create one if not provided)
 * @returns NextResponse with error if CSRF validation fails, null if valid
 */
export async function validateCsrf(
  request: NextRequest,
  response?: NextResponse
): Promise<NextResponse | null> {
  // Validate CSRF token (now async with caching)
  const csrfError = await validateCsrfProtection(request);
  if (csrfError) {
    // Return 403 error response
    return NextResponse.json(
      {
        error: 'CSRF token mismatch or missing',
        message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
      },
      { status: 403 }
    );
  }

  // Ensure CSRF token cookie is set (for subsequent requests)
  if (response) {
    addCsrfTokenToResponse(response, request);
  }

  return null; // CSRF validation passed
}

/**
 * Ensure CSRF token is set in response
 * Call this for all responses to ensure CSRF token cookie is available
 * 
 * @param response - Next.js response object
 * @param request - Next.js request object
 */
export function ensureCsrfToken(
  responseOrRequest: NextResponse | NextRequest,
  request?: NextRequest
): void {
  if (responseOrRequest instanceof NextResponse) {
    if (!request) {
      throw new Error('ensureCsrfToken requires a request when providing a response');
    }
    addCsrfTokenToResponse(responseOrRequest, request);
    return;
  }

  // For NextRequest, we can't set cookies directly in middleware context
  // This should be handled by the response instead
  // If we need to set cookies from a request, we should use the response path
}

