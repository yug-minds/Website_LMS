import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { logger, handleApiError } from '../../../../lib/logger';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createSchoolSchema, validateRequestBody } from '../../../../lib/validation-schemas';


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
    logger.info('Fetching schools', {
      endpoint: '/api/admin/schools',
    });

    const { data: schools, error } = await supabaseAdmin
      .from('schools')
      // Include all fields needed by the Schools Management table UI
      .select(`
        id,
        name,
        school_code,
        is_active,
        grades_offered,
        contact_email,
        contact_phone,
        address,
        city,
        state,
        country,
        pincode,
        established_year,
        affiliation_type,
        school_type,
        logo_url,
        total_students_estimate,
        total_teachers_estimate,
        principal_name,
        created_at,
        created_by
      `)
       
      .order('name', { ascending: true }) as any;

    if (error) {
      logger.error('Failed to fetch schools', {
        endpoint: '/api/admin/schools',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/schools' },
        'Failed to fetch schools'
      );
      return NextResponse.json({ 
        schools: [],
        ...errorInfo
      }, { status: errorInfo.status });
    }

    // Check if no schools found
    if (!schools || schools.length === 0) {
      logger.info('No schools found in database', {
        endpoint: '/api/admin/schools',
      });
      return NextResponse.json({ schools: [] });
    }

    logger.info('Schools fetched successfully', {
      endpoint: '/api/admin/schools',
      count: schools.length,
      activeCount: schools.filter((s: { is_active?: boolean }) => s.is_active !== false).length,
    });
    
    // Filter out inactive schools if needed, but log them
    const activeSchools = schools.filter((s: { is_active?: boolean }) => s.is_active !== false);
    if (activeSchools.length !== schools.length) {
      logger.warn('Some schools are inactive', {
        endpoint: '/api/admin/schools',
        total: schools.length,
        active: activeSchools.length,
        inactive: schools.length - activeSchools.length,
      });
    }

    return NextResponse.json({ schools: schools || [] });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/schools', {
      endpoint: '/api/admin/schools',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/schools' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Legacy code removed - was causing build errors

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
    logger.info('School creation API called', {
      endpoint: '/api/admin/schools',
      method: 'POST',
    });

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(createSchoolSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for school creation', {
        endpoint: '/api/admin/schools',
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

    const {
      name,
      contact_email,
      contact_phone,
      established_year,
      address,
      city,
      state,
      pincode,
      affiliation_type,
      school_type,
      school_logo,
      school_admin_name,
      school_admin_email,
      school_admin_phone,
      school_admin_temp_password,
      principal_name,
      principal_phone,
      grades_offered,
      total_students_estimate,
      total_teachers_estimate,
      generate_joining_codes,
      usage_type,
      max_uses,
      manual_codes
    } = { ...validation.data, ...body }; // Merge validated data with additional fields

    // Create school
    const { data: school, error: schoolError } = await (supabaseAdmin
      .from('schools')
      .insert({
        name,
        contact_email,
        contact_phone,
        principal_name: principal_name || school_admin_name || 'Principal',
        principal_phone: principal_phone || school_admin_phone || '',
        established_year: established_year || new Date().getFullYear(),
        address,
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        affiliation_type: affiliation_type || '',
        school_type: school_type || '',
        logo_url: school_logo || '',
        total_students_estimate: total_students_estimate || 0,
        total_teachers_estimate: total_teachers_estimate || 0,
        grades_offered: grades_offered || []
       
      } as any)
      .select()
       
      .single() as any);

    if (schoolError) {
      logger.error('Failed to create school', {
        endpoint: '/api/admin/schools',
        method: 'POST',
      }, schoolError);
      
      const errorInfo = await handleApiError(
        schoolError,
        { endpoint: '/api/admin/schools', method: 'POST' },
        'Failed to create school'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Create school admin record with auth user and profile
    if (school_admin_name && school_admin_email && school_admin_phone) {
      logger.debug('Creating school admin with auth user', {
        endpoint: '/api/admin/schools',
        method: 'POST',
        schoolId: school.id,
      });
      const finalPassword = school_admin_temp_password || 'TempPass123';

      // Step 1: Check if user already exists in Supabase Auth
      let userId: string | null = null;
      
      try {
        const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          logger.warn('Error listing users (non-critical)', {
            endpoint: '/api/admin/schools',
            method: 'POST',
            email: school_admin_email,
          }, listError);
          // Continue - we'll try to create the user anyway
        } else {
           
          const existingAuthUser = authUsers?.users?.find((user: any) => user.email === school_admin_email);
          if (existingAuthUser) {
            logger.debug('Found existing user in Auth', {
              endpoint: '/api/admin/schools',
              method: 'POST',
              userId: existingAuthUser.id,
            });
            userId = existingAuthUser.id;
          }
        }
      } catch (error) {
        logger.warn('Error checking existing users (non-critical)', {
          endpoint: '/api/admin/schools',
          method: 'POST',
        }, error instanceof Error ? error : new Error(String(error)));
        // Continue - we'll try to create the user anyway
      }

      // Step 2: Create user in Supabase Auth if it doesn't exist
      if (!userId) {
        logger.debug('Creating new user in Supabase Auth', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          email: school_admin_email,
        });
        try {
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: school_admin_email,
            password: finalPassword,
            email_confirm: true,
            user_metadata: {
              full_name: school_admin_name,
              role: 'school_admin'
            }
          });

          if (authError) {
            logger.warn('Error creating auth user (non-critical)', {
              endpoint: '/api/admin/schools',
              method: 'POST',
              email: school_admin_email,
            }, authError);
          } else {
            userId = authData.user.id;
            logger.info('Created new user in Auth', {
              endpoint: '/api/admin/schools',
              method: 'POST',
              userId: userId || undefined,
            });
          }
        } catch (authCreateError) {
          logger.warn('Error in auth user creation (non-critical)', {
            endpoint: '/api/admin/schools',
            method: 'POST',
          }, authCreateError instanceof Error ? authCreateError : new Error(String(authCreateError)));
        }
      } else {
        logger.debug('Using existing Auth user ID', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          userId,
        });
        // Update password for existing user
        if (finalPassword) {
          try {
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
              userId,
              { password: finalPassword }
            );
            if (updateError) {
              logger.warn('Could not update password for existing user', {
                endpoint: '/api/admin/schools',
                method: 'POST',
                userId,
              }, updateError);
            } else {
              logger.debug('Updated password for existing user', {
                endpoint: '/api/admin/schools',
                method: 'POST',
                userId,
              });
            }
          } catch (updateError) {
            logger.warn('Error updating password (non-critical)', {
              endpoint: '/api/admin/schools',
              method: 'POST',
            }, updateError instanceof Error ? updateError : new Error(String(updateError)));
          }
        }
      }

      // Step 3: Create or update profile if we have a userId
      if (userId) {
        logger.debug('Creating/updating profile', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          userId,
        });
        const { error: profileError } = await (supabaseAdmin
          .from('profiles')
          .upsert({
            id: userId,
            full_name: school_admin_name,
            email: school_admin_email,
            role: 'school_admin',
            school_id: school.id,
            phone: school_admin_phone || null
           
          } as any, {
            onConflict: 'id'
           
          }) as any);

        if (profileError) {
          logger.error('Failed to create/update profile', {
            endpoint: '/api/admin/schools',
            method: 'POST',
            userId,
          }, profileError);
        } else {
          logger.debug('Profile created/updated', {
            endpoint: '/api/admin/schools',
            method: 'POST',
            userId,
          });
        }
      }

      // Step 4: Create school admin record
      // First check if a school admin with this email already exists
      const { data: existingAdmin, error: checkError } = await supabaseAdmin
        .from('school_admins')
        .select('id, email, school_id')
        .eq('email', school_admin_email)
         
        .maybeSingle() as any;

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" which is fine
        logger.warn('Error checking for existing school admin (non-critical)', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          email: school_admin_email,
        }, checkError);
      }

      let schoolAdminData;
      let schoolAdminError;

      if (existingAdmin) {
        // Update existing school admin
        if (existingAdmin.school_id !== school.id) {
          logger.warn('School admin already exists for different school', {
            endpoint: '/api/admin/schools',
            method: 'POST',
            email: school_admin_email,
            existingSchoolId: existingAdmin.school_id,
            newSchoolId: school.id,
          });
        }
        logger.debug('Updating existing school admin', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          adminId: existingAdmin.id,
        });
         
        const { data: updatedAdmin, error: updateError } = await ((supabaseAdmin as any)
          .from('school_admins')
          .update({
            profile_id: userId,
            school_id: school.id,
            full_name: school_admin_name,
            phone: school_admin_phone,
            temp_password: finalPassword,
            is_active: true,
            updated_at: new Date().toISOString()
           
          } as any)
           
          .eq('id', existingAdmin.id as any)
          .select()
           
          .single() as any) as any;

        schoolAdminData = updatedAdmin ? (Array.isArray(updatedAdmin) ? updatedAdmin[0] : updatedAdmin) : null;
        schoolAdminError = updateError;
      } else {
        // Create new school admin
        logger.debug('Creating new school admin record', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          userId: userId ?? undefined,
          schoolId: school.id,
        });
        const { data: newAdmin, error: insertError } = await (supabaseAdmin
          .from('school_admins')
          .insert({
            profile_id: userId, // Link to profile (which links to auth user)
            school_id: school.id,
            full_name: school_admin_name,
            email: school_admin_email,
            phone: school_admin_phone,
            temp_password: finalPassword,
            is_active: true,
            permissions: {},
            created_at: new Date().toISOString()
           
          } as any)
          .select()
           
          .single() as any);

        schoolAdminData = newAdmin ? (Array.isArray(newAdmin) ? newAdmin[0] : newAdmin) : null;
        schoolAdminError = insertError;
      }

      if (schoolAdminError) {
        logger.error('Failed to create/update school admin record', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          schoolId: school.id,
          email: school_admin_email,
        }, schoolAdminError);
        // Don't fail the entire school creation, but log the error clearly
      } else if (schoolAdminData) {
        logger.info('School admin created/updated successfully', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          adminId: schoolAdminData.id,
          email: schoolAdminData.email,
          schoolId: schoolAdminData.school_id,
        });
      } else {
        logger.warn('School admin creation returned no data', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          schoolId: school.id,
        });
      }
    }

    // Generate joining codes if requested
    let joiningCodes = {};
    if (generate_joining_codes && grades_offered && grades_offered.length > 0) {
      logger.debug('Generating joining codes for school', {
        endpoint: '/api/admin/schools',
        method: 'POST',
        schoolId: school.id,
        grades: grades_offered,
        usageType: usage_type,
        maxUses: max_uses,
      });
      
      try {
        // Generate codes directly in the API instead of using database function
        const schoolNameShort = name.split(' ').map((word: string) => word[0]).join('').toUpperCase().substring(0, 3);
        const generatedCodes: Record<string, string> = {};
        
        for (const grade of grades_offered) {
          let code: string;
          let attempts = 0;
          
          do {
            const gradeAbbr = grade.replace('Grade ', 'G').replace('Pre-K', 'PK').replace('Kindergarten', 'K');
            const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            code = `${schoolNameShort}-${gradeAbbr}-${randomNum}`;
            attempts++;
          } while (attempts < 10); // Prevent infinite loop
          
          // Insert the code into the database
          const { error: insertError } = await (supabaseAdmin
            .from('join_codes')
            .insert({
              code,
              school_id: school.id,
              grade,
              is_active: true,
              usage_type: usage_type || 'multiple',
              times_used: 0,
              max_uses: max_uses || null,
              expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year from now
             
            } as any) as any);
          
          if (insertError) {
            logger.warn('Failed to insert joining code for grade', {
              endpoint: '/api/admin/schools',
              method: 'POST',
              grade,
              schoolId: school.id,
            }, insertError);
          } else {
            generatedCodes[grade] = code;
            logger.debug('Generated joining code for grade', {
              endpoint: '/api/admin/schools',
              method: 'POST',
              grade,
              code,
            });
          }
        }
        
        joiningCodes = generatedCodes;
        logger.info('All joining codes generated successfully', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          schoolId: school.id,
          count: Object.keys(generatedCodes).length,
        });
      } catch (codesErr) {
        logger.error('Joining codes generation failed', {
          endpoint: '/api/admin/schools',
          method: 'POST',
          schoolId: school.id,
        }, codesErr instanceof Error ? codesErr : new Error(String(codesErr)));
      }
    } else {
      logger.debug('Skipping joining codes generation', {
        endpoint: '/api/admin/schools',
        method: 'POST',
        generateJoiningCodes: generate_joining_codes,
        gradesOffered: grades_offered,
      });
    }

    logger.info('School created successfully', {
      endpoint: '/api/admin/schools',
      method: 'POST',
      schoolId: school.id,
      hasJoiningCodes: Object.keys(joiningCodes).length > 0,
    });

    return NextResponse.json({ 
      success: true, 
      school,
      joining_codes: joiningCodes,
      message: 'School created successfully' 
    });
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/schools', {
      endpoint: '/api/admin/schools',
      method: 'POST',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/schools', method: 'POST' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Update school
export async function PUT(request: NextRequest) {
  
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
    const { schoolId, ...updateData } = body;

    if (!schoolId) {
      return NextResponse.json(
        { error: 'School ID is required' },
        { status: 400 }
      );
    }

     
    const { data: school, error } = await ((supabaseAdmin as any)
      .from('schools')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
       
      } as any)
      .eq('id', schoolId)
      .select()
       
      .single() as any) as any;

    if (error) {
      logger.error('School update error', {
        endpoint: '/api/admin/schools',
        method: 'PUT',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/schools', method: 'PUT' },
        'Failed to update school'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    return NextResponse.json({ 
      success: true, 
      school,
      message: 'School updated successfully' 
    });
  } catch (error) {
    logger.error('Unexpected error in PUT /api/admin/schools', {
      endpoint: '/api/admin/schools',
      method: 'PUT',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/schools', method: 'PUT' },
      'Failed to update school'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// Toggle school status
export async function PATCH(request: NextRequest) {
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
    const { schoolId, is_active } = body;

    if (!schoolId || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'School ID and status are required' },
        { status: 400 }
      );
    }

     
    const { data: school, error } = await ((supabaseAdmin as any)
      .from('schools')
      .update({
        is_active,
        updated_at: new Date().toISOString()
       
      } as any)
       
      .eq('id', schoolId as any)
      .select()
       
      .single() as any) as any;

    if (error) {
      logger.error('School status update error', {
        endpoint: '/api/admin/schools',
        method: 'PATCH',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/schools', method: 'PATCH' },
        'Failed to update school status'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    return NextResponse.json({ 
      success: true, 
      school,
      message: 'School status updated successfully' 
    });
  } catch (error) {
    logger.error('Unexpected error in PATCH /api/admin/schools', {
      endpoint: '/api/admin/schools',
      method: 'PATCH',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/schools', method: 'PATCH' },
      'Failed to update school status'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

export async function DELETE(request: NextRequest) {
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
    const { schoolId } = await request.json();

    if (!schoolId) {
      return NextResponse.json(
        { error: 'School ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(schoolId)) {
      return NextResponse.json(
        { error: 'Invalid school ID format' },
        { status: 400 }
      );
    }

    logger.info('Starting school deletion', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });

    // Delete in correct order to handle foreign key constraints
    // 1. Delete related joining codes
    logger.debug('Step 1: Deleting joining codes', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: codesError } = await supabaseAdmin
      .from('join_codes')
      .delete()
      .eq('school_id', schoolId);

    if (codesError) {
      logger.warn('Failed to delete joining codes (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, codesError);
    } else {
      logger.debug('Joining codes deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 2. Delete teachers that belong ONLY to this school (BEFORE deleting assignments)
    // First, get all teachers associated with this school
    logger.debug('Step 2a: Finding teachers associated with this school', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { data: teacherAssignments, error: teacherAssignmentsError } = await supabaseAdmin
      .from('teacher_schools')
      .select('teacher_id')
       
      .eq('school_id', schoolId) as any;

    if (!teacherAssignmentsError && teacherAssignments && teacherAssignments.length > 0) {
      const teacherProfileIds = [...new Set(teacherAssignments.map((ta: { teacher_id: string }) => ta.teacher_id))];
      logger.debug('Found teachers associated with school', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
        teacherCount: teacherProfileIds.length,
      });

      // For each teacher, check if they belong to other schools
      const teachersToDelete: string[] = [];
      const teachersToKeep: string[] = [];

      for (const teacherProfileId of teacherProfileIds) {
         
        const { data: otherAssignments, error: otherAssignmentsError } = await ((supabaseAdmin as any)
          .from('teacher_schools')
          .select('school_id')
          .eq('teacher_id', teacherProfileId as string)
           
          .neq('school_id', schoolId as string)) as any;

        if (!otherAssignmentsError && otherAssignments && otherAssignments.length > 0) {
          // Teacher belongs to other schools, just remove the association
          teachersToKeep.push(String(teacherProfileId as unknown as string));
        } else {
          // Teacher belongs only to this school, mark for deletion
          teachersToDelete.push(String(teacherProfileId));
        }
      }

      logger.debug('Teacher deletion plan', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
        toDelete: teachersToDelete.length,
        toKeep: teachersToKeep.length,
      });

      // Delete teacher records that belong only to this school
      if (teachersToDelete.length > 0) {
        logger.debug('Step 2b: Deleting teacher records', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
          count: teachersToDelete.length,
        });
        
        // Get teacher emails from profiles to find teachers by email
        const { data: teacherProfiles, error: profilesFetchError } = await supabaseAdmin
          .from('profiles')
          .select('id, email')
           
          .in('id', teachersToDelete) as any;

        if (!profilesFetchError && teacherProfiles && teacherProfiles.length > 0) {
          const teacherEmails = teacherProfiles.map((p: { email?: string }) => p.email).filter(Boolean);
          
          if (teacherEmails.length > 0) {
            // Delete from teachers table by email (since profile_id column may not exist)
            const { error: teachersDeleteError } = await supabaseAdmin
              .from('teachers')
              .delete()
              .in('email', teacherEmails);

            if (teachersDeleteError) {
              logger.warn('Failed to delete teacher records (non-critical)', {
                endpoint: '/api/admin/schools',
                method: 'DELETE',
                schoolId,
              }, teachersDeleteError);
            } else {
              logger.debug('Deleted teacher records', {
                endpoint: '/api/admin/schools',
                method: 'DELETE',
                schoolId,
                count: teacherEmails.length,
              });
            }
          }

          // Delete profiles and auth users for these teachers
          for (const profileId of teachersToDelete) {
            try {
              // Delete profile
              await supabaseAdmin.from('profiles').delete().eq('id', profileId);
              // Delete auth user
              await supabaseAdmin.auth.admin.deleteUser(profileId);
            } catch (err) {
              logger.warn('Failed to delete profile/auth for teacher (non-critical)', {
                endpoint: '/api/admin/schools',
                method: 'DELETE',
                schoolId,
                profileId,
              }, err instanceof Error ? err : new Error(String(err)));
            }
          }
        }
      }
    }

    // 3. Delete students that belong ONLY to this school (BEFORE deleting assignments)
    // First, get all students associated with this school
    logger.debug('Step 3a: Finding students associated with this school', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { data: studentAssignments, error: studentAssignmentsError } = await supabaseAdmin
      .from('student_schools')
      .select('student_id')
       
      .eq('school_id', schoolId) as any;

    if (!studentAssignmentsError && studentAssignments && studentAssignments.length > 0) {
      const studentProfileIds = [...new Set(studentAssignments.map((sa: { student_id: string }) => sa.student_id))];
      logger.debug('Found students associated with school', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
        studentCount: studentProfileIds.length,
      });

      // For each student, check if they belong to other schools
      const studentsToDelete: string[] = [];
      const studentsToKeep: string[] = [];

      for (const studentProfileId of studentProfileIds) {
         
        const { data: otherStudentAssignments, error: otherStudentAssignmentsError } = await ((supabaseAdmin as any)
          .from('student_schools')
          .select('school_id')
          .eq('student_id', studentProfileId as string)
           
          .neq('school_id', schoolId as string)) as any;

        if (!otherStudentAssignmentsError && otherStudentAssignments && otherStudentAssignments.length > 0) {
          // Student belongs to other schools, just remove the association
          studentsToKeep.push(String(studentProfileId));
        } else {
          // Student belongs only to this school, mark for deletion
          studentsToDelete.push(String(studentProfileId as unknown as string));
        }
      }

      logger.debug('Student deletion plan', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
        toDelete: studentsToDelete.length,
        toKeep: studentsToKeep.length,
      });

      // Delete student records that belong only to this school
      if (studentsToDelete.length > 0) {
        logger.debug('Step 3b: Deleting student records', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
          count: studentsToDelete.length,
        });
        
        // Delete student_schools records (students table is deprecated)
        // student_schools records will be deleted via CASCADE when profiles are deleted
        // But we can also explicitly delete them here for clarity
        const { error: studentSchoolsDeleteError } = await supabaseAdmin
          .from('student_schools')
          .delete()
          .in('student_id', studentsToDelete);

        if (studentSchoolsDeleteError) {
          logger.warn('Failed to delete student_schools records (non-critical)', {
            endpoint: '/api/admin/schools',
            method: 'DELETE',
            schoolId,
          }, studentSchoolsDeleteError);
        } else {
          logger.debug('Deleted student_schools records', {
            endpoint: '/api/admin/schools',
            method: 'DELETE',
            schoolId,
            count: studentsToDelete.length,
          });
        }

        // Delete profiles and auth users for these students
        for (const profileId of studentsToDelete) {
          try {
            // Delete profile
            await supabaseAdmin.from('profiles').delete().eq('id', profileId);
            // Delete auth user
            await supabaseAdmin.auth.admin.deleteUser(profileId);
          } catch (err) {
            logger.warn('Failed to delete profile/auth for student (non-critical)', {
              endpoint: '/api/admin/schools',
              method: 'DELETE',
              schoolId,
              profileId,
            }, err instanceof Error ? err : new Error(String(err)));
          }
        }
      }
    }

    // 4. Delete student-school assignments (after checking which students to delete)
    logger.debug('Step 4: Deleting student-school assignments', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: studentSchoolsError } = await supabaseAdmin
      .from('student_schools')
      .delete()
      .eq('school_id', schoolId);

    if (studentSchoolsError) {
      logger.warn('Failed to delete student-school assignments (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, studentSchoolsError);
    } else {
      logger.debug('Student-school assignments deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 5. Delete teacher-school assignments (after checking which teachers to delete)
    logger.debug('Step 5: Deleting teacher-school assignments', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: teacherSchoolsError } = await supabaseAdmin
      .from('teacher_schools')
      .delete()
      .eq('school_id', schoolId);

    if (teacherSchoolsError) {
      logger.warn('Failed to delete teacher-school assignments (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, teacherSchoolsError);
    } else {
      logger.debug('Teacher-school assignments deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 6. Delete school admin records
    logger.debug('Step 6: Deleting school admin records', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: schoolAdminsError } = await supabaseAdmin
      .from('school_admins')
      .delete()
      .eq('school_id', schoolId);

    if (schoolAdminsError) {
      logger.warn('Failed to delete school admin records (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, schoolAdminsError);
    } else {
      logger.debug('School admin records deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 7. NOTE: Courses are NOT deleted as they can be assigned to multiple schools
    // Only remove school_id reference from courses (if needed)
    logger.debug('Step 7: Removing school_id from courses (courses are preserved)', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
     
    const { error: coursesUpdateError } = await ((supabaseAdmin as any)
      .from('courses')
       
      .update({ school_id: null } as any)
       
      .eq('school_id', schoolId)) as any;

    if (coursesUpdateError) {
      logger.warn('Failed to remove school_id from courses (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, coursesUpdateError);
    } else {
      logger.debug('Removed school_id from courses (courses preserved)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 8. Delete teacher classes first (they reference classes)
    logger.debug('Step 8: Deleting teacher classes', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: teacherClassesError } = await supabaseAdmin
      .from('teacher_classes')
      .delete()
      .eq('school_id', schoolId);

    if (teacherClassesError) {
      logger.warn('Failed to delete teacher classes (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, teacherClassesError);
    } else {
      logger.debug('Teacher classes deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 9. Delete classes for this school (after teacher_classes)
    logger.debug('Step 9: Deleting classes', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: classesError } = await supabaseAdmin
      .from('classes')
      .delete()
      .eq('school_id', schoolId);

    if (classesError) {
      logger.warn('Failed to delete classes (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, classesError);
    } else {
      logger.debug('Classes deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 10. Delete teacher reports for this school
    logger.debug('Step 10: Deleting teacher reports', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: reportsError } = await supabaseAdmin
      .from('teacher_reports')
      .delete()
      .eq('school_id', schoolId);

    if (reportsError) {
      logger.warn('Failed to delete teacher reports (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, reportsError);
    } else {
      logger.debug('Teacher reports deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 11. Delete teacher leaves for this school
    logger.debug('Step 11: Deleting teacher leaves', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: leavesError } = await supabaseAdmin
      .from('teacher_leaves')
      .delete()
      .eq('school_id', schoolId);

    if (leavesError) {
      logger.warn('Failed to delete teacher leaves (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, leavesError);
    } else {
      logger.debug('Teacher leaves deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 12. Delete class schedules for this school (must be before periods and rooms)
    logger.debug('Step 12: Deleting class schedules (before periods/rooms)', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: schedulesError } = await supabaseAdmin
      .from('class_schedules')
      .delete()
      .eq('school_id', schoolId);

    if (schedulesError) {
      logger.warn('Failed to delete class schedules (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, schedulesError);
    } else {
      logger.debug('Class schedules deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 13. Delete periods for this school (after class_schedules)
    logger.debug('Step 13: Deleting periods', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: periodsError } = await supabaseAdmin
      .from('periods')
      .delete()
      .eq('school_id', schoolId);

    if (periodsError) {
      logger.warn('Failed to delete periods (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, periodsError);
    } else {
      logger.debug('Periods deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 14. Delete rooms for this school (after class_schedules)
    logger.debug('Step 14: Deleting rooms', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: roomsError } = await supabaseAdmin
      .from('rooms')
      .delete()
      .eq('school_id', schoolId);

    if (roomsError) {
      logger.warn('Failed to delete rooms (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, roomsError);
    } else {
      logger.debug('Rooms deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 15. Delete attendance records for this school
    logger.debug('Step 15: Deleting attendance records', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: attendanceError } = await supabaseAdmin
      .from('attendance')
      .delete()
      .eq('school_id', schoolId);

    if (attendanceError) {
      logger.warn('Failed to delete attendance records (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, attendanceError);
    } else {
      logger.debug('Attendance records deleted', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 16. Delete teacher attendance for this school (use attendance table, teacher_attendance is deprecated)
    logger.debug('Step 16: Deleting teacher attendance', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    // Get all teacher profile IDs first
    const { data: teacherProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
       
      .eq('role', 'teacher') as any;
    
    const teacherIds = teacherProfiles?.map((p: { id: string }) => p.id) || [];
    
    // Delete attendance records for teachers in this school
     
    let teacherAttendanceError: any = null;
    if (teacherIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('attendance')
        .delete()
        .eq('school_id', schoolId)
        .in('user_id', teacherIds);
      
      teacherAttendanceError = error;
      
      if (teacherAttendanceError) {
        logger.warn('Failed to delete attendance records (non-critical)', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
        }, teacherAttendanceError);
      } else {
        logger.debug('Deleted teacher attendance records', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
        });
      }
    } else {
      // If no teachers found, just delete all attendance for this school
      const { error: directDeleteError } = await supabaseAdmin
        .from('attendance')
        .delete()
        .eq('school_id', schoolId);
      
      teacherAttendanceError = directDeleteError;
      
      if (teacherAttendanceError) {
        logger.warn('Failed to delete attendance records (non-critical)', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
        }, teacherAttendanceError);
      } else {
        logger.debug('Deleted attendance records for school', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
        });
      }
    }

    // 17. Check for any other tables that might reference schools
    // Delete any notifications for users in this school
    logger.debug('Step 18: Cleaning up notifications', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { data: profilesForNotifications, error: profilesForNotificationsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
       
      .eq('school_id', schoolId) as any;

    if (!profilesForNotificationsError && profilesForNotifications && profilesForNotifications.length > 0) {
      const profileIds = profilesForNotifications.map((p: { id: string }) => p.id);
      
      // Check if notifications table exists and has user_id column
      const { error: notificationsError } = await supabaseAdmin
        .from('notifications')
        .delete()
        .in('user_id', profileIds);

      if (notificationsError && !notificationsError.message.includes('does not exist')) {
        logger.warn('Failed to delete notifications (non-critical)', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
        }, notificationsError);
      } else {
        logger.debug('Notifications cleaned up', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
        });
      }
    }

    // 19. CRITICAL: Update profiles to remove school_id reference BEFORE deleting school
    // The foreign key constraint profiles_school_id_fkey doesn't allow deletion while references exist
    logger.debug('Step 19: Removing school_id from profiles (CRITICAL for foreign key constraint)', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { data: profilesToUpdate, error: profilesFetchError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
       
      .eq('school_id', schoolId) as any;

    if (profilesFetchError) {
      logger.warn('Failed to fetch profiles (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, profilesFetchError);
    } else if (profilesToUpdate && profilesToUpdate.length > 0) {
      logger.debug('Found profiles to update', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
        count: profilesToUpdate.length,
      });
      
      // Update profiles to remove school_id reference
       
      const { error: profilesUpdateError } = await ((supabaseAdmin as any)
        .from('profiles')
         
        .update({ school_id: null } as any)
         
        .eq('school_id', schoolId as any)) as any;

      if (profilesUpdateError) {
        logger.error('Failed to update profiles (CRITICAL)', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
        }, profilesUpdateError);
        
        const errorInfo = await handleApiError(
          profilesUpdateError,
          { endpoint: '/api/admin/schools', method: 'DELETE', schoolId },
          'Failed to remove school_id from profiles. Cannot delete school while profiles reference it.'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      } else {
        logger.debug('Updated profiles - removed school_id reference', {
          endpoint: '/api/admin/schools',
          method: 'DELETE',
          schoolId,
          count: profilesToUpdate.length,
        });
      }
    } else {
      logger.debug('No profiles to update', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      });
    }

    // 20. Check if there are any other foreign key references
    // Handle schools.created_by if it references profiles
    logger.debug('Step 20: Clearing created_by references', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
     
    const { error: schoolUpdateError } = await ((supabaseAdmin as any)
      .from('schools')
       
      .update({ created_by: null } as any)
       
      .eq('id', schoolId as any)) as any;

    if (schoolUpdateError) {
      logger.warn('Failed to clear created_by (non-critical)', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, schoolUpdateError);
    }

    // 21. Finally delete the school
    logger.debug('Step 21: Deleting school record', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    const { error: schoolError } = await supabaseAdmin
      .from('schools')
      .delete()
      .eq('id', schoolId);

    if (schoolError) {
      logger.error('Failed to delete school', {
        endpoint: '/api/admin/schools',
        method: 'DELETE',
        schoolId,
      }, schoolError);
      
      const errorInfo = await handleApiError(
        schoolError,
        { endpoint: '/api/admin/schools', method: 'DELETE', schoolId },
        'Failed to delete school'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }
    
    logger.info('School deleted successfully', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
      schoolId,
    });
    
    const successResponse = NextResponse.json({ 
      success: true, 
      message: 'School deleted successfully' 
    });
    const { ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/admin/schools', {
      endpoint: '/api/admin/schools',
      method: 'DELETE',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/schools', method: 'DELETE' },
      'Internal server error'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
