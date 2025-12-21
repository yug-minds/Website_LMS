import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../lib/logger';
import { emptyBodySchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { getRequiredEnv } from '../../../../lib/env';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * API endpoint to fix duplicate migration issue and apply the new migration
 */
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

    console.log('🔧 Fixing duplicate migration issue and applying new migration...');

    // Step 1: Fix duplicate migration issue
    const { error: fixError } = await (supabaseAdmin
      .from('schema_migrations')
      .upsert({
        version: '20250102000000',
        name: 'teacher_school_data_access_rls',
        statements: ''
       
      } as any, {
        onConflict: 'version'
       
      }) as any);

    if (fixError) {
      console.warn('⚠️ Could not fix duplicate migration:', fixError);
    } else {
      console.log('✅ Fixed duplicate migration issue');
    }

    // Step 2: Create stored procedure to apply the migration
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION apply_time_columns_fix()
      RETURNS void AS $$
      BEGIN
        -- Change start_time from timestamptz to time
        ALTER TABLE teacher_reports ADD COLUMN IF NOT EXISTS start_time_new time;
        UPDATE teacher_reports SET start_time_new = start_time::time WHERE start_time IS NOT NULL;
        ALTER TABLE teacher_reports DROP COLUMN IF EXISTS start_time;
        ALTER TABLE teacher_reports RENAME COLUMN start_time_new TO start_time;
        
        -- Change end_time from timestamptz to time
        ALTER TABLE teacher_reports ADD COLUMN IF NOT EXISTS end_time_new time;
        UPDATE teacher_reports SET end_time_new = end_time::time WHERE end_time IS NOT NULL;
        ALTER TABLE teacher_reports DROP COLUMN IF EXISTS end_time;
        ALTER TABLE teacher_reports RENAME COLUMN end_time_new TO end_time;
      END;
      $$ LANGUAGE plpgsql;
    `;

    // Try to create the function using REST API
    const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ sql: createFunctionSQL })
    });

    if (!createResponse.ok) {
      // If RPC doesn't work, try using Supabase CLI
      return NextResponse.json({
        success: false,
        message: 'Cannot create function via RPC, trying Supabase CLI...',
        sql_file: '/tmp/fix_duplicate_and_apply.sql',
        instructions: [
          'Please run the SQL from /tmp/fix_duplicate_and_apply.sql in Supabase SQL Editor',
          'Or use Supabase CLI: supabase migration up --local'
        ]
      }, { status: 200 });
    }

    // Step 3: Call the function
    console.log('🔍 Executing migration function...');
    const { data, error } = await supabaseAdmin.rpc('apply_time_columns_fix');

    if (error) {
      console.error('❌ Error executing migration function:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to apply migration',
        details: error
      }, { status: 500 });
    }

    console.log('✅ Migration executed successfully');

    // Step 4: Mark migration as applied
    console.log('📋 Marking migration as applied...');
    const { error: markError } = await (supabaseAdmin
      .from('schema_migrations')
      .upsert({
        version: '20250111000001',
        name: 'fix_teacher_reports_time_columns',
        statements: ''
       
      } as any, {
        onConflict: 'version'
       
      }) as any);

    if (markError && !markError.message.includes('duplicate')) {
      console.warn('⚠️ Could not mark migration as applied:', markError);
    } else {
      console.log('✅ Migration marked as applied');
    }

    return NextResponse.json({
      success: true,
      message: 'Migration applied successfully',
      data
    });

  } catch (error) {
    logger.error('Unexpected error in POST /api/migrations/apply-final', {
      endpoint: '/api/migrations/apply-final',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/migrations/apply-final' },
      'Failed to apply migration'
    );
    return NextResponse.json({
      success: false,
      ...errorInfo,
      ...(process.env.NODE_ENV === 'development' && { details: error instanceof Error ? error.stack : undefined })
    }, { status: errorInfo.status });
  }
}

