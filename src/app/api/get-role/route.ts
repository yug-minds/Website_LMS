import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createAuthenticatedClient } from '../../../lib/supabase'
import { getAuthenticatedUserId } from '../../../lib/auth-utils'
import { shortenUserId } from '../../../lib/utils'
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { logger, handleApiError } from '../../../lib/logger';
import { ensureCsrfToken } from '../../../lib/csrf-middleware';

// Disable all caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
		const userId = searchParams.get('userId')
		if (!userId) {
			return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
		}
		
		console.log(`🔍 get-role API called: userId=${shortenUserId(userId)}`);
		
		// Get access token if available
		const authHeader = request.headers.get('authorization');
		const accessToken = authHeader?.replace('Bearer ', '');
		
		// If user is authenticated, use RLS-enabled client
		// (This endpoint is also used during login, so we allow unauthenticated access with admin client)
		const authenticatedUserId = await getAuthenticatedUserId(request);
		
		let profileData, profileError;
		
		if (accessToken && authenticatedUserId) {
			// Use authenticated client with RLS
			console.log(`🔍 get-role API: Using authenticated client with RLS for userId=${shortenUserId(userId)}`);
			const supabase = await createAuthenticatedClient(accessToken);
			
			// If authenticated user is not the requested user, check if they're admin
			if (authenticatedUserId !== userId) {
				const { data: profile } = await supabase
					.from('profiles')
					.select('role')
					.eq('id', authenticatedUserId)
      
					.single() as any;
				
				if (profile?.role !== 'admin') {
					return NextResponse.json({ 
						error: 'Forbidden', 
						message: 'You can only access your own role' 
					}, { status: 403 });
				}
			}
			
			// Fetch profile with RLS - policies will enforce access
			const result = await supabase
				.from('profiles')
				.select('id, role, email, force_password_change, full_name')
				.eq('id', userId)
     
				.single() as any;
			
			profileData = result.data;
			profileError = result.error;
		} else {
			// Fallback to admin client for unauthenticated access (e.g., during login)
			// This is a special case where we need to check role before authentication is complete
			console.log(`🔍 get-role API: Using admin client (unauthenticated) for userId=${shortenUserId(userId)}`);
			try {
				const result = await supabaseAdmin
					.from('profiles')
					.select('id, role, email, force_password_change, full_name')
					.eq('id', userId)
	     
					.single() as any;
				
				profileData = result.data;
				profileError = result.error;
			} catch (adminError: any) {
				console.error(`❌ get-role API: Error using admin client:`, adminError);
				profileError = adminError;
				profileData = null;
			}
		}
		
		if (profileError) {
			console.error(`❌ get-role API: Error fetching profile for userId=${shortenUserId(userId)}:`, profileError);
			console.error(`❌ Error details:`, JSON.stringify(profileError, null, 2));
			return NextResponse.json({ error: profileError.message }, { status: 500 })
		}
		
		if (!profileData) {
			console.error(`❌ get-role API: No profile data found for userId=${shortenUserId(userId)}`);
			return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
		}
		
		console.log(`🔍 get-role API: Raw profile data from DB:`, JSON.stringify(profileData, null, 2));
		
		let role = profileData?.role ?? null
		
		console.log(`🔍 get-role API: userId=${shortenUserId(userId)}, email=${profileData.email}, role from DB="${role}" (raw, type: ${typeof role})`)
		
		// Normalize role: trim whitespace and convert to lowercase
		if (role) {
			const roleBeforeNormalize = role;
			role = String(role).trim().toLowerCase();
			console.log(`🔄 get-role API: Role normalization - before="${roleBeforeNormalize}", after="${role}"`);
		} else {
			console.error(`❌ get-role API: Role is null or undefined for userId=${shortenUserId(userId)}`);
		}
		
		console.log(`✅ get-role API: userId=${shortenUserId(userId)}, email=${profileData.email}, role="${role}" (normalized)`)
		
		// If user is a school admin, check if they are active
		if (role === 'school_admin') {
			// Use admin client for this check as it's a system-level check
			const { data: schoolAdminData, error: schoolAdminError } = await supabaseAdmin
				.from('school_admins')
				.select('is_active')
				.eq('profile_id', userId)
     
				.maybeSingle() as any;
			
			if (schoolAdminError) {
				console.warn('Error checking school admin status:', schoolAdminError)
				// If we can't check, allow login (fail open for now)
			} else if (schoolAdminData && !schoolAdminData.is_active) {
				return NextResponse.json({ 
					error: 'Your account has been deactivated. Please contact your administrator.',
					role: null,
					isActive: false
				}, { status: 403 })
			}
		}
		
		// Return role and additional profile data to avoid duplicate queries
		// Add explicit cache headers to prevent caching
		const response = NextResponse.json({ 
			role,
			email: profileData.email,
			force_password_change: profileData.force_password_change || false
		});
		
		// Prevent any caching of this response
		response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
		response.headers.set('Pragma', 'no-cache');
		response.headers.set('Expires', '0');
		
		return response;
	} catch (error) {
		logger.error('Unexpected error in GET /api/get-role', {
			endpoint: '/api/get-role',
		}, error instanceof Error ? error : new Error(String(error)));
		
		const errorInfo = await handleApiError(
			error,
			{ endpoint: '/api/get-role' },
			'Failed to get user role'
		);
		return NextResponse.json(errorInfo, { status: errorInfo.status });
	}
}



