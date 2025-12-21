import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../lib/logger';
import { emptyBodySchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { getRequiredEnv } from '../../../../lib/env';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * API endpoint to apply the migration for fixing start_time and end_time columns
 * This endpoint executes the migration SQL directly using a stored procedure
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

    console.log('📝 Applying migration: fix_teacher_reports_time_columns');

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
    }

    // Step 2: Execute the migration SQL
    // Since Supabase JS client doesn't support raw SQL, we'll use a workaround
    // We'll execute the migration by creating a stored procedure and calling it
    
    // First, let's try to execute the migration SQL directly using the Supabase REST API
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // Execute the migration SQL using REST API
    const migrationSQL = `
      DO $$
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
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE 'Error: %', SQLERRM;
      END $$;
    `;

    // Use PostgREST to execute SQL via a stored procedure
    const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ sql: migrationSQL })
    });

    if (response.ok) {
      // Step 3: Mark migration as applied
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
      }

      return NextResponse.json({
        success: true,
        message: 'Migration applied successfully'
      });
    }

    // If RPC doesn't work, return instructions
    return NextResponse.json({
      success: false,
      message: 'Please execute the migration SQL manually',
      instructions: [
        'Option 1: Run in Supabase SQL Editor:',
        'Copy and paste the SQL from the migration file',
        '',
        'Option 2: Use Supabase CLI (for hosted project):',
        '1. Link: supabase link --project-ref YOUR_PROJECT_REF',
        '2. Push: supabase db push --password YOUR_DB_PASSWORD',
        '',
        '⚠️  Note: This project uses hosted Supabase only.'
      ],
      migration_sql: migrationSQL
    }, { status: 200 });

  } catch (error) {
    logger.error('Unexpected error in POST /api/migrations/apply-time-columns-fix', {
      endpoint: '/api/migrations/apply-time-columns-fix',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/migrations/apply-time-columns-fix' },
      'Failed to apply migration'
    );
    return NextResponse.json({
      success: false,
      ...errorInfo,
      ...(process.env.NODE_ENV === 'development' && { details: error instanceof Error ? error.stack : undefined })
    }, { status: errorInfo.status });
  }
}
