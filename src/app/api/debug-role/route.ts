import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase'
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { logger, handleApiError } from '../../../lib/logger';
import { ensureCsrfToken } from '../../../lib/csrf-middleware';

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
		const { searchParams } = new URL(request.url)
		const email = searchParams.get('email')
		
		if (!email) {
			return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 })
		}
		
		// Find user by email
		const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers()
		
		if (userError) {
			return NextResponse.json({ error: userError.message }, { status: 500 })
		}
		
   
		const user = users?.users?.find((u: any) => u.email === email)
		
		if (!user) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 })
		}
		
		// Get profile
		const { data: profile, error: profileError } = await supabaseAdmin
			.from('profiles')
			.select('*')
			.eq('id', user.id)
			.single()
		
		if (profileError) {
			return NextResponse.json({ error: profileError.message }, { status: 500 })
		}
		
   
		const profileData = profile as any;
		return NextResponse.json({
			userId: user.id,
			email: user.email,
			userMetadata: user.user_metadata,
			profile: profileData,
			roleFromProfile: profileData?.role,
			roleNormalized: profileData?.role?.trim().toLowerCase(),
			debug: {
				roleType: typeof profileData?.role,
				roleLength: profileData?.role?.length,
				roleValue: JSON.stringify(profileData?.role),
			}
		})
	} catch (error) {
		logger.error('Unexpected error in GET /api/debug-role', {
			endpoint: '/api/debug-role',
   
		}, error instanceof Error ? error : new Error(String(error))) as any;
		
		const errorInfo = await handleApiError(
			error,
			{ endpoint: '/api/debug-role' },
			'Failed to debug role'
		);
		return NextResponse.json(errorInfo, { status: errorInfo.status });
	}
}


