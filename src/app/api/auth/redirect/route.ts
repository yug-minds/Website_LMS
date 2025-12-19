import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { shortenUserId } from '../../../../lib/utils';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// Force dynamic rendering - this route uses request headers and must be dynamic
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.AUTH);
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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const roleParam = searchParams.get('role');
    const forcePasswordChangeParam = searchParams.get('force_password_change');
    
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    
    // If role is provided as parameter, use it to avoid duplicate query
    // Otherwise, fetch from database (backward compatibility)
    let role: string | undefined;
    let forcePasswordChange: boolean = false;
    
    console.log(`🔍 redirect API: userId=${shortenUserId(userId)}, roleParam=${roleParam}, forcePasswordChangeParam=${forcePasswordChangeParam}`);
    
    // Get role - prefer provided role param, fallback to database
    if (roleParam) {
      // Use provided role directly (trusted from login flow)
      role = decodeURIComponent(roleParam);
      forcePasswordChange = forcePasswordChangeParam === 'true';
      console.log(`✅ redirect API: Using provided role="${role}", force_password_change=${forcePasswordChange}, userId=${shortenUserId(userId)}`);
    } else {
      // No role param - must fetch from database
      console.log(`⚠️ redirect API: No role param provided, fetching from database for userId=${shortenUserId(userId)}`);
      
      try {
        const { data: profile, error } = await supabaseAdmin
          .from('profiles')
          .select('role, email, force_password_change')
          .eq('id', userId)
           
          .single() as any;
        
        if (error || !profile) {
          console.error(`❌ Error fetching profile for userId=${shortenUserId(userId)}:`, error);
          return NextResponse.json({ error: error?.message || 'User not found' }, { status: 404 });
        }
        
        role = profile.role;
        forcePasswordChange = profile.force_password_change || false;
        console.log(`✅ redirect API: Fetched from DB - userId=${shortenUserId(userId)}, email=${profile.email}, role="${role}" (raw from DB), force_password_change=${forcePasswordChange}`);
      } catch (error) {
        console.error(`❌ Database query error for userId=${shortenUserId(userId)}:`, error);
        return NextResponse.json({ error: 'Database query failed. Please try again.' }, { status: 500 });
      }
    }
    
    // Ensure role is set
    if (!role || role === '') {
      console.error(`❌ No role available for userId=${shortenUserId(userId)}`);
      return NextResponse.json({ error: 'Invalid user role' }, { status: 400 });
    }
    
    // Normalize role: trim whitespace and convert to lowercase for consistent comparison
    const roleBeforeNormalize = role;
    role = role.trim().toLowerCase();
    console.log(`🔄 redirect API: Role normalization - before="${roleBeforeNormalize}", after="${role}"`);
    
    // If force_password_change is set, redirect to update password page
    if (forcePasswordChange) {
      console.log('⚠️ User must change password, redirecting to update-password page');
      const redirect = NextResponse.redirect(new URL('/update-password', request.url));
      return redirect;
    }
    
    // Determine redirect path based on role (case-insensitive comparison)
    // Use explicit role mapping to ensure correctness
    const roleRoutes: Record<string, string> = {
      'admin': '/admin',
      'super_admin': '/admin',
      'school_admin': '/school-admin',
      'teacher': '/teacher',
      'student': '/student',
    };
    
    let redirectPath = roleRoutes[role] || '/login';
    
    console.log(`🔍 Determining redirect path for role="${role}" (normalized)`);
    console.log(`🔍 Role mapping lookup: role="${role}" -> path="${redirectPath}"`);
    
    if (!redirectPath || redirectPath === '/login') {
      console.error(`❌ Unknown or invalid role "${role}" for userId=${shortenUserId(userId)}, redirecting to login`);
      redirectPath = '/login';
    }
    
    console.log(`🔍 Role-based redirect: role="${role}" -> path="${redirectPath}"`);
    console.log(`🎯 FINAL REDIRECT DECISION: userId=${shortenUserId(userId)}, role="${role}", redirectPath="${redirectPath}"`);
    
    // NOTE: Using Supabase sessions only - no custom session management needed
    // Supabase handles session management automatically via JWT tokens
    
    // Create response with redirect
    // Use absolute URL to ensure proper redirect
    const baseUrl = request.nextUrl.origin;
    const redirectUrl = new URL(redirectPath, baseUrl);
    
    console.log(`🎯 FINAL REDIRECT: userId=${shortenUserId(userId)}, role="${role}", redirectPath="${redirectPath}"`);
    console.log(`🎯 Redirect URL: ${redirectUrl.toString()}`);
    console.log(`🎯 Base URL: ${baseUrl}`);
    
    // Use 307 (Temporary Redirect) to ensure browser follows redirect
    const response = NextResponse.redirect(redirectUrl, { status: 307 });
    
    // Ensure CSRF token is set for subsequent requests
    ensureCsrfToken(response, request);
    
    console.log(`✅ Server-side redirect complete: userId=${shortenUserId(userId)}, role="${role}", redirectPath="${redirectPath}"`);
    
    return response;
  } catch (error) {
    console.error('❌ CRITICAL ERROR in GET /api/auth/redirect:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    logger.error('Unexpected error in GET /api/auth/redirect', {
      endpoint: '/api/auth/redirect',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/auth/redirect' },
      'Failed to process redirect'
    );
    
    // Return more detailed error in development
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({
        ...errorInfo,
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, { status: errorInfo.status });
    }
    
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

