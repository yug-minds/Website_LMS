import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createAuthenticatedClient } from '../../../lib/supabase'
import { getAuthenticatedUserId } from '../../../lib/auth-utils'
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../lib/rate-limit';
import { validateRequestBody, updateProfileSchema } from '../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../lib/logger';
import { ensureCsrfToken } from '../../../lib/csrf-middleware';


export async function GET(request: NextRequest) {
	
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
		
		// Get access token from Authorization header
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return NextResponse.json({ error: 'Unauthorized - Missing or invalid Authorization header' }, { status: 401 });
		}
		
		const accessToken = authHeader.replace('Bearer ', '');
		
		// Verify user is authenticated
		const authenticatedUserId = await getAuthenticatedUserId(request);
		if (!authenticatedUserId) {
			console.error(`❌ Profile API: No authenticated user found for userId=${userId}`)
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		
		// Create authenticated client with RLS enabled
		const supabase = await createAuthenticatedClient(accessToken);
		
		// Verify user can only access their own profile (unless they're admin)
		// RLS will also enforce this, but we check here for better error messages
		const { data: profile } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', authenticatedUserId)
			.single()
		
		if (profile?.role !== 'admin' && authenticatedUserId !== userId) {
			return NextResponse.json({ 
				error: 'Forbidden', 
				message: 'You can only access your own profile' 
			}, { status: 403 })
		}
		
		// Use authenticated client with RLS - policies will enforce access
		const { data, error } = await supabase
			.from('profiles')
			.select('id, full_name, email, phone, role, school_id, parent_name, parent_phone, created_at, updated_at')
			.eq('id', userId)
			.single()
			
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		
		// Normalize role in response for consistent comparison
		if (data && data.role) {
    
			data.role = data.role.trim().toLowerCase() as any;
		}
		
		return NextResponse.json({ profile: data })
	} catch (error) {
		logger.error('Unexpected error in GET /api/profile', {
			endpoint: '/api/profile',
		}, error instanceof Error ? error : new Error(String(error)));
		
		const errorInfo = await handleApiError(
			error,
			{ endpoint: '/api/profile' },
			'Failed to fetch profile'
		);
		return NextResponse.json(errorInfo, { status: errorInfo.status });
	}
}

// PUT: Update user profile
export async function PUT(request: NextRequest) {
	// Validate CSRF protection
	const { validateCsrf, ensureCsrfToken } = await import('../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
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
		const body = await request.json();
		
    // Validate request body
    const validation = validateRequestBody(updateProfileSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for profile update', {
        endpoint: '/api/profile',
        errors: errorMessages,
      });
      
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { userId, full_name, phone } = validation.data;

		// Get access token from Authorization header
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return NextResponse.json({ error: 'Unauthorized - Missing or invalid Authorization header' }, { status: 401 });
		}
		
		const accessToken = authHeader.replace('Bearer ', '');
		
		// Verify user is authenticated
		const authenticatedUserId = await getAuthenticatedUserId(request);
		if (!authenticatedUserId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Create authenticated client with RLS enabled
		const supabase = await createAuthenticatedClient(accessToken);

		// Verify user can only update their own profile (unless they're admin)
		// RLS will also enforce this, but we check here for better error messages
		const { data: profile } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', authenticatedUserId)
    
			.single() as any;

		if (profile?.role !== 'admin' && authenticatedUserId !== userId) {
			return NextResponse.json({ 
				error: 'Forbidden', 
				message: 'You can only update your own profile' 
			}, { status: 403 });
		}

		// Build update object
   
		const updateData: any = {};
		if (full_name !== undefined) {
			updateData.full_name = full_name;
		}
		if (phone !== undefined) {
			updateData.phone = phone;
		}

		if (Object.keys(updateData).length === 0) {
			return NextResponse.json(
				{ error: 'At least one field (full_name or phone) is required' },
				{ status: 400 }
			);
		}

		console.log('📝 Updating profile:', { userId, updateData });

		// Update profile using authenticated client with RLS - policies will enforce access
		const { data: updatedProfile, error: updateError } = await supabase
			.from('profiles')
			.update(updateData)
			.eq('id', userId)
			.select()
    
			.single() as any;

		if (updateError) {
			console.error('❌ Error updating profile:', updateError);
			return NextResponse.json(
				{ error: 'Failed to update profile', details: updateError.message },
				{ status: 500 }
			);
		}

		console.log('✅ Profile updated successfully:', updatedProfile);
		console.log('📊 Updated values:', {
			full_name: updatedProfile?.full_name,
			phone: updatedProfile?.phone
		});

		// Wait a moment for database write to complete
		await new Promise(resolve => setTimeout(resolve, 200));

		// Verify the update by fetching again with RLS
		const { data: verifiedProfile, error: verifyError } = await supabase
			.from('profiles')
			.select('id, full_name, email, phone, role, school_id, parent_name, parent_phone, created_at, updated_at')
			.eq('id', userId)
    
			.single() as any;

		if (verifyError) {
			console.warn('⚠️ Could not verify update:', verifyError);
			// Still return the updated profile from the update response
			return NextResponse.json({
				profile: updatedProfile,
				message: 'Profile updated successfully (verification failed)'
			});
		} else {
			console.log('✅ Verified profile data:', verifiedProfile);
			console.log('📊 Verified values:', {
				full_name: verifiedProfile?.full_name,
				phone: verifiedProfile?.phone
			});
			// Use verified data - this ensures we return what's actually in the database
			if (verifiedProfile) {
				return NextResponse.json({
					profile: verifiedProfile,
					message: 'Profile updated successfully'
				});
			}
		}

		// Fallback to updated profile if verification didn't return data
		const successResponse = NextResponse.json({
			profile: updatedProfile,
			message: 'Profile updated successfully'
		});
		ensureCsrfToken(successResponse, request);
		return successResponse;
	} catch (error) {
		logger.error('Unexpected error in PUT /api/profile', {
			endpoint: '/api/profile',
		}, error instanceof Error ? error : new Error(String(error)));
		
		const errorInfo = await handleApiError(
			error,
			{ endpoint: '/api/profile' },
			'Failed to update profile'
		);
		return NextResponse.json(errorInfo, { status: errorInfo.status });
	}
}
