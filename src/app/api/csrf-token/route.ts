import { NextRequest, NextResponse } from 'next/server';
import { 
  getCsrfTokenFromCookie, 
  generateCsrfToken, 
  setCsrfTokenCookie 
} from '../../../lib/csrf';
import { logger, handleApiError } from '../../../lib/logger';

// This endpoint must remain dynamic because it reads cookies
export const dynamic = 'force-dynamic';

/**
 * GET /api/csrf-token
 * 
 * Returns the CSRF token for the current session.
 * The token is also set in a httpOnly cookie, but this endpoint
 * allows the frontend to get the token value to include in request headers.
 * 
 * Security: This endpoint is safe because:
 * - The token is already in a cookie (httpOnly)
 * - We're just exposing the same token value
 * - The token is validated server-side
 */
export async function GET(request: NextRequest) {
  try {
    // Get existing token from cookie
    let token = getCsrfTokenFromCookie(request);
    
    // If no token exists, generate a new one
    if (!token) {
      token = generateCsrfToken();
    }
    
    // Create response with token
    const response = NextResponse.json({ token });
    
    // Ensure token is set in cookie
    setCsrfTokenCookie(response, token);
    
    return response;
  } catch (error) {
    logger.error('Error in GET /api/csrf-token', { 
      endpoint: '/api/csrf-token' 
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/csrf-token' },
      'Failed to get CSRF token'
    );
    
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
