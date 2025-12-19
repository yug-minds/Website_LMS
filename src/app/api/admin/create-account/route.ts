/**
 * Unified Account Creation Endpoint
 * 
 * This endpoint allows creating accounts for any role:
 * - Admin
 * - School Admin
 * - Teacher
 * - Student
 * 
 * Only admins can use this endpoint.
 * 
 * Example request for Student:
 * {
 *   "role": "student",
 *   "email": "student@example.com",
 *   "password": "password123",
 *   "full_name": "John Doe",
 *   "school_id": "uuid-here",
 *   "grade": "Grade 5"
 * }
 * 
 * Example request for Teacher:
 * {
 *   "role": "teacher",
 *   "email": "teacher@example.com",
 *   "password": "password123",
 *   "full_name": "Jane Smith",
 *   "school_assignments": [{
 *     "school_id": "uuid-here",
 *     "grades_assigned": ["Grade 5"],
 *     "subjects": ["Math"]
 *   }]
 * }
 * 
 * Example request for School Admin:
 * {
 *   "role": "school_admin",
 *   "email": "admin@example.com",
 *   "password": "password123",
 *   "full_name": "Bob Johnson",
 *   "school_id": "uuid-here"
 * }
 * 
 * Example request for Admin:
 * {
 *   "role": "admin",
 *   "email": "admin@example.com",
 *   "password": "StrongPassword123!",
 *   "full_name": "System Admin"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { AccountCreationService, CreateAccountParams } from '../../../../lib/account-creation-service';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createAccountSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
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
    // 1. Verify only admins can create accounts
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(createAccountSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for account creation', {
        endpoint: '/api/admin/create-account',
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

    // 2. Parse request body
    const { role, email, password, full_name, school_id, grade, phone, address, parent_name, parent_phone } = validation.data;

    // 4. Validate role
    const validRoles = ['admin', 'school_admin', 'teacher', 'student'];
    if (typeof role !== 'string' || !validRoles.includes(role)) {
      return NextResponse.json(
        { 
          error: 'Invalid role',
          validRoles,
          received: role
        },
        { status: 400 }
      );
    }

    // 5. Use the account creation service
    const result = await AccountCreationService.createAccount(validation.data as CreateAccountParams);

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error,
          role
        },
        { status: 400 }
      );
    }

    // 6. Return success response
    const successResponse = NextResponse.json({
      success: true,
      message: `${role} account created successfully`,
      userId: result.userId,
      data: result.data
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;

  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/create-account', {
      endpoint: '/api/admin/create-account',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/create-account' },
      'Failed to create account'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

