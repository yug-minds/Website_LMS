import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { mfaActionSchema, validateRequestBody, idSchema } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { getRequiredEnv } from '../../../../../lib/env';
import { z } from 'zod';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';

// Local uuidSchema since it's not exported from validation-schemas
const uuidSchema = z.string().uuid('Invalid UUID format');


// Helper to get admin user ID from request
async function getAdminUserId(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;

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
      endpoint: '/api/admin/security/mfa',
    }, error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

// POST: Enable 2FA - Generate TOTP secret
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
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
    const userId = await getAdminUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(mfaActionSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for MFA action', {
        endpoint: '/api/admin/security/mfa',
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

    const { action, code } = validation.data;

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication token required' },
        { status: 401 }
      );
    }

    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (action === 'enable') {
      // Generate TOTP secret for enrollment
      try {
        // Use REST API directly for MFA enrollment (more reliable than client methods)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');

        // Try the correct Supabase Auth Admin API endpoint
        // For local Supabase, the endpoint might be slightly different
        const endpoint = `${supabaseUrl}/auth/v1/admin/users/${user.id}/factors`;
        
        console.log('Attempting MFA enrollment:', {
          endpoint,
          userId: user.id,
          supabaseUrl
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'apikey': serviceKey
          },
          body: JSON.stringify({
            friendly_name: 'Admin 2FA',
            factor_type: 'totp'
          })
        });

        let responseData;
        try {
          responseData = await response.json();
        } catch (parseError) {
          // If response is not JSON, get text
          const text = await response.text();
          logger.error('Error enrolling MFA - Non-JSON response', {
            endpoint: '/api/admin/security/mfa',
            status: response.status,
          }, parseError instanceof Error ? parseError : new Error(String(parseError)));
          
          const errorInfo = await handleApiError(
            new Error(`Server returned: ${text || 'Unknown error'} (Status: ${response.status || 500})`),
            { endpoint: '/api/admin/security/mfa' },
            'Failed to enable 2FA'
          );
          return NextResponse.json(errorInfo, { status: errorInfo.status });
        }

        if (!response.ok) {
          console.error('Error enrolling MFA:', {
            status: response.status,
            statusText: response.statusText,
            data: responseData
          });
          
          // Provide more detailed error message
          const errorMsg = responseData.error || 
                          responseData.message || 
                          responseData.error_description || 
                          responseData.error_msg ||
                          `HTTP ${response.status}: ${response.statusText}`;
          
          return NextResponse.json(
            { 
              error: 'Failed to enable 2FA', 
              details: errorMsg
            },
            { status: response.status || 500 }
          );
        }

        // The response should contain qr_code, secret, and id (factorId)
        return NextResponse.json({
          success: true,
          qr_code: responseData.qr_code || null,
          secret: responseData.secret || null,
          uri: responseData.uri || null,
          factorId: responseData.id || null
        });
       
      } catch (error: any) {
        logger.error('Error in MFA enrollment', {
          endpoint: '/api/admin/security/mfa',
        }, error instanceof Error ? error : new Error(String(error)));
        
        const errorInfo = await handleApiError(
          error,
          { endpoint: '/api/admin/security/mfa' },
          'Failed to enable 2FA'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }
      } else if (action === 'disable') {
      // Get all factors and unenroll TOTP
      try {
        // Use REST API to list factors
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');
                
        const listResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}/factors`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey
          }
        });

        const factorsData = await listResponse.json();

        if (!listResponse.ok) {
          logger.error('Error listing MFA factors', {
            endpoint: '/api/admin/security/mfa',
          }, new Error(factorsData.error || factorsData.message || 'Unknown error'));
          
          const errorInfo = await handleApiError(
            new Error(factorsData.error || factorsData.message || 'Unknown error'),
            { endpoint: '/api/admin/security/mfa' },
            'Failed to list MFA factors'
          );
          return NextResponse.json(errorInfo, { status: errorInfo.status });
        }

        const factors = Array.isArray(factorsData) ? factorsData : (factorsData.factors || []);

        // Filter TOTP factors
         
        const totpFactors = factors.filter((f: any) => f.factor_type === 'totp' || f.type === 'totp');
        
        if (totpFactors && totpFactors.length > 0) {
          for (const factor of totpFactors) {
            const factorId = factor.id || factor.factor_id;
            
            const unenrollResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}/factors/${factorId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${serviceKey}`,
                'apikey': serviceKey
              }
            });

            if (!unenrollResponse.ok) {
              const unenrollData = await unenrollResponse.json();
              logger.error('Error unenrolling MFA factor', {
                endpoint: '/api/admin/security/mfa',
              }, new Error(unenrollData.error || unenrollData.message || 'Unknown error'));
              
              const errorInfo = await handleApiError(
                new Error(unenrollData.error || unenrollData.message || 'Unknown error'),
                { endpoint: '/api/admin/security/mfa' },
                'Failed to disable 2FA'
              );
              return NextResponse.json(errorInfo, { status: errorInfo.status });
            }
          }
        } else {
          // No factors to disable
          return NextResponse.json({
            success: true,
            message: '2FA was not enabled'
          });
        }

        return NextResponse.json({
          success: true,
          message: '2FA disabled successfully'
        });
       
      } catch (error: any) {
        logger.error('Error in MFA unenrollment', {
          endpoint: '/api/admin/security/mfa',
        }, error instanceof Error ? error : new Error(String(error)));
        
        const errorInfo = await handleApiError(
          error,
          { endpoint: '/api/admin/security/mfa' },
          'Failed to disable 2FA'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "enable" or "disable"' },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/security/mfa', {
      endpoint: '/api/admin/security/mfa',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/security/mfa' },
      'Failed to process MFA action'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PUT: Verify and complete 2FA enrollment
export async function PUT(request: NextRequest) {
  const { ensureCsrfToken } = await import('../../../../../lib/csrf-middleware');
  
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
    const userId = await getAdminUserId(request);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate request body - verify action requires code and factorId
    const verifySchema = mfaActionSchema.extend({
      factorId: uuidSchema,
      code: z.string().min(6).max(10, 'TOTP code must be 6-10 characters'),
    });
    
    const validation = validateRequestBody(verifySchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for MFA verification', {
        endpoint: '/api/admin/security/mfa',
        method: 'PATCH',
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

    const { code, factorId } = validation.data;

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || null;

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication token required' },
        { status: 401 }
      );
    }

    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify the TOTP code - Use REST API for verification
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');
        
    // First, create a challenge
    const challengeResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}/factors/${factorId}/challenge`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'apikey': serviceKey
      }
    });

    const challengeData = await challengeResponse.json();

    if (!challengeResponse.ok || !challengeData) {
      return NextResponse.json(
        { error: 'Failed to create verification challenge', details: challengeData.error || challengeData.message || 'Unknown error' },
        { status: challengeResponse.status || 500 }
      );
    }

    // Verify the TOTP code with the challenge
    const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}/factors/${factorId}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'apikey': serviceKey
      },
      body: JSON.stringify({
        challenge_id: challengeData.id,
        code: code
      })
    });

    const verifyData = await verifyResponse.json();
    const error = !verifyResponse.ok ? { message: verifyData.error || verifyData.message || 'Verification failed' } : null;
    const data = verifyResponse.ok ? verifyData : null;

    if (error) {
      return NextResponse.json(
        { error: 'Invalid verification code', details: error.message },
        { status: 400 }
      );
    }

    const successResponse = NextResponse.json({
      success: true,
      message: '2FA enabled successfully'
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/admin/security/mfa', {
      endpoint: '/api/admin/security/mfa',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/security/mfa' },
      'Failed to verify MFA'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

