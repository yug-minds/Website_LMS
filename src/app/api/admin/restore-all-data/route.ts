import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { emptyBodySchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

// Test users configuration
const TEST_USERS = [
  {
    email: 'admin@yugminds.com',
    password: 'admin123',
    full_name: 'Admin User',
    role: 'admin' as const
  },
  {
    email: 'teacher@yugminds.com',
    password: 'TempPass',
    full_name: 'Test Teacher',
    role: 'teacher' as const
  },
  {
    email: 'student@yugminds.com',
    password: 'pass123',
    full_name: 'Test Student',
    role: 'student' as const
  },
  {
    email: 'schooladmin@yugminds.com',
    password: 'pass123',
    full_name: 'Test School Admin',
    role: 'school_admin' as const
  }
];

// POST: Restore all test data including users and related data
export async function POST(request: NextRequest) {
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
    // Verify admin access
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck.response;
    }

    // Validate request body (should be empty for this endpoint)
    try {
      const body = await request.json().catch(() => ({}));
      const validation = validateRequestBody(emptyBodySchema, body);
      if (!validation.success) {
         
        const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
        return NextResponse.json(
          { 
            error: 'Validation failed',
            details: errorMessages,
          },
          { status: 400 }
        );
      }
    } catch {
      // If body parsing fails, it's likely empty, which is fine
    }
    console.log('🚀 Starting comprehensive data restoration...');
    const results = {
      users: { created: [] as string[], exists: [] as string[], errors: [] as string[] },
      data: { schools: false, teachers: false, students: false, courses: false, errors: [] as string[] }
    };
    const userIds: Record<string, string> = {};

    // Step 1: Create test users
    console.log('🔐 Creating test users...');
    for (const userData of TEST_USERS) {
      try {
        const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          console.error(`❌ Error listing users for ${userData.email}:`, listError);
          results.users.errors.push(`${userData.email}: ${listError.message}`);
          continue;
        }

        const existingUser = existingUsers?.users?.find((u: any) => u.email === userData.email);

        if (existingUser) {
          console.log(`✅ User ${userData.email} already exists`);
          results.users.exists.push(userData.email);
          userIds[userData.email] = existingUser.id;

          // Update password
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existingUser.id,
            { password: userData.password }
          );

          if (updateError) {
            console.warn(`⚠️ Could not update password for ${userData.email}:`, updateError.message);
          } else {
            console.log(`✅ Updated password for ${userData.email}`);
          }
        } else {
          // Create new user
          console.log(`🔐 Creating new user: ${userData.email}...`);
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: userData.email,
            password: userData.password,
            email_confirm: true,
            user_metadata: {
              full_name: userData.full_name,
              role: userData.role
            }
          });

          if (authError) {
            console.error(`❌ Error creating auth user ${userData.email}:`, authError);
            results.users.errors.push(`${userData.email}: ${authError.message}`);
            continue;
          }

          userIds[userData.email] = authData.user.id;
          console.log(`✅ Created auth user for ${userData.email}: ${authData.user.id}`);
          results.users.created.push(userData.email);
        }

        // Ensure profile exists with correct role
        const userId = userIds[userData.email];
        const { error: profileError } = await (supabaseAdmin
          .from('profiles')
          .upsert({
            id: userId,
            full_name: userData.full_name,
            email: userData.email,
            role: userData.role
           
          } as any, {
            onConflict: 'id'
           
          }) as any);

        if (profileError) {
          console.error(`❌ Error creating profile for ${userData.email}:`, profileError);
          results.users.errors.push(`${userData.email}: Profile creation failed - ${profileError.message}`);
        } else {
          console.log(`✅ Profile created/updated for ${userData.email}`);
        }
       
      } catch (error: any) {
        logger.warn(`Unexpected error for user ${userData.email} (non-critical)`, {
          endpoint: '/api/admin/restore-all-data',
          email: userData.email,
        }, error instanceof Error ? error : new Error(String(error)));
        results.users.errors.push(`${userData.email}: ${error.message || 'Unknown error'}`);
      }
    }

    // Step 2: Restore all other data
    console.log('\n📦 Restoring all data...');
    const schoolId = '00000000-0000-0000-0000-000000000005';

    // Create school
    const { error: schoolError } = await (supabaseAdmin
      .from('schools')
      .upsert({
        id: schoolId,
        name: 'YugMinds Test School',
        school_code: 'SCH-TEST',
        join_code: 'JNSCH-TEST',
        school_email: 'info@yugminds.com',
        school_admin_id: userIds['schooladmin@yugminds.com'],
        school_admin_name: 'Test School Admin',
        school_admin_email: 'schooladmin@yugminds.com',
        address: '123 Test Street, Test City',
        city: 'Test City',
        state: 'Test State',
        country: 'India',
        pincode: '123456',
        contact_email: 'info@yugminds.com',
        contact_phone: '+91 9876543210',
        principal_name: 'Test School Admin',
        affiliation_type: 'CBSE',
        school_type: 'Private',
        established_year: 2020,
        grades_offered: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"],
        total_students_estimate: 100,
        total_teachers_estimate: 10,
        status: 'Active',
        joining_codes: {
          "Grade 1": "TEST001",
          "Grade 2": "TEST002",
          "Grade 3": "TEST003",
          "Grade 4": "TEST004",
          "Grade 5": "TEST005"
        },
        is_active: true,
        created_by: userIds['admin@yugminds.com']
       
      } as any, {
        onConflict: 'id'
       
      }) as any);

    if (schoolError) {
      console.error('⚠️ Error creating school:', schoolError.message);
      results.data.errors.push(`School: ${schoolError.message}`);
    } else {
      console.log('✅ School created/updated');
      results.data.schools = true;
    }

    // Update school admin profile
     
    await ((supabaseAdmin as any)
      .from('profiles')
       
      .update({ school_id: schoolId || undefined } as any)
       
      .eq('id', userIds['schooladmin@yugminds.com'])) as any;

    console.log('✅ School admin profile updated');

    // Create teacher record
    const { data: teacherData } = await supabaseAdmin
      .from('teachers')
      .select('id')
      .eq('profile_id', userIds['teacher@yugminds.com'])
       
      .single() as any;

    let teacherRecordId = teacherData?.id;

    if (!teacherRecordId) {
      const { data: newTeacher, error: createTeacherError } = await (supabaseAdmin
        .from('teachers')
        .insert({
          profile_id: userIds['teacher@yugminds.com'],
          teacher_id: 'TCH-001',
          full_name: 'Test Teacher',
          email: 'teacher@yugminds.com',
          phone: '+91 9876543210',
          qualification: 'M.Ed Mathematics',
          experience_years: 5,
          specialization: 'Mathematics',
          status: 'Active'
         
        } as any)
        .select('id')
         
        .single() as any);

      if (createTeacherError) {
        console.error('⚠️ Error creating teacher record:', createTeacherError.message);
        results.data.errors.push(`Teacher record: ${createTeacherError.message}`);
      } else {
        teacherRecordId = newTeacher.id;
        console.log('✅ Teacher record created');
        results.data.teachers = true;
      }
    } else {
      results.data.teachers = true;
    }

    if (teacherRecordId) {
      // Create teacher-school assignment
      const { error: teacherSchoolError } = await (supabaseAdmin
        .from('teacher_schools')
        .upsert({
          teacher_id: teacherRecordId,
          school_id: schoolId,
          is_primary: true,
          grades_assigned: ['Grade 5', 'Grade 4'],
          subjects: ['Mathematics', 'Science']
         
        } as any, {
          onConflict: 'teacher_id,school_id'
         
        }) as any);

      if (teacherSchoolError) {
        console.error('⚠️ Error creating teacher-school assignment:', teacherSchoolError.message);
      } else {
        console.log('✅ Teacher-school assignment created');
      }
    }

    // Create student_schools record (students table is deprecated, use student_schools instead)
    const { data: studentSchoolData } = await supabaseAdmin
      .from('student_schools')
      .select('id')
      .eq('student_id', userIds['student@yugminds.com'])
      .eq('school_id', schoolId)
       
      .single() as any;

    let studentSchoolRecordId = studentSchoolData?.id;

    if (!studentSchoolRecordId) {
      const { data: newStudentSchool, error: createStudentSchoolError } = await (supabaseAdmin
        .from('student_schools')
        .insert({
          student_id: userIds['student@yugminds.com'],
          school_id: schoolId,
          grade: 'Grade 5',
          joining_code: 'TEST005',
          is_active: true
         
        } as any)
         
        .select('id') as any)
         
        .single() as any;

      if (createStudentSchoolError) {
        console.error('⚠️ Error creating student_schools record:', createStudentSchoolError.message);
        results.data.errors.push(`Student_schools record: ${createStudentSchoolError.message}`);
      } else {
        studentSchoolRecordId = newStudentSchool?.id;
        console.log('✅ Student record created');
        results.data.students = true;
      }
    } else {
      results.data.students = true;
    }

    if (studentSchoolRecordId) {
      // Create student-school assignment
      const { error: studentSchoolError } = await (supabaseAdmin
        .from('student_schools')
        .upsert({
          student_id: userIds['student@yugminds.com'],
          school_id: schoolId,
          grade: 'Grade 5',
          joining_code: 'TEST005',
          is_active: true
         
        } as any, {
          onConflict: 'student_id,school_id'
         
        }) as any);

      if (studentSchoolError) {
        console.error('⚠️ Error creating student-school assignment:', studentSchoolError.message);
      } else {
        console.log('✅ Student-school assignment created');
      }
    }

    // Create courses
    const courses = [
      {
        id: '550e8400-e29b-41d4-a716-446655440007',
        school_id: schoolId,
        title: 'Mathematics Fundamentals',
        description: 'Learn the basics of mathematics including addition, subtraction, multiplication, and division.',
        grade: 'Grade 5',
        subject: 'Mathematics',
        thumbnail_url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400',
        is_published: true,
        created_by: userIds['teacher@yugminds.com']
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440008',
        school_id: schoolId,
        title: 'Science Discovery',
        description: 'Explore the wonders of science through hands-on experiments and activities.',
        grade: 'Grade 5',
        subject: 'Science',
        thumbnail_url: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=400',
        is_published: true,
        created_by: userIds['teacher@yugminds.com']
      }
    ];

    for (const course of courses) {
      const { error: courseError } = await (supabaseAdmin
        .from('courses')
         
        .upsert(course as any, { onConflict: 'id' }) as any);

      if (courseError) {
        console.error(`⚠️ Error creating course ${course.title}:`, courseError.message);
        results.data.errors.push(`Course ${course.title}: ${courseError.message}`);
      } else {
        console.log(`✅ Course created: ${course.title}`);
        results.data.courses = true;
      }
    }

    // Create chapters
    const chapters = [
      {
        id: '550e8400-e29b-41d4-a716-446655440009',
        course_id: '550e8400-e29b-41d4-a716-446655440007',
        title: 'Introduction to Numbers',
        description: 'Learn about different types of numbers and their properties.',
        order_index: 1,
        is_published: true
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        course_id: '550e8400-e29b-41d4-a716-446655440007',
        title: 'Addition and Subtraction',
        description: 'Master the basic operations of addition and subtraction.',
        order_index: 2,
        is_published: true
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440011',
        course_id: '550e8400-e29b-41d4-a716-446655440007',
        title: 'Multiplication and Division',
        description: 'Learn multiplication tables and division techniques.',
        order_index: 3,
        is_published: true
      }
    ];

    for (const chapter of chapters) {
      const { error: chapterError } = await (supabaseAdmin
        .from('chapters')
         
        .upsert(chapter as any, { onConflict: 'id' }) as any);

      if (chapterError) {
        console.error(`⚠️ Error creating chapter ${chapter.title}:`, chapterError.message);
      } else {
        console.log(`✅ Chapter created: ${chapter.title}`);
      }
    }

    // Create enrollments
    if (studentSchoolRecordId) {
      const enrollments = [
        {
          student_id: userIds['student@yugminds.com'],
          course_id: '550e8400-e29b-41d4-a716-446655440007',
          status: 'active',
          progress_percentage: 45.0
        },
        {
          student_id: userIds['student@yugminds.com'],
          course_id: '550e8400-e29b-41d4-a716-446655440008',
          status: 'active',
          progress_percentage: 20.0
        }
      ];

      for (const enrollment of enrollments) {
        const { error: enrollError } = await (supabaseAdmin
          .from('enrollments')
           
          .upsert(enrollment as any, {
            onConflict: 'student_id,course_id'
           
          }) as any);

        if (enrollError) {
          console.error(`⚠️ Error creating enrollment:`, enrollError.message);
        } else {
          console.log(`✅ Enrollment created for course ${enrollment.course_id}`);
        }
      }
    }

    console.log('\n✅ All data restoration complete!');

    return NextResponse.json({
      success: true,
      message: 'All test data restored successfully',
      results,
      testCredentials: {
        admin: 'admin@yugminds.com / admin123',
        teacher: 'teacher@yugminds.com / TempPass',
        student: 'student@yugminds.com / pass123',
        schoolAdmin: 'schooladmin@yugminds.com / pass123'
      }
    });
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/restore-all-data', {
      endpoint: '/api/admin/restore-all-data',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/restore-all-data' },
      'Failed to restore all data'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

// GET: Check restoration status
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
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const testUserEmails = TEST_USERS.map((u: any) => u.email);
     
    const existingTestUsers = existingUsers?.users?.filter((u: any) => 
      testUserEmails.includes(u.email || '')
    ) || [];

    // Check for school
    const { data: schoolData } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .eq('id', '00000000-0000-0000-0000-000000000005')
       
      .single() as any;

    // Check for courses
    const { data: coursesData } = await supabaseAdmin
      .from('courses')
      .select('id, title')
       
      .in('id', ['550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440008']) as any;

    return NextResponse.json({
      users: {
        total: TEST_USERS.length,
        exists: existingTestUsers.length,
        missing: testUserEmails.filter((email: string) => 
           
          !existingTestUsers.some((u: any) => u.email === email)
        )
      },
      data: {
        school: schoolData ? { id: schoolData.id, name: schoolData.name } : null,
        courses: coursesData?.length || 0
      }
    });
  } catch (error) {
    logger.error('Unexpected error in GET /api/admin/restore-all-data', {
      endpoint: '/api/admin/restore-all-data',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/restore-all-data' },
      'Failed to check restoration status'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

