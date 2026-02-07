import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createTeacherSchema, updateTeacherSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { parsePaginationParams, createPaginationResponse, PaginationLimits, parseCursorParams, applyCursorPagination, createCursorResponse } from '../../../../lib/pagination';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../lib/supabase';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

import { addCacheHeaders, CachePresets, checkETag } from '../../../../lib/http-cache';

interface Teacher {
  id: string;
  email?: string;
  temp_password?: string;
  teacher_id?: string;
  full_name?: string;
  phone?: string;
  qualification?: string;
  experience_years?: number;
  specialization?: string;
  address?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

interface Profile {
  id: string;
  email?: string;
}

// GET - Fetch all teachers
export async function GET(request: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return adminCheck.response;
  }

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
    // Get access token for authenticated client
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const accessToken = authHeader.replace('Bearer ', '');
    
    // Create authenticated client with RLS - admin policies will allow access
    const supabase = await createAuthenticatedClient(accessToken);
    
    // Support both cursor and offset pagination for backward compatibility
    const { searchParams } = new URL(request.url);
    const useCursor = searchParams.get('use_cursor') === 'true' || searchParams.has('cursor');
    const cursorParams = parseCursorParams(request);
    const pagination = parsePaginationParams(request, PaginationLimits.MEDIUM, PaginationLimits.MAX);
    
    logger.info('Fetching teachers', {
      endpoint: '/api/admin/teachers',
      useCursor,
      limit: useCursor ? cursorParams.limit : pagination.limit,
      offset: pagination.offset,
    });
    
    // Test basic connection first using authenticated client with RLS
    const { error: testError } = await supabase
      .from('teachers')
      .select('id, full_name, email')
      .limit(1);

    if (testError) {
      logger.error('Database connection test failed', {
        endpoint: '/api/admin/teachers',
      }, testError);
      
      const errorInfo = await handleApiError(
        testError,
        { endpoint: '/api/admin/teachers' },
        'Database connection failed'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    logger.debug('Database connection test passed', {
      endpoint: '/api/admin/teachers',
    });

    // Get total count first using authenticated client with RLS
    const { count: totalCount, error: countError } = await supabase
      .from('teachers')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      logger.warn('Failed to get total count', {
        endpoint: '/api/admin/teachers',
      }, countError);
    }

    // First, try a simple query to get all teachers without joins
    console.log('🔍 Fetching teachers from database...');
    let teachers;
    
    // Try with joins first using authenticated client with RLS
    // Include profile_id if it exists in the teachers table
    let query = supabase
      .from('teachers')
      .select(`
        id,
        teacher_id,
        profile_id,
        full_name,
        email,
        phone,
        qualification,
        experience_years,
        specialization,
        address,
        temp_password,
        status,
        created_at,
        updated_at
      `);

    // Apply pagination
    if (useCursor && cursorParams.cursor) {
      query = applyCursorPagination(query, cursorParams.cursor, cursorParams.direction);
      const cursorLimit = cursorParams.limit ?? PaginationLimits.MEDIUM;
      query = query.limit(cursorLimit + 1); // Fetch one extra to check if there's more
    } else {
      query = query.order('created_at', { ascending: false })
        .range(pagination.offset, pagination.offset + pagination.limit - 1);
    }
    
    const { data: teachersWithJoins, error: joinError } = await query;

    if (joinError) {
      console.warn('⚠️ Error with joins, trying simple query:', joinError.message);
      // Fallback to simple query without joins using authenticated client with RLS
      // Select only needed fields instead of *
      const { data: simpleTeachers, error: simpleError } = await supabase
        .from('teachers')
        .select('id, teacher_id, full_name, email, phone, qualification, experience_years, specialization, address, status, created_at, updated_at')
        .order('created_at', { ascending: false })
         
        .range(pagination.offset, pagination.offset + pagination.limit - 1);
      
      if (simpleError) {
        console.error('❌ Error fetching teachers (simple query):', simpleError);
        return NextResponse.json({ 
          teachers: [], 
          error: simpleError.message 
        });
      }
      teachers = simpleTeachers;
    } else {
      teachers = teachersWithJoins;
    }

    const teachersList = (teachers || []) as Array<{ id: string; email?: string | null; full_name?: string | null }>;
    console.log('📊 Teachers query result:', { 
      teachers: teachersList.length, 
      sample: teachersList[0] ? {
        id: teachersList[0].id,
        email: teachersList[0].email,
        full_name: teachersList[0].full_name
      } : null
    });

    // Return empty array if no teachers found
    if (!teachers || teachers.length === 0) {
      console.log('📭 No teachers found in database');
      let response;
      if (useCursor) {
        response = NextResponse.json({
          teachers: [],
          pagination: {
            nextCursor: undefined,
            prevCursor: undefined,
            hasMore: false
          }
        });
      } else {
        const paginatedResponse = createPaginationResponse([], totalCount || 0, pagination);
        response = NextResponse.json(paginatedResponse);
      }
      Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Fetch school assignments separately for each teacher
    // Since teacher_schools.teacher_id references profiles(id), we need to find profile_id from profiles table
    type Teacher = {
      id: string;
      teacher_id?: string | null;
      profile_id?: string | null;
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
      qualification?: string | null;
      experience_years?: number | null;
      specialization?: string | null;
      address?: string | null;
      status?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
      temp_password?: string | null;
    };
    
    type TeacherSchool = {
      id: string;
      school_id: string;
      grades_assigned?: string[] | null;
      grade_sections_assigned?: string[] | null;
      subjects?: string[] | null;
      working_days_per_week?: number | null;
      max_students_per_session?: number | null;
      is_primary?: boolean | null;
      schools?: {
        id: string;
        name: string | null;
        school_code: string | null;
      } | null;
    };
    
    const teachersWithAssignments = await Promise.all(
      ((teachers || []) as Teacher[]).map(async (teacher) => {
        let teacher_schools: TeacherSchool[] = [];
        
        // Get profile_id - use teacher.profile_id if available, otherwise look up by email
        let profileId: string | null = null;
        
        if (teacher.profile_id) {
          // Use profile_id directly from teachers table if available
          profileId = teacher.profile_id;
          console.log(`Using profile_id from teachers table: ${profileId} for teacher ${teacher.email || teacher.id}`);
        } else if (teacher.email) {
          // Fallback: find profile_id from profiles table using email
          console.log(`profile_id not found in teachers table, looking up by email: ${teacher.email}`);
          try {
            const { data: profile, error: profileError } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .eq('email', teacher.email)
              .maybeSingle();
            
            if (!profileError && profile) {
              profileId = (profile as { id: string }).id;
              console.log(`Found profile_id by email lookup: ${profileId}`);
            } else {
              console.warn(`No profile found for email ${teacher.email}:`, profileError);
            }
          } catch (err) {
            logger.warn('Error finding profile for teacher (non-critical)', {
              endpoint: '/api/admin/teachers',
              teacherId: teacher.id,
            }, err instanceof Error ? err : new Error(String(err)));
          }
        }
        
        // If still no profileId, try to find it from teacher_schools table directly
        if (!profileId && teacher.email) {
          console.log(`Trying alternative: checking teacher_schools for any assignments with email pattern...`);
          // This is a last resort - shouldn't normally be needed
        }
        
        // Fetch school assignments using profile_id
        if (profileId) {
          try {
            const { data: assignments, error: assignmentError } = await supabaseAdmin
              .from('teacher_schools')
              .select(`
                id,
                school_id,
                grades_assigned,
                grade_sections_assigned,
                subjects,
                working_days_per_week,
                max_students_per_session,
                is_primary,
                schools (
                  id,
                  name,
                  school_code
                )
              `)
              .eq('teacher_id', profileId);
            
            if (!assignmentError && assignments) {
              if (assignments.length > 0) {
                teacher_schools = assignments as TeacherSchool[];
                console.log(`✅ Found ${assignments.length} school assignment(s) for teacher ${teacher.email || teacher.id} (profile_id: ${profileId})`);
                console.log('Assignments data:', JSON.stringify(assignments, null, 2));
              } else {
                console.log(`ℹ️ No school assignments found for teacher ${teacher.email || teacher.id} (profile_id: ${profileId})`);
                // Debug: Check if there are any assignments with this teacher_id at all
                const { data: allAssignments, error: debugError } = await supabaseAdmin
                  .from('teacher_schools')
                  .select('teacher_id, school_id')
                  .eq('teacher_id', profileId)
                  .limit(5);
                console.log(`Debug: Checking teacher_schools table for profile_id ${profileId}:`, allAssignments, 'Error:', debugError);
              }
            } else if (assignmentError) {
              console.error(`❌ Error fetching assignments for teacher ${teacher.email || teacher.id}:`, assignmentError);
              console.error('Profile ID used:', profileId, 'Teacher email:', teacher.email);
            }
          } catch (err) {
            logger.warn('Error fetching assignments for teacher (non-critical)', {
              endpoint: '/api/admin/teachers',
              teacherId: teacher.id,
            }, err instanceof Error ? err : new Error(String(err)));
          }
        } else {
          console.log(`⚠️ No profile_id found for teacher ${teacher.email || teacher.id}, trying alternative lookup...`);
          // Last resort: Try to find assignments by querying teacher_schools and matching with schools
          // This shouldn't normally be needed, but helps with edge cases
          if (teacher.email) {
            try {
              // Try to find any teacher_schools that might be linked through a different path
              const { data: allTeacherSchools, error: altError } = await supabaseAdmin
                .from('teacher_schools')
                .select(`
                  id,
                  school_id,
                  grades_assigned,
                  grade_sections_assigned,
                  subjects,
                  working_days_per_week,
                  max_students_per_session,
                  is_primary,
                  schools (
                    id,
                    name,
                    school_code
                  ),
                  profiles!teacher_schools_teacher_id_fkey (
                    id,
                    email
                  )
                `)
                .eq('profiles.email', teacher.email)
                .limit(10);
              
              if (!altError && allTeacherSchools && allTeacherSchools.length > 0) {
                teacher_schools = allTeacherSchools;
                console.log(`✅ Found ${allTeacherSchools.length} assignment(s) using alternative lookup for ${teacher.email}`);
              }
            } catch (altErr) {
              console.warn('Alternative lookup also failed:', altErr);
            }
          }
        }
        
        return {
          id: teacher.id,
          teacher_id: teacher.teacher_id || `TCH-${teacher.id.slice(0, 8).toUpperCase()}`,
          full_name: teacher.full_name || 'Unknown',
          email: teacher.email || '',
          phone: teacher.phone || '',
          qualification: teacher.qualification || '',
          experience_years: teacher.experience_years || 0,
          specialization: teacher.specialization || '',
          status: teacher.status || 'Active', // Use status from database
          created_at: teacher.created_at,
          updated_at: teacher.updated_at,
          temp_password: teacher.temp_password || '',
          teacher_schools: teacher_schools || [] // Include school assignments
        };
      })
    );

    logger.info('Teachers fetched successfully', {
      endpoint: '/api/admin/teachers',
      count: teachersWithAssignments.length,
      total: totalCount || 0,
      limit: useCursor ? cursorParams.limit : pagination.limit,
      offset: pagination.offset,
    });
    
    // Create paginated response
    let responseData: { teachers?: unknown[]; pagination?: unknown; nextCursor?: string; prevCursor?: string; hasMore?: boolean } | { data?: unknown[]; nextCursor?: string; prevCursor?: string; hasMore?: boolean };
    if (useCursor) {
      const cursorLimit = cursorParams.limit ?? PaginationLimits.MEDIUM;
      const cursorResponse = createCursorResponse(
        teachersWithAssignments as Array<{ created_at: string; id: string }>,
        cursorLimit
      );
      responseData = {
        teachers: cursorResponse.data,
        pagination: {
          nextCursor: cursorResponse.nextCursor,
          prevCursor: cursorResponse.prevCursor,
          hasMore: cursorResponse.hasMore
        }
      };
    } else {
      responseData = createPaginationResponse(
        teachersWithAssignments,
        totalCount || teachersWithAssignments.length,
        pagination
      );
    }
    
    const requestStartTime = Date.now();
    const response = NextResponse.json(responseData);
    
    // Add rate limit headers
    Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Add HTTP caching headers (shorter cache for list data)
    addCacheHeaders(response, responseData, {
      ...CachePresets.SEMI_STATIC,
      maxAge: 60, // 1 minute for list data
      staleWhileRevalidate: 120,
      lastModified: new Date()
    });

    // Check ETag for 304 Not Modified
    const etag = response.headers.get('ETag');
    if (etag && checkETag(request, etag)) {
      const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
      recordHttpCacheOperation({
        endpoint: '/api/admin/teachers',
        statusCode: 304,
        is304: true,
        hasETag: true,
        cacheControl: response.headers.get('Cache-Control') || undefined,
        responseSize: 0,
        duration: Date.now() - requestStartTime
      });
      return new NextResponse(null, { status: 304 });
    }

    // Track 200 response
    const { recordHttpCacheOperation } = await import('../../../../lib/http-cache-monitor');
    recordHttpCacheOperation({
      endpoint: '/api/admin/teachers',
      statusCode: 200,
      is304: false,
      hasETag: !!etag,
      cacheControl: response.headers.get('Cache-Control') || undefined,
      responseSize: JSON.stringify(responseData).length,
      duration: Date.now() - requestStartTime
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/teachers', {
      endpoint: '/api/admin/teachers',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teachers' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST - Create a new teacher
export async function POST(request: NextRequest) {
  try {
    // Validate CSRF protection
    const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
    const csrfError = await validateCsrf(request);
    if (csrfError) {
      logger.warn('CSRF validation failed for teacher creation', {
        endpoint: '/api/admin/teachers',
        method: 'POST',
      });
      return csrfError;
    }

    ensureCsrfToken(request);

    // Verify admin access with enhanced logging
    logger.info('Verifying admin access for teacher creation', {
      endpoint: '/api/admin/teachers',
      method: 'POST',
    });
    
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      logger.warn('Admin verification failed for teacher creation', {
        endpoint: '/api/admin/teachers',
        method: 'POST',
        authHeader: request.headers.get('authorization') ? 'Present' : 'Missing',
      });
      return adminCheck.response;
    }

    logger.info('Admin verification passed', {
      endpoint: '/api/admin/teachers',
      method: 'POST',
      userId: adminCheck.userId,
    });
  } catch (error) {
    logger.error('Error in auth verification for teacher creation', {
      endpoint: '/api/admin/teachers',
      method: 'POST',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teachers', method: 'POST' },
      'Authentication verification failed'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }

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
    console.log('➕ Creating teacher...');
    const body = await request.json();
    console.log('📋 Request body:', JSON.stringify(body, null, 2));
    
    // Validate request body
    const validation = validateRequestBody(createTeacherSchema, body);
    if (!validation.success) {
      const errorMessages = validation.details?.issues?.map((e) => `${(e.path as (string | number)[]).join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for teacher creation', {
        endpoint: '/api/admin/teachers',
        errors: errorMessages,
        requestBody: body,
      });

      console.error('❌ Teacher validation failed:', errorMessages);
      console.error('Request body:', body);
      console.error('Detailed issues:', validation.details?.issues);

      return NextResponse.json(
        {
          error: 'Validation failed',
          message: errorMessages,
          details: validation.details?.issues,
        },
        { status: 400 }
      );
    }

    const {
      full_name,
      email,
      phone,
      address,
      qualification,
      experience_years,
      specialization,
      temp_password,
      school_assignments
    } = validation.data;
    
    console.log('📋 Extracted school_assignments:', JSON.stringify(school_assignments, null, 2));
    console.log('📋 school_assignments type:', typeof school_assignments, 'isArray:', Array.isArray(school_assignments), 'length:', school_assignments?.length);

    // Validate password strength (8+ chars, uppercase, lowercase, number)
    if (!temp_password) {
      console.log('❌ Password is required');
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }
    
    const { validatePassword } = await import('../../../../lib/password-validation');
    const passwordValidation = validatePassword(temp_password);
    if (!passwordValidation.valid) {
      console.log('❌ Invalid password:', passwordValidation.errors);
      return NextResponse.json(
        { error: passwordValidation.errors.join('. ') },
        { status: 400 }
      );
    }

    // Check if teacher already exists in teachers table
    const { data: existingTeacher } = await supabaseAdmin
      .from('teachers')
      .select('id, user_id')
      .eq('email', email)
      .maybeSingle();

    if (existingTeacher) {
      console.log('❌ Teacher already exists in teachers table');
      return NextResponse.json(
        { error: 'Teacher with this email already exists in the system' },
        { status: 400 }
      );
    }

    // Step 1: Check if user already exists in Supabase Auth
    console.log('🔍 Checking if user exists in Supabase Auth...');
    let userId: string | null = null;
    
    try {
      const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        logger.warn('Error listing users (non-critical)', {
          endpoint: '/api/admin/teachers',
        }, listError);
        // Continue - we'll try to create the user anyway
      } else {
         
        const existingAuthUser = authUsers?.users?.find((user: { email?: string }) => user.email === email);
        if (existingAuthUser) {
          console.log('✅ Found existing user in Auth:', existingAuthUser.id);
          userId = existingAuthUser.id;
        }
      }
    } catch (error) {
      logger.warn('Error checking existing users (non-critical)', {
        endpoint: '/api/admin/teachers',
      }, error instanceof Error ? error : new Error(String(error)));
      // Continue - we'll try to create the user anyway
    }

    // Step 2: Create user in Supabase Auth if it doesn't exist
    if (!userId) {
      console.log('🔐 Creating new user in Supabase Auth...');
      try {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          password: temp_password,
          email_confirm: true,
          user_metadata: {
            full_name: full_name,
            role: 'teacher'
          }
        });

        if (authError) {
          logger.error('Error creating auth user', {
            endpoint: '/api/admin/teachers',
          }, authError);
          
          const errorInfo = await handleApiError(
            authError,
            { endpoint: '/api/admin/teachers' },
            'Failed to create user account in authentication system'
          );
          return NextResponse.json(errorInfo, { status: errorInfo.status });
        }

        userId = authData.user.id;
        console.log('✅ Created new user in Auth:', userId);
      } catch (authCreateError) {
        console.error('❌ Error in auth user creation:', authCreateError);
        return NextResponse.json({ 
          error: 'Failed to create user account',
          details: authCreateError instanceof Error ? authCreateError.message : 'Unknown error'
        }, { status: 500 });
      }
    } else {
      console.log('📎 Using existing Auth user ID:', userId);
      // Update password for existing user if provided
      if (temp_password) {
        try {
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password: temp_password }
          );
          if (updateError) {
            console.warn('⚠️ Could not update password for existing user:', updateError.message);
            // Continue anyway - password update is optional
          } else {
            console.log('✅ Updated password for existing user');
          }
        } catch (updateError) {
          logger.warn('Error updating password (non-critical)', {
            endpoint: '/api/admin/teachers',
          }, updateError instanceof Error ? updateError : new Error(String(updateError)));
          // Continue anyway
        }
      }
    }

    // Step 3: Prefer direct creation for reliability, with optional RPC if enabled
    const useRpc = process.env.USE_TEACHER_RPC === 'true';
    if (useRpc) {
      logger.info('Using RPC create_teacher_enrollment', { endpoint: '/api/admin/teachers', method: 'POST' });
      const rpcResult = await supabaseAdmin
        .rpc('create_teacher_enrollment', {
          p_user_id: userId,
          p_full_name: full_name,
          p_email: email,
          p_phone: phone || null,
          p_address: address || null,
          p_qualification: qualification || null,
          p_experience_years: experience_years || 0,
          p_specialization: specialization || null,
          p_teacher_id: null,
          p_school_assignments: school_assignments ? JSON.stringify(school_assignments) : '[]'
        } as never);
      const { data: transactionResult, error: transactionError } = rpcResult as { data: { success?: boolean; error?: string } | null; error: unknown };
      const result = transactionResult as { success?: boolean; error?: string } | null;
      if (transactionError || !result?.success) {
        logger.warn('RPC failed, falling back to direct creation', { endpoint: '/api/admin/teachers', method: 'POST' }, transactionError instanceof Error ? transactionError : new Error(String(transactionError || result?.error)));
      } else {
        logger.info('Teacher enrollment created successfully via RPC');
      }
    }

    // Direct creation path
    const generatedTeacherCode = `TCH-${(userId || randomUUID()).toString().slice(0, 8).toUpperCase()}`;

    // Determine primary school_id from assignments (if any)
    const primarySchoolId = school_assignments && school_assignments.length > 0
      ? school_assignments.find((a: { is_primary?: boolean; school_id?: string }) => a.is_primary)?.school_id 
        || school_assignments[0]?.school_id 
        || null
      : null;
    
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        full_name,
        email,
        role: 'teacher',
        phone: phone || null,
        address: address || null,
        school_id: primarySchoolId,
        force_password_change: true,
      } as never);

    if (profileErr) {
      logger.error('Profile upsert failed', { endpoint: '/api/admin/teachers', method: 'POST' }, profileErr);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      const errorInfo = await handleApiError(profileErr, { endpoint: '/api/admin/teachers', method: 'POST' }, 'Failed to create teacher profile');
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Generate UUID for teachers table id (fallback if default doesn't work)
    const teacherId = randomUUID();
    
    const { data: teacherRec, error: teacherErr } = await supabaseAdmin
      .from('teachers')
      .upsert({
        id: teacherId,
        profile_id: userId,
        teacher_id: generatedTeacherCode,
        full_name,
        email,
        phone: phone || null,
        qualification: qualification || null,
        experience_years: experience_years || 0,
        specialization: specialization || null,
        address: address || null,
        status: 'Active',
      } as never, {
        onConflict: 'email',
        ignoreDuplicates: false
      });

    if (teacherErr) {
      logger.error('Teacher upsert failed', { endpoint: '/api/admin/teachers', method: 'POST' }, teacherErr);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      const errorInfo = await handleApiError(teacherErr, { endpoint: '/api/admin/teachers', method: 'POST' }, 'Failed to create teacher record');
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Validate and upsert assignments
    let validAssignments = 0;
    const missingSchools: string[] = [];
    if (Array.isArray(school_assignments) && school_assignments.length > 0) {
      for (const a of school_assignments) {
        const schoolId = a?.school_id;
        if (!schoolId) { continue; }
        const { data: schoolExists } = await supabaseAdmin
          .from('schools')
          .select('id')
          .eq('id', schoolId)
          .maybeSingle();
        if (!schoolExists) {
          missingSchools.push(String(schoolId));
          continue;
        }
        validAssignments++;
        // Convert grade_sections_assigned to JSONB format
        const gradeSectionsJsonb = a?.grade_sections_assigned 
          ? JSON.stringify(a.grade_sections_assigned)
          : null;
        
        // Generate an ID to avoid NOT NULL violations if DB default is missing
        const assignmentId = randomUUID();

        console.log(`📝 Creating teacher_schools assignment for teacher ${userId} to school ${schoolId}:`, {
          teacher_id: userId,
          school_id: schoolId,
          is_primary: a?.is_primary ?? false,
          grades_assigned: a?.grades_assigned,
          grade_sections_assigned: a?.grade_sections_assigned,
          gradeSectionsJsonb: gradeSectionsJsonb
        });
        
        // Use insert with explicit conflict handling to ensure data is saved
        const { data: assignmentData, error: assignErr } = await supabaseAdmin
          .from('teacher_schools')
          .upsert({
            id: assignmentId,
            teacher_id: userId,
            school_id: schoolId,
            grades_assigned: (a?.grades_assigned as string[]) || [],
            grade_sections_assigned: gradeSectionsJsonb || null,
            subjects: (a?.subjects as string[]) || [],
            working_days_per_week: a?.working_days_per_week ?? 5,
            max_students_per_session: a?.max_students_per_session ?? 30,
            is_primary: a?.is_primary ?? false,
            assigned_at: new Date().toISOString(),
          } as never, {
            onConflict: 'teacher_id,school_id',
            ignoreDuplicates: false
          });
          
        if (assignErr) {
          logger.error('Assignment upsert failed', { 
            endpoint: '/api/admin/teachers', 
            method: 'POST', 
            schoolId: schoolId || undefined,
            teacher_id: userId,
            error: assignErr,
            errorDetails: assignErr.message || assignErr
          }, assignErr);
          console.error(`❌ Failed to create assignment:`, assignErr);
        } else {
          console.log(`✅ Successfully assigned teacher ${userId} to school ${schoolId}`);
          if (assignmentData) {
            console.log('Assignment data returned:', JSON.stringify(assignmentData, null, 2));
          }
          
          // Verify the assignment was actually saved by querying it back immediately
          const { data: verifyAssignment, error: verifyError } = await supabaseAdmin
            .from('teacher_schools')
            .select('id, teacher_id, school_id, grades_assigned, grade_sections_assigned, is_primary')
            .eq('teacher_id', userId)
            .eq('school_id', schoolId)
            .maybeSingle();
          
          if (verifyError) {
            console.error(`❌ Verification query failed:`, verifyError);
          } else if (verifyAssignment) {
            console.log(`✅ Verified assignment exists in database:`, JSON.stringify(verifyAssignment, null, 2));
          } else {
            console.error(`❌ CRITICAL: Assignment not found after creation! teacher_id: ${userId}, school_id: ${schoolId}`);
            // Try to find any assignments for this teacher
            const { data: allTeacherAssignments } = await supabaseAdmin
              .from('teacher_schools')
              .select('teacher_id, school_id')
              .eq('teacher_id', userId)
              .limit(5);
            console.log(`All assignments for teacher_id ${userId}:`, allTeacherAssignments);
          }
        }
      }
    }

    // If no valid assignments and schools were requested, return a 400
    if ((school_assignments?.length || 0) > 0 && validAssignments === 0) {
      return NextResponse.json({
        error: 'Validation failed',
        message: 'No valid school assignments. Check school IDs.',
        details: missingSchools,
      }, { status: 400 });
    }
    
    // After all assignments are created, ensure profiles.school_id is set to the primary school
    if (validAssignments > 0) {
      // Find the primary school assignment, or use the first one
      const primaryAssignment = school_assignments?.find((a: { is_primary?: boolean }) => a.is_primary) || school_assignments?.[0];
      const finalSchoolId = primaryAssignment?.school_id;
      
      if (finalSchoolId) {
        // Update profiles.school_id to ensure it's set correctly
        const { error: profileUpdateErr } = await supabaseAdmin
          .from('profiles')
          // @ts-expect-error - Supabase generated types use never for untyped schema
          .update({ school_id: finalSchoolId })
          .eq('id', userId)
          .eq('role', 'teacher');
        
        if (profileUpdateErr) {
          console.warn(`⚠️ Failed to update profiles.school_id for teacher ${userId}:`, profileUpdateErr);
        } else {
          console.log(`✅ Updated profiles.school_id to ${finalSchoolId} for teacher ${userId}`);
        }
      }
    }

    logger.info('Teacher created successfully', {
      endpoint: '/api/admin/teachers',
      teacherId: (teacherRec as { id?: string } | null)?.id || userId,
      email,
      validAssignments,
      missingSchoolsCount: missingSchools.length,
    });

    const response = NextResponse.json({
      success: true,
      teacher: teacherRec || { id: userId, email, full_name },
      message: 'Teacher created successfully'
    }, { status: 201 });
    ensureCsrfToken(response, request);
    Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/teachers', {
      endpoint: '/api/admin/teachers',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teachers' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PUT - Update a teacher
export async function PUT(request: NextRequest) {
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
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(updateTeacherSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e) => `${(e.path as (string | number)[]).join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: errorMessages
        },
        { status: 400 }
      );
    }

    const { id, change_password, temp_password, school_assignments, ...updateData } = validation.data;

    if (!id) {
      return NextResponse.json({ error: 'Teacher ID is required' }, { status: 400 });
    }

    // Handle demo data - skip Supabase auth update
    if (id.startsWith('demo-')) {
      console.log('📝 Updating demo teacher data (skipping Supabase auth)');
      return NextResponse.json({ 
        success: true, 
        teacher: { id, ...updateData, temp_password },
        message: 'Demo teacher updated successfully' 
      });
    }

    // Get current teacher data to find email
    // Note: teachers table doesn't have profile_id column
    const { data: currentTeacher, error: fetchError } = await supabaseAdmin
      .from('teachers')
      .select('email, temp_password')
      .eq('id', id)
      .single();

    if (fetchError || !currentTeacher) {
      console.error('Error fetching teacher:', fetchError);
      return NextResponse.json({ 
        error: 'Teacher not found', 
        details: fetchError?.message 
      }, { status: 404 });
    }

    const teacherData = currentTeacher as Teacher | null;
    if (!teacherData) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }
    // If password change is requested, find profile_id from profiles table and update it in Supabase Auth
    if (change_password && temp_password) {
      console.log('🔐 Changing password for teacher:', teacherData.email);
      
      // Find profile_id from profiles table using email
      let profileId: string | null = null;
      if (teacherData.email) {
        console.log('🔍 Finding profile_id from profiles table...');
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', teacherData.email)
          .maybeSingle();
        
        if (!profileError && profile) {
          profileId = (profile as Profile).id;
          console.log('✅ Found profile_id:', profileId);
        } else {
          console.log('⚠️ No profile found for email:', teacherData.email);
        }
      }
      
      if (!profileId) {
        console.error('❌ No profile_id found for teacher');
        return NextResponse.json(
          { error: 'Cannot change password: Teacher has no associated profile' },
          { status: 400 }
        );
      }

      try {
        // Update password in Supabase Auth
        const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
          profileId,
          { password: temp_password }
        );

        if (updateAuthError) {
          console.error('❌ Error updating password in Supabase Auth:', updateAuthError);
          return NextResponse.json(
            { error: 'Failed to update password in authentication system', details: updateAuthError.message },
            { status: 500 }
          );
        }

        console.log('✅ Password updated in Supabase Auth');
      } catch (authError) {
        console.error('❌ Error in Supabase auth update:', authError);
        return NextResponse.json(
          { error: 'Failed to update password in authentication system', details: authError instanceof Error ? authError.message : 'Unknown error' },
          { status: 500 }
        );
      }
    }

    // Extract fields from validated data (school_assignments already extracted above)
    const { 
      full_name,
      email,
      phone,
      address,
      qualification,
      experience_years,
      specialization
    } = updateData;

    // Handle legacy password update (without change_password flag)
    if (temp_password !== undefined && temp_password !== null && temp_password !== '' && !change_password) {
      console.log('🔐 Updating password for teacher (legacy):', teacherData.email);
      
      // Update password in Supabase Auth
      try {
        const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (!listError && authUsers?.users) {
           
          interface User {
            id?: string;
            email?: string;
          }
          
          const authUser = authUsers.users.find((user: User) => user.email === teacherData.email);
          
          if (authUser) {
            const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
              authUser.id,
              { password: temp_password }
            );
            
            if (updateAuthError) {
              console.error('Error updating Supabase auth password:', updateAuthError);
              return NextResponse.json({ 
                error: 'Failed to update password in authentication system', 
                details: updateAuthError.message 
              }, { status: 500 });
            }
            
            console.log('✅ Password updated in Supabase Auth');
          }
        }
      } catch (authError) {
        console.error('Error in Supabase auth update:', authError);
        return NextResponse.json({ 
          error: 'Failed to update password in authentication system', 
          details: authError instanceof Error ? authError.message : 'Unknown error'
        }, { status: 500 });
      }
    }

    // Find profile_id from profiles table using email (needed for transaction function)
    let teacherProfileId: string | null = null;
    if (teacherData?.email) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', teacherData.email)
        .maybeSingle();
      
      teacherProfileId = (profile as Profile | null)?.id || null;
    }
    
    if (!teacherProfileId) {
      console.error('❌ No profile found for teacher');
      return NextResponse.json(
        { error: 'Teacher profile not found' },
        { status: 404 }
      );
    }

    // Use transaction function to atomically update profile, teacher record, and school assignments
    console.log('🔄 Updating teacher enrollment atomically...');
    
    const rpcUpdateResult = await supabaseAdmin
      .rpc('update_teacher_enrollment', {
        p_user_id: teacherProfileId,
        p_full_name: full_name,
        p_email: email,
        p_phone: phone,
        p_address: address,
        p_qualification: qualification,
        p_experience_years: experience_years,
        p_specialization: specialization,
        p_school_assignments: school_assignments ? JSON.stringify(school_assignments) : null
      } as never);
     
    const { data: transactionResult, error: transactionError } = rpcUpdateResult as { data: { success?: boolean; error?: string } | null; error: unknown };

    const updateResult = transactionResult as { success?: boolean; error?: string } | null;
    if (transactionError || !updateResult?.success) {
      logger.error('Error updating teacher enrollment', {
        endpoint: '/api/admin/teachers',
        method: 'PUT',
      }, transactionError instanceof Error ? transactionError : new Error(String(transactionError || updateResult?.error)));
      
      const errorInfo = await handleApiError(
        transactionError || new Error(updateResult?.error || 'Transaction failed'),
        { endpoint: '/api/admin/teachers', method: 'PUT' },
        'Failed to update teacher enrollment'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    console.log('✅ Teacher enrollment updated successfully');

    // Update temp_password in teachers table if provided (separate from transaction)
    if (change_password && temp_password) {
      const { error: passwordUpdateError } = await supabaseAdmin
        .from('teachers')
        // @ts-expect-error - Supabase generated types use never for untyped schema
        .update({ temp_password })
        .eq('id', id);
      
      if (passwordUpdateError) {
        console.warn('⚠️ Could not update temp_password:', passwordUpdateError);
      }
    }

    // Fetch updated teacher record
    const emailToSearch = email || teacherData.email || '';
    const { data: teacher, error: fetchTeacherError } = await supabaseAdmin
      .from('teachers')
      .select('id, teacher_id, full_name, email, phone, qualification, experience_years, specialization, address, temp_password, status, created_at, updated_at')
      .eq('email', emailToSearch)
      .single();

    if (fetchTeacherError) {
      console.warn('⚠️ Could not fetch updated teacher:', fetchTeacherError);
    }

    // School assignments are now handled by the transaction function above

    console.log('✅ Teacher updated successfully');
    const response = NextResponse.json({ 
      success: true, 
      teacher,
      message: 'Teacher updated successfully' 
    });
    
    // Add rate limit headers
    Object.entries(createRateLimitHeaders(rateLimitResult)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    ensureCsrfToken(response, request);
    logger.info('Teacher updated successfully', {
      endpoint: '/api/admin/teachers',
      teacherId: id,
    });

    return response;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/admin/teachers', {
      endpoint: '/api/admin/teachers',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teachers' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

  // DELETE - Delete a teacher
  export async function DELETE(request: NextRequest) {
    // Validate CSRF protection
    const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
    const csrfError = await validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    ensureCsrfToken(request);

    try {
      console.log('🗑️ Deleting teacher...');
      const body = await request.json();
      console.log('📋 Request body:', JSON.stringify(body, null, 2));
      const { id, teacher_id, email } = body;

      // Try to get ID from multiple possible fields
      const teacherIdToDelete = id || teacher_id || email;
      
      if (!teacherIdToDelete) {
        console.log('❌ No teacher ID provided in request body');
        console.log('📋 Available fields:', Object.keys(body));
        return NextResponse.json({ 
          error: 'Teacher ID is required',
          receivedBody: body
        }, { status: 400 });
      }

      // Normalize the ID - trim whitespace and ensure it's a string
      const normalizedId = typeof teacherIdToDelete === 'string' ? teacherIdToDelete.trim() : String(teacherIdToDelete).trim();
      
      console.log('📋 Teacher ID to delete:', normalizedId);
      console.log('📋 Teacher ID type:', typeof normalizedId);
      console.log('📋 Teacher ID length:', normalizedId?.length);
      console.log('📋 Original ID from body:', { id, teacher_id, email });

    // Step 1: Get teacher data to find profile_id and user_id
    // Try multiple ways to find the teacher
     
    interface Teacher {
      id?: string;
      email?: string;
      teacher_id?: string;
      full_name?: string;
      profile_id?: string;
    }
    
    let teacher: Teacher | null = null;
    
    // First, try by id (primary key) - use .maybeSingle() to avoid errors
    console.log('🔍 Searching by id (primary key)...');
    console.log('🔍 Normalized ID:', normalizedId);
    console.log('🔍 ID type:', typeof normalizedId);
    
    // Try querying all teachers first to see if we can access the table
    // Note: profile_id may not exist in the teachers table
    const { data: allTeachersTest, error: testError } = await supabaseAdmin
      .from('teachers')
      .select('id, email, teacher_id, full_name')
       
      .limit(100);
    
    if (testError) {
      console.error('❌ Error querying teachers table:', testError);
      return NextResponse.json({ 
        error: 'Database query error',
        details: testError.message,
        code: testError.code
      }, { status: 500 });
    }
    
    console.log('✅ Can query teachers table, found', allTeachersTest?.length || 0, 'teachers');
    
    // Try to find the teacher in the list first (most reliable)
    const teachersList = (allTeachersTest as Array<{ id: string; email?: string; teacher_id?: string; full_name?: string }>) || [];
    const teacherInList = teachersList.find((t: { id: string }) => {
      const dbId = String(t.id).trim();
      const searchId = String(normalizedId).trim();
      return dbId === searchId;
    });
    
    if (teacherInList) {
      teacher = teacherInList;
      console.log('✅ Found teacher in full list:', { id: teacher.id, email: teacher.email, name: teacher.full_name });
    } else {
      console.log('⚠️ Teacher not found in full list, trying .eq() query...');
      console.log('📋 Searching for ID:', normalizedId);
      console.log('📋 Available IDs:', teachersList.map((t: { id: string }) => ({ id: String(t.id).trim(), match: String(t.id).trim() === String(normalizedId).trim() })).slice(0, 5));
      
      // Try with .eq() query as fallback
      const { data: teacherById, error: errorById } = await supabaseAdmin
        .from('teachers')
        .select('id, email, teacher_id, full_name')
        .eq('id', normalizedId)
        .maybeSingle();

      if (errorById) {
        console.error('❌ Error querying by id:', errorById);
      } else if (teacherById) {
        teacher = teacherById as Teacher;
        console.log('✅ Found teacher by id query:', { id: teacher.id, email: teacher.email, name: teacher.full_name });
      } else {
        console.log('⚠️ Teacher not found by id query, trying direct list query...');
        const { data: teachersListData, error: listError } = await supabaseAdmin
          .from('teachers')
          .select('id, email, teacher_id, full_name')
          .eq('id', normalizedId);
        
        if (listError) {
          console.error('❌ Error in direct query:', listError);
        } else if (teachersListData && teachersListData.length > 0) {
          teacher = teachersListData[0] as Teacher;
          console.log('✅ Found teacher via direct query:', teacher);
        } else {
          console.log('⚠️ No teachers found with id:', normalizedId);
          console.log('📋 Available IDs in database:', teachersList.map((t: { id: string }) => String(t.id).trim()).slice(0, 5));
        }
      }
    }

    // If still not found, try by teacher_id
    if (!teacher) {
      console.log('⚠️ Teacher not found by id, trying teacher_id...');
      // Try by teacher_id if id didn't work
      const { data: teacherByTeacherId, error: errorByTeacherId } = await supabaseAdmin
        .from('teachers')
        .select('id, email, teacher_id, full_name')
        .eq('teacher_id', normalizedId)
        .maybeSingle();

      if (errorByTeacherId) {
        console.error('❌ Error querying by teacher_id:', errorByTeacherId);
      } else if (teacherByTeacherId) {
        teacher = teacherByTeacherId as Teacher;
        console.log('✅ Found teacher by teacher_id:', { id: teacher.id, teacher_id: teacher.teacher_id, email: teacher.email, name: teacher.full_name });
      } else {
        // If the id looks like an email, try searching by email as a last resort
        if (normalizedId && normalizedId.includes('@')) {
          console.log('📧 ID looks like an email, trying to find by email...');
          const { data: teacherByEmail, error: emailError } = await supabaseAdmin
            .from('teachers')
            .select('id, email, teacher_id, full_name')
            .eq('email', normalizedId)
            .maybeSingle();
          
          if (emailError) {
            console.error('❌ Error querying by email:', emailError);
          } else if (teacherByEmail) {
            teacher = teacherByEmail as Teacher;
            console.log('✅ Found teacher by email:', { id: teacher.id, email: teacher.email, name: teacher.full_name });
          }
        }
      }
    }

    if (!teacher) {
      console.error('❌ Teacher not found by any method');
      
      // Try to list all teachers to see what IDs exist (for debugging)
      const { data: allTeachers, error: listError } = await supabaseAdmin
        .from('teachers')
        .select('id, teacher_id, email, full_name')
         
        .limit(10);
      
      if (listError) {
        console.error('❌ Error listing teachers:', listError);
      } else {
        const allTeachersTyped = (allTeachers as Array<{ id: string; teacher_id?: string; email?: string; full_name?: string }>) || [];
        console.log('📋 Sample teachers in database:', allTeachersTyped.map((t: { id: string; teacher_id?: string; email?: string; full_name?: string }) => ({
          id: t.id,
          id_type: typeof t.id,
          id_length: t.id?.length,
          teacher_id: t.teacher_id,
          email: t.email,
          name: t.full_name
        })));
      }
      
      return NextResponse.json({ 
        error: 'Teacher not found',
        details: `No teacher found with ID: ${normalizedId}`,
        searchedId: normalizedId,
        originalId: id,
        searchedIdType: typeof normalizedId,
        hint: 'Tried searching by id, teacher_id, and email (if applicable)'
      }, { status: 404 });
    }

    // Use the actual teacher.id from the database, not the request id
    const actualTeacherId = teacher.id;
    // Note: teacher_schools.teacher_id references profiles.id, not teachers.id
    // We need to find the profile_id from the profiles table using the teacher's email
    console.log('📋 Actual Teacher ID (from DB):', actualTeacherId);
    console.log('📋 Email:', teacher.email);

    // Step 2: Find profile_id from profiles table using email
    let profileId: string | null = null;
    if (teacher.email) {
      console.log('🔍 Finding profile_id from profiles table...');
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', teacher.email)
        .maybeSingle();
      
      if (!profileError && profile) {
        profileId = (profile as Profile).id;
        console.log('✅ Found profile_id:', profileId);
      } else {
        console.log('⚠️ No profile found for email:', teacher.email);
      }
    }

    // Step 3: Delete school assignments (teacher_schools) using profile_id
    // Note: teacher_schools.teacher_id references profiles.id
    if (profileId) {
      console.log('🏫 Deleting school assignments...');
      const { error: assignmentsError } = await supabaseAdmin
        .from('teacher_schools')
        .delete()
        .eq('teacher_id', profileId);

      if (assignmentsError) {
        console.error('⚠️ Error deleting school assignments:', assignmentsError);
        // Continue anyway - assignments might not exist
      } else {
        console.log('✅ School assignments deleted');
      }
    } else {
      console.log('⚠️ Skipping school assignments deletion (no profile_id found)');
    }

    // Step 4: Delete from teachers table using the actual teacher ID from database
    if (actualTeacherId == null) {
      return NextResponse.json({ error: 'Teacher ID not found' }, { status: 400 });
    }
    console.log('👤 Deleting from teachers table with ID:', actualTeacherId);
    const { error: teacherDeleteError } = await supabaseAdmin
      .from('teachers')
      .delete()
      .eq('id', actualTeacherId);

    if (teacherDeleteError) {
      console.error('❌ Error deleting from teachers table:', teacherDeleteError);
      return NextResponse.json({ 
        error: 'Failed to delete teacher from database',
        details: teacherDeleteError.message 
      }, { status: 500 });
    }
    console.log('✅ Deleted from teachers table');

    // Step 5: Delete from profiles table
    if (profileId) {
      console.log('👤 Deleting from profiles table...');
      const { error: profileDeleteError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', profileId);

      if (profileDeleteError) {
        console.error('⚠️ Error deleting from profiles:', profileDeleteError);
        // Continue anyway - profile might have been deleted by cascade
      } else {
        console.log('✅ Deleted from profiles table');
      }
    }

    // Step 6: Delete from Supabase Auth
    if (teacher.email) {
      console.log('🔐 Deleting from Supabase Auth...');
      try {
        // List all users to find the one with matching email
        const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (!listError && authUsers?.users) {
           
          interface User {
            id?: string;
            email?: string;
          }
          
          const authUser = authUsers.users.find((user: User) => user.email === teacher.email);
          
          if (authUser) {
            console.log('🔍 Found auth user:', authUser.id);
            const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
            
            if (deleteAuthError) {
              console.error('⚠️ Error deleting auth user:', deleteAuthError);
              // Continue anyway - auth deletion is not critical
            } else {
              console.log('✅ Deleted from Supabase Auth');
            }
          } else {
            console.log('⚠️ Auth user not found for email:', teacher.email);
          }
        } else {
          logger.warn('Error listing auth users (non-critical)', {
            endpoint: '/api/admin/teachers',
            method: 'DELETE',
          }, listError || undefined);
        }
      } catch (authError) {
        logger.warn('Error in auth deletion (non-critical)', {
          endpoint: '/api/admin/teachers',
          method: 'DELETE',
        }, authError instanceof Error ? authError : new Error(String(authError)));
        // Continue anyway - teacher record is already deleted
      }
    }

    console.log('✅ Teacher deleted successfully');
    const successResponse = NextResponse.json({ 
      success: true, 
      message: 'Teacher deleted successfully' 
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/admin/teachers', {
      endpoint: '/api/admin/teachers',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/teachers' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
