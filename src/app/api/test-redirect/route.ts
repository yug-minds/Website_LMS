import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { logger, handleApiError } from '../../../lib/logger';
import { ensureCsrfToken } from '../../../lib/csrf-middleware';

/**
 * Test endpoint to verify redirect logic
 * Call this with: /api/test-redirect?email=admin@yugminds.com
 */
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
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    
    if (!email) {
      return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });
    }
    
    // Find user by email
    const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }
    
     
    const user = users?.users?.find((u: any) => u.email === email);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Get profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
       
      .single() as any;
    
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    
    const role = profile.role?.trim().toLowerCase();
    
    // Determine redirect path
    const roleRoutes: Record<string, string> = {
      'admin': '/admin',
      'super_admin': '/admin',
      'school_admin': '/school-admin',
      'teacher': '/teacher',
      'student': '/student',
    };
    
    const redirectPath = roleRoutes[role] || '/login';
    
    return NextResponse.json({
      userId: user.id,
      email: user.email,
      role: profile.role,
      roleNormalized: role,
      redirectPath: redirectPath,
      test: 'This is what the redirect API should return',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/test-redirect', {
      endpoint: '/api/test-redirect',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/test-redirect' },
      'Failed to process redirect test'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}


