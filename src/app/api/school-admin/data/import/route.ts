import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase';
import { getSchoolAdminSchoolId } from '../../../../../lib/school-admin-auth';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../../lib/rate-limit';
import { dataImportSchema, validateRequestBody } from '../../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../../lib/logger';
import { ensureCsrfToken } from '../../../../../lib/csrf-middleware';


// POST: Import data from CSV
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
    const schoolId = await getSchoolAdminSchoolId(request);
    
    if (!schoolId) {
      return NextResponse.json(
        { error: 'Unauthorized: School admin access required' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const importType = formData.get('type') as string; // 'students' or 'teachers'

    // Validate file
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB for CSV)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Validate import type using schema
    const validation = validateRequestBody(dataImportSchema, { type: importType });
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

    const { type } = validation.data;

    // Read file content
    const text = await file.text();
    const lines = text.split('\n').filter((line: any) => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV file must have at least a header row and one data row' },
        { status: 400 }
      );
    }

    // Parse CSV (simple parser - assumes comma-separated)
    const headers = lines[0].split(',').map((h: any) => h.trim());
    const rows = lines.slice(1).map((line: any) => {
      const values = line.split(',').map((v: any) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    let imported = 0;
    const errors: string[] = [];

    if (type === 'students') {
      // Import students
      for (const row of rows) {
        try {
          const email = row.email || row.Email || '';
          const fullName = row.name || row.full_name || row['Full Name'] || '';
          const grade = row.grade || row.Grade || '';
          const phone = row.phone || row.Phone || '';

          if (!email || !fullName) {
            errors.push(`Row ${imported + 1}: Missing email or name`);
            continue;
          }

          // Check if user already exists
          const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
           
          const existing = existingUser?.users.find((u: any) => u.email === email);

          let userId: string;
          if (existing) {
            userId = existing.id;
          } else {
            // Create new user
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: `Temp${Math.random().toString(36).slice(-8)}!`,
              email_confirm: true
            });

            if (createError || !newUser.user) {
              errors.push(`Row ${imported + 1}: Failed to create user - ${createError?.message}`);
              continue;
            }

            userId = newUser.user.id;
          }

          // Create or update profile
          const { error: profileError } = await (supabaseAdmin
            .from('profiles')
            .upsert({
              id: userId,
              email,
              full_name: fullName,
              phone: phone || null,
              role: 'student',
              school_id: schoolId,
              updated_at: new Date().toISOString()
             
            } as any, {
              onConflict: 'id'
             
            }) as any);

          if (profileError) {
            errors.push(`Row ${imported + 1}: Failed to create profile - ${profileError.message}`);
            continue;
          }

          // Link to school
          const { error: linkError } = await (supabaseAdmin
            .from('student_schools')
            .upsert({
              student_id: userId,
              school_id: schoolId,
              grade: grade || null,
              is_active: true,
              assigned_at: new Date().toISOString()
             
            } as any, {
              onConflict: 'student_id,school_id'
             
            }) as any);

          if (linkError) {
            errors.push(`Row ${imported + 1}: Failed to link to school - ${linkError.message}`);
            continue;
          }

          imported++;
         
        } catch (error: any) {
          logger.warn(`Error importing row ${imported + 1} (non-critical)`, {
            endpoint: '/api/school-admin/data/import',
            row: imported + 1,
          }, error instanceof Error ? error : new Error(String(error)));
          errors.push(`Row ${imported + 1}: ${error.message}`);
        }
      }
    } else if (type === 'teachers') {
      // Import teachers
      for (const row of rows) {
        try {
          const email = row.email || row.Email || '';
          const fullName = row.name || row.full_name || row['Full Name'] || '';
          const phone = row.phone || row.Phone || '';

          if (!email || !fullName) {
            errors.push(`Row ${imported + 1}: Missing email or name`);
            continue;
          }

          // Check if user already exists
          const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
           
          const existing = existingUser?.users.find((u: any) => u.email === email);

          let userId: string;
          if (existing) {
            userId = existing.id;
          } else {
            // Create new user
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: `Temp${Math.random().toString(36).slice(-8)}!`,
              email_confirm: true
            });

            if (createError || !newUser.user) {
              errors.push(`Row ${imported + 1}: Failed to create user - ${createError?.message}`);
              continue;
            }

            userId = newUser.user.id;
          }

          // Create or update profile
          const { error: profileError } = await (supabaseAdmin
            .from('profiles')
            .upsert({
              id: userId,
              email,
              full_name: fullName,
              phone: phone || null,
              role: 'teacher',
              school_id: schoolId,
              updated_at: new Date().toISOString()
             
            } as any, {
              onConflict: 'id'
             
            }) as any);

          if (profileError) {
            errors.push(`Row ${imported + 1}: Failed to create profile - ${profileError.message}`);
            continue;
          }

          // Link to school
          const { error: linkError } = await (supabaseAdmin
            .from('teacher_schools')
            .upsert({
              teacher_id: userId,
              school_id: schoolId,
              is_active: true,
              assigned_at: new Date().toISOString()
             
            } as any, {
              onConflict: 'teacher_id,school_id'
             
            }) as any);

          if (linkError) {
            errors.push(`Row ${imported + 1}: Failed to link to school - ${linkError.message}`);
            continue;
          }

          imported++;
         
        } catch (error: any) {
          logger.warn(`Error importing row ${imported + 1} (non-critical)`, {
            endpoint: '/api/school-admin/data/import',
            row: imported + 1,
          }, error instanceof Error ? error : new Error(String(error)));
          errors.push(`Row ${imported + 1}: ${error.message}`);
        }
      }
    }

    const successResponse = NextResponse.json({
      success: true,
      message: `Successfully imported ${imported} ${type}`,
      imported,
      total: rows.length,
      errors: errors.length > 0 ? errors : undefined
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/school-admin/data/import', {
      endpoint: '/api/school-admin/data/import',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/school-admin/data/import' },
      'Failed to import data'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

