import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger, handleApiError } from '../../../../lib/logger';
import { getRequiredEnv } from '../../../../lib/env';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// Helper to get admin user ID from request
async function getAdminUserId(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;

    if (!token) {
      // Try to get from cookies
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        // Extract token from cookies if available
        // For now, we'll use the token from header
      }
    }

    if (!token) {
      return null;
    }

    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) {
      return null;
    }

    // Verify user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
       
      .single() as any;

    if (!profile || profile.role !== 'admin') {
      return null;
    }

    return user.id;
  } catch (error) {
    logger.warn('Error getting admin user ID (non-critical)', {
      endpoint: '/api/admin/security',
    }, error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

// GET: Get security information for admin
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
    const userId = await getAdminUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get last login from profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('last_login')
      .eq('id', userId)
       
      .single() as any;

    // Get failed login attempts count (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: failedAttemptsCount } = await supabaseAdmin
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('success', false)
      .gte('attempted_at', thirtyDaysAgo.toISOString());

    // Get 2FA status from Supabase Auth
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;
    
    let mfaEnabled = false;
    if (token) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          // Check if user has MFA factors enrolled
          // Use REST API to list factors
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');
                    
          const factorsResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}/factors`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'apikey': serviceKey
            }
          });

          if (factorsResponse.ok) {
            const factorsData = await factorsResponse.json();
            const factors = Array.isArray(factorsData) ? factorsData : (factorsData.factors || []);
             
            const totpFactors = factors.filter((f: any) => (f.factor_type === 'totp' || f.type === 'totp') && f.status === 'verified');
            if (totpFactors && totpFactors.length > 0) {
              mfaEnabled = true;
            }
          }
        }
      } catch (error) {
        logger.warn('Error checking MFA status (non-critical)', {
          endpoint: '/api/admin/security',
        }, error instanceof Error ? error : new Error(String(error)));
        // Default to false if we can't check
        mfaEnabled = false;
      }
    }

    return NextResponse.json({
      last_login: profile?.last_login || null,
      failed_login_attempts: failedAttemptsCount || 0,
      mfa_enabled: mfaEnabled
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/security', {
      endpoint: '/api/admin/security',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/security' },
      'Failed to fetch security information'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

