import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, createAuthenticatedClient } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { createSchoolAdminSchema, updateSchoolAdminSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../lib/logger';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: list school admins with optional filters
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
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }
    
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
    
    if (!request || !request.url) {
      console.error('❌ Invalid request object');
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const status = (searchParams.get('status') || 'all').toLowerCase();
    const schoolId = searchParams.get('schoolId') || '';

    console.log('🔍 Fetching school admins with filters:', { search, status, schoolId: schoolId || undefined });

    // First, let's check if we can access the table at all using authenticated client with RLS
    const { count, error: countError } = await supabase
      .from('school_admins')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error counting school admins:', countError);
    } else {
      console.log(`📊 Total school admins in database: ${count || 0}`);
    }

    // Query school_admins table using authenticated client with RLS
    // RLS policies will automatically allow admin access
    let query = supabase
      .from('school_admins')
      .select('id, profile_id, school_id, full_name, email, phone, temp_password, is_active, permissions, last_login, created_at, updated_at, created_by')
      .order('created_at', { ascending: false });

    if (status === 'active') query = query.eq('is_active', true);
    if (status === 'inactive') query = query.eq('is_active', false);
    if (schoolId && schoolId !== 'all') query = query.eq('school_id', schoolId);

    const { data: rawData, error } = await query;
    let data = rawData ? [...rawData] : [];
    
    // Log what we're getting from the database
    console.log(`📊 Database query returned ${data?.length || 0} school admin(s)`);
    if (data.length > 0) {
       
      console.log('📋 Database records:', data.map((a: any) => ({
        id: a.id,
        full_name: a.full_name,
        email: a.email
      })));
    }
    
    if (error) {
      logger.error('Error fetching school admins', {
        endpoint: '/api/admin/school-admins',
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/school-admins' },
        'Failed to fetch school admins'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // Ensure we only return data that exists - filter out any null/undefined entries
    if (data.length > 0) {
      // Filter out invalid entries
       
      data = data.filter((admin: any) => admin && admin.id);
      
      // Note: We're using service role key which bypasses RLS
      // So we don't need to filter by profile role - all school_admins records are valid
      // The profile check was too restrictive and could exclude valid admins
      console.log(`✅ Found ${data.length} school admin(s) in database`);
    } else {
      // No data or empty array - ensure it's an empty array
      data = [];
      console.log('ℹ️ No school admins found in database');
    }

    // If we have data, fetch school information separately using authenticated client with RLS
    if (data.length > 0) {
       
      const schoolIds = [...new Set(data.map((a: any) => a.school_id).filter(Boolean))];
      if (schoolIds.length > 0) {
        const { data: schoolsData, error: schoolsError } = await supabase
          .from('schools')
          .select('id, name, city, state')
           
          .in('id', schoolIds) as any;
        
        if (schoolsError) {
          console.warn('⚠️ Error fetching schools data:', schoolsError);
        } else {
           
          const schoolsMap = new Map((schoolsData || []).map((s: any) => [s.id, s]));
           
          data = data.map((admin: any) => ({
            ...admin,
            schools: schoolsMap.get(admin.school_id) || null
          }));
        }
      }
    }

    console.log(`✅ Fetched ${data?.length || 0} school admin(s) from database`);
    if (data.length > 0) {
       
      console.log('📋 School admins:', data.map((a: any) => ({ 
        id: a.id, 
        name: a.full_name, 
        email: a.email, 
        school_id: a.school_id,
        school_name: a.schools?.name 
      })));
    } else {
      console.warn('⚠️ No school admins found in database');
    }
    
    let admins = data || [];
    if (search) {
      const s = search.toLowerCase();
       
      admins = admins.filter((a: any) => {
        const name = (a.full_name || '').toLowerCase();
        const email = (a.email || '').toLowerCase();
        const phone = (a.phone || '').toLowerCase();
        return name.includes(s) || email.includes(s) || phone.includes(s);
      });
      console.log(`🔍 Filtered to ${admins.length} admin(s) after search filter`);
    }

    // Always return an array, even if empty
    const result = Array.isArray(admins) ? admins : [];
    
    console.log(`📤 Returning ${result.length} school admin(s) to client`);
    if (result.length === 0) {
      console.log('ℹ️ No school admins found in database - returning empty array');
    }
    
    return NextResponse.json({ schoolAdmins: result });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/school-admins', {
      endpoint: '/api/admin/school-admins',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/school-admins' },
      'Failed to fetch school admins'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// POST: Create a new school admin
export async function POST(request: NextRequest) {
  const { ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  
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
    const validation = validateRequestBody(createSchoolAdminSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for school admin creation', {
        endpoint: '/api/admin/school-admins',
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

    const { full_name, email, phone, school_id, temp_password, permissions } = validation.data;

    console.log('➕ Creating new school admin:', { full_name, email, school_id });

    const finalPassword = temp_password || 'TempPass123';

    // Step 1: Check if user already exists in Supabase Auth
    let userId: string | null = null;
    
    try {
      const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error('❌ Error listing users:', listError);
      } else {
         
        const existingAuthUser = authUsers?.users?.find((user: any) => user.email === email);
        if (existingAuthUser) {
          console.log('✅ Found existing user in Auth:', existingAuthUser.id);
          userId = existingAuthUser.id;
        }
      }
    } catch (error) {
      logger.warn('Error checking existing users (non-critical)', {
        endpoint: '/api/admin/school-admins',
      }, error instanceof Error ? error : new Error(String(error)));
    }

    // Step 2: Create user in Supabase Auth if it doesn't exist
    if (!userId) {
      console.log('🔐 Creating new user in Supabase Auth...');
      try {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: finalPassword,
          email_confirm: true,
          user_metadata: {
            full_name,
            role: 'school_admin'
          }
        });

        if (authError) {
          console.error('❌ Error creating auth user:', authError);
          console.error('⚠️ Continuing with school admin creation without auth user');
        } else {
          userId = authData.user.id;
          console.log('✅ Created new user in Auth:', userId);
        }
      } catch (authCreateError) {
        logger.warn('Error in auth user creation (non-critical)', {
          endpoint: '/api/admin/school-admins',
        }, authCreateError instanceof Error ? authCreateError : new Error(String(authCreateError)));
        // Continuing with school admin creation without auth user
      }
    } else {
      console.log('📎 Using existing Auth user ID:', userId);
      // Update password for existing user
      try {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password: finalPassword }
        );
        if (updateError) {
          logger.warn('Could not update password for existing user (non-critical)', {
            endpoint: '/api/admin/school-admins',
          }, updateError);
        } else {
          console.log('✅ Updated password for existing user');
        }
      } catch (updateError) {
        logger.warn('Error updating password (non-critical)', {
          endpoint: '/api/admin/school-admins',
        }, updateError instanceof Error ? updateError : new Error(String(updateError)));
      }
    }

    // Step 3: Create or update profile if we have a userId
    if (userId) {
      console.log('👤 Creating/updating profile...');
      const { error: profileError } = await (supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          full_name,
          email,
          role: 'school_admin',
          school_id,
          phone: phone || null
         
        } as any, {
          onConflict: 'id'
         
        }) as any);

      if (profileError) {
        logger.warn('Error creating/updating profile (non-critical)', {
          endpoint: '/api/admin/school-admins',
        }, profileError);
      } else {
        console.log('✅ Profile created/updated');
      }
    }

    // Step 4: Check if school admin with this email already exists
    const { data: existingAdmin, error: checkError } = await supabaseAdmin
      .from('school_admins')
      .select('id, email, school_id')
      .eq('email', email)
       
      .maybeSingle() as any;

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('Error checking for existing school admin', {
        endpoint: '/api/admin/school-admins',
      }, checkError);
      
      const errorInfo = await handleApiError(
        checkError,
        { endpoint: '/api/admin/school-admins' },
        'Failed to check for existing school admin'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    let schoolAdminData;
    let schoolAdminError;

    if (existingAdmin) {
      // Update existing school admin
      console.log('📝 Updating existing school admin:', existingAdmin.id);
       
      const { data: updatedAdmin, error: updateError } = await ((supabaseAdmin as any)
        .from('school_admins')
        .update({
          profile_id: userId,
          school_id,
          full_name,
          phone: phone || null,
          temp_password: finalPassword,
          is_active: true,
          updated_at: new Date().toISOString()
         
        } as any)
         
        .eq('id', existingAdmin.id as any)
        .select()
         
        .single() as any) as any;

      schoolAdminData = updatedAdmin;
      schoolAdminError = updateError;
    } else {
      // Create new school admin
      console.log('➕ Creating new school admin record...');
      const { data: newAdmin, error: insertError } = await (supabaseAdmin
        .from('school_admins')
        .insert({
          profile_id: userId,
          school_id,
          full_name,
          email,
          phone: phone || null,
          temp_password: finalPassword,
          is_active: true,
          permissions: permissions || {},
          created_at: new Date().toISOString()
         
        } as any)
        .select()
         
        .single() as any);

      schoolAdminData = newAdmin;
      schoolAdminError = insertError;
    }

    if (schoolAdminError) {
      logger.error('Failed to create/update school admin record', {
        endpoint: '/api/admin/school-admins',
      }, schoolAdminError);
      
      const errorInfo = await handleApiError(
        schoolAdminError,
        { endpoint: '/api/admin/school-admins' },
        'Failed to create school admin'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    if (!schoolAdminData) {
      logger.error('School admin creation returned no data', {
        endpoint: '/api/admin/school-admins',
      });
      
      return NextResponse.json(
        { error: 'Failed to create school admin: No data returned' },
        { status: 500 }
      );
    }

    // Fetch school information
    const { data: schoolData } = await supabaseAdmin
      .from('schools')
      .select('id, name, city, state')
      .eq('id', school_id)
       
      .single() as any;

    console.log('✅ School admin created/updated successfully:', {
      id: schoolAdminData.id,
      name: schoolAdminData.full_name,
      email: schoolAdminData.email,
      school_id: schoolAdminData.school_id
    });

    const successResponse = NextResponse.json({
      success: true,
      schoolAdmin: {
        ...schoolAdminData,
        schools: schoolData || null
      },
      message: 'School admin created successfully'
    }, { status: 201 });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/school-admins', {
      endpoint: '/api/admin/school-admins',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/school-admins' },
      'Failed to create school admin'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// PUT: Update school admin (including status toggle and password change)
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
    const validation = validateRequestBody(updateSchoolAdminSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for school admin update', {
        endpoint: '/api/admin/school-admins',
        method: 'PUT',
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

    const { id, is_active, change_password, temp_password, ...updateData } = { ...validation.data, ...body };

    console.log('🔄 Updating school admin:', { id, is_active, change_password, updateData });

    // Get current school admin to find profile_id and email
    const { data: currentAdmin, error: fetchError } = await supabaseAdmin
      .from('school_admins')
      .select('id, profile_id, email')
      .eq('id', id)
       
      .single() as any;

    if (fetchError || !currentAdmin) {
      logger.error('Error fetching school admin', {
        endpoint: '/api/admin/school-admins',
        method: 'PUT',
        adminId: id,
      }, fetchError || new Error('School admin not found'));
      
      const errorInfo = await handleApiError(
        fetchError || new Error('School admin not found'),
        { endpoint: '/api/admin/school-admins', method: 'PUT', adminId: id },
        'School admin not found'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    // If password change is requested, update it in Supabase Auth
    if (change_password && temp_password) {
      console.log('🔐 Changing password for school admin:', currentAdmin.email);
      
      if (!currentAdmin.profile_id) {
        logger.warn('No profile_id found for school admin', {
          endpoint: '/api/admin/school-admins',
          method: 'PUT',
          adminId: id,
        });
        
        return NextResponse.json(
          { error: 'Cannot change password: School admin has no associated profile' },
          { status: 400 }
        );
      }

      try {
        // Update password in Supabase Auth
        const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
          currentAdmin.profile_id,
          { password: temp_password }
        );

        if (updateAuthError) {
          logger.error('Error updating password in Supabase Auth', {
            endpoint: '/api/admin/school-admins',
            method: 'PUT',
            adminId: id,
          }, updateAuthError);
          
          const errorInfo = await handleApiError(
            updateAuthError,
            { endpoint: '/api/admin/school-admins', method: 'PUT', adminId: id },
            'Failed to update password in authentication system'
          );
          return NextResponse.json(errorInfo, { status: errorInfo.status });
        }
      } catch (authError) {
        logger.error('Error in Supabase auth update', {
          endpoint: '/api/admin/school-admins',
          method: 'PUT',
          adminId: id,
        }, authError instanceof Error ? authError : new Error(String(authError)));
        
        const errorInfo = await handleApiError(
          authError,
          { endpoint: '/api/admin/school-admins', method: 'PUT', adminId: id },
          'Failed to update password in authentication system'
        );
        return NextResponse.json(errorInfo, { status: errorInfo.status });
      }
    }

    // Build update object
     
    const updateFields: any = {
      updated_at: new Date().toISOString()
    };

    // If is_active is provided, update it
    if (typeof is_active === 'boolean') {
      updateFields.is_active = is_active;
    }

    // If password is being changed, update temp_password in database
    if (change_password && temp_password) {
      updateFields.temp_password = temp_password;
    }

    // Add any other update fields (but exclude change_password flag)
    if (Object.keys(updateData).length > 0) {
      Object.assign(updateFields, updateData);
    }

     
    const { data: updatedAdmin, error } = await ((supabaseAdmin as any)
      .from('school_admins')
       
      .update(updateFields as any)
      .eq('id', id)
      .select()
       
      .single() as any) as any;

    if (error) {
      logger.error('Error updating school admin', {
        endpoint: '/api/admin/school-admins',
        method: 'PUT',
        adminId: id,
      }, error);
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/admin/school-admins', method: 'PUT', adminId: id },
        'Failed to update school admin'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    if (!updatedAdmin) {
      logger.error('No data returned from update', {
        endpoint: '/api/admin/school-admins',
        method: 'PUT',
        adminId: id,
      });
      
      const errorInfo = await handleApiError(
        new Error('No data returned from update'),
        { endpoint: '/api/admin/school-admins', method: 'PUT', adminId: id },
        'Failed to update school admin'
      );
      return NextResponse.json(errorInfo, { status: errorInfo.status });
    }

    console.log('✅ School admin updated successfully:', {
      id: updatedAdmin.id,
      is_active: updatedAdmin.is_active,
      full_name: updatedAdmin.full_name,
      password_changed: change_password || false
    });
    
    const successResponse = NextResponse.json({
      success: true,
      schoolAdmin: updatedAdmin,
      message: change_password ? 'Password changed successfully' : 'School admin updated successfully'
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in PUT /api/admin/school-admins', {
      endpoint: '/api/admin/school-admins',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/school-admins' },
      'Failed to update school admin'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// DELETE: Delete a school admin
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
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'School admin ID is required' },
        { status: 400 }
      );
    }

    console.log('🗑️ Deleting school admin:', id);

    // Get the school admin to find profile_id before deletion
    const { data: adminToDelete, error: fetchError } = await supabaseAdmin
      .from('school_admins')
      .select('id, profile_id, email')
      .eq('id', id)
       
      .single() as any;

    if (fetchError || !adminToDelete) {
      console.error('❌ Error fetching school admin:', fetchError);
      return NextResponse.json(
        { error: 'School admin not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    // Delete the school admin record
    const { error: deleteError } = await supabaseAdmin
      .from('school_admins')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('❌ Error deleting school admin:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete school admin', details: deleteError.message },
        { status: 500 }
      );
    }

    // Optionally delete the profile and auth user if this is the only school admin for that profile
    // For now, we'll just delete the school_admin record and leave the profile/auth user
    // This allows the user to be reassigned if needed

    console.log('✅ School admin deleted successfully:', id);
    
    const successResponse = NextResponse.json({
      success: true,
      message: 'School admin deleted successfully'
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in DELETE /api/admin/school-admins', {
      endpoint: '/api/admin/school-admins',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/school-admins' },
      'Failed to delete school admin'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
















