import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../lib/logger';
import { emptyBodySchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * API endpoint to rollback teacher_reports table changes
 * This will restore the table to its state before migrations 20250111000000 and 20250111000001
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

    console.log('🔄 Starting rollback of teacher_reports changes...');

    const rollbackSQL = `
      DO $$ 
      BEGIN
        -- Step 1: Restore start_time and end_time columns to timestamptz
        -- Check if columns exist and are of type time
        IF EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'teacher_reports' 
          AND column_name = 'start_time' 
          AND data_type = 'time'
        ) THEN
          -- Convert time back to timestamptz
          -- First, create a temporary column
          ALTER TABLE teacher_reports ADD COLUMN IF NOT EXISTS start_time_old timestamptz;
          
          -- Convert time to timestamptz using the date column
          UPDATE teacher_reports 
          SET start_time_old = (date || ' ' || start_time::text)::timestamptz
          WHERE start_time IS NOT NULL AND date IS NOT NULL;
          
          -- Drop the time column
          ALTER TABLE teacher_reports DROP COLUMN IF EXISTS start_time CASCADE;
          
          -- Rename the old column back
          ALTER TABLE teacher_reports RENAME COLUMN start_time_old TO start_time;
          
          RAISE NOTICE 'Restored start_time column to timestamptz';
        END IF;
        
        IF EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'teacher_reports' 
          AND column_name = 'end_time' 
          AND data_type = 'time'
        ) THEN
          -- Convert time back to timestamptz
          -- First, create a temporary column
          ALTER TABLE teacher_reports ADD COLUMN IF NOT EXISTS end_time_old timestamptz;
          
          -- Convert time to timestamptz using the date column
          UPDATE teacher_reports 
          SET end_time_old = (date || ' ' || end_time::text)::timestamptz
          WHERE end_time IS NOT NULL AND date IS NOT NULL;
          
          -- Drop the time column
          ALTER TABLE teacher_reports DROP COLUMN IF EXISTS end_time CASCADE;
          
          -- Rename the old column back
          ALTER TABLE teacher_reports RENAME COLUMN end_time_old TO end_time;
          
          RAISE NOTICE 'Restored end_time column to timestamptz';
        END IF;
        
        -- Step 2: Remove updated_at column and trigger if they exist
        IF EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'teacher_reports' 
          AND column_name = 'updated_at'
        ) THEN
          -- Drop the trigger first
          DROP TRIGGER IF EXISTS update_teacher_reports_updated_at ON teacher_reports;
          
          -- Drop the column
          ALTER TABLE teacher_reports DROP COLUMN IF EXISTS updated_at CASCADE;
          
          RAISE NOTICE 'Removed updated_at column and trigger';
        END IF;
        
        -- Step 3: Remove migration records from schema_migrations
        DELETE FROM supabase_migrations.schema_migrations 
        WHERE version IN ('20250111000000', '20250111000001');
        
        RAISE NOTICE 'Removed migration records from schema_migrations';
        
      END $$;
    `;

    // Execute the rollback SQL using RPC or direct SQL execution
    // Since Supabase JS client doesn't support raw SQL directly, we'll use a workaround
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // Create a stored procedure to execute the rollback
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION rollback_teacher_reports_changes()
      RETURNS text AS $$
      DECLARE
        result_text text := '';
      BEGIN
        -- Step 1: Restore start_time and end_time columns to timestamptz
        IF EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'teacher_reports' 
          AND column_name = 'start_time' 
          AND data_type = 'time'
        ) THEN
          ALTER TABLE teacher_reports ADD COLUMN IF NOT EXISTS start_time_old timestamptz;
          UPDATE teacher_reports 
          SET start_time_old = (date || ' ' || start_time::text)::timestamptz
          WHERE start_time IS NOT NULL AND date IS NOT NULL;
          ALTER TABLE teacher_reports DROP COLUMN IF EXISTS start_time CASCADE;
          ALTER TABLE teacher_reports RENAME COLUMN start_time_old TO start_time;
          result_text := result_text || 'Restored start_time to timestamptz; ';
        END IF;
        
        IF EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'teacher_reports' 
          AND column_name = 'end_time' 
          AND data_type = 'time'
        ) THEN
          ALTER TABLE teacher_reports ADD COLUMN IF NOT EXISTS end_time_old timestamptz;
          UPDATE teacher_reports 
          SET end_time_old = (date || ' ' || end_time::text)::timestamptz
          WHERE end_time IS NOT NULL AND date IS NOT NULL;
          ALTER TABLE teacher_reports DROP COLUMN IF EXISTS end_time CASCADE;
          ALTER TABLE teacher_reports RENAME COLUMN end_time_old TO end_time;
          result_text := result_text || 'Restored end_time to timestamptz; ';
        END IF;
        
        -- Step 2: Remove updated_at column and trigger
        IF EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'teacher_reports' 
          AND column_name = 'updated_at'
        ) THEN
          DROP TRIGGER IF EXISTS update_teacher_reports_updated_at ON teacher_reports;
          ALTER TABLE teacher_reports DROP COLUMN IF EXISTS updated_at CASCADE;
          result_text := result_text || 'Removed updated_at column; ';
        END IF;
        
        -- Step 3: Remove migration records
        DELETE FROM supabase_migrations.schema_migrations 
        WHERE version IN ('20250111000000', '20250111000001');
        result_text := result_text || 'Removed migration records';
        
        RETURN result_text;
      END;
      $$ LANGUAGE plpgsql;
    `;

    // Execute the function creation and call
     
    let createResult: any = null;
     
    let createError: any = null;
    try {
      const result = await supabaseAdmin.rpc('exec_sql', {
        sql: createFunctionSQL
       
      } as any);
      createResult = result.data;
      createError = result.error;
    } catch (err) {
      logger.warn('Error creating rollback function (non-critical)', {
        endpoint: '/api/migrations/rollback-teacher-reports',
      }, err instanceof Error ? err : new Error(String(err)));
      createError = err;
    }

    // Try to call the function
     
    let rollbackResult: any = null;
     
    let rollbackError: any = null;
    try {
      const result = await supabaseAdmin.rpc('rollback_teacher_reports_changes');
      rollbackResult = result.data;
      rollbackError = result.error;
    } catch (err) {
      logger.warn('Error calling rollback function (non-critical)', {
        endpoint: '/api/migrations/rollback-teacher-reports',
      }, err instanceof Error ? err : new Error(String(err)));
      rollbackError = err;
    }

    if (rollbackError) {
      logger.error('Error executing rollback', {
        endpoint: '/api/migrations/rollback-teacher-reports',
      }, rollbackError);
      
      const errorInfo = await handleApiError(
        rollbackError,
        { endpoint: '/api/migrations/rollback-teacher-reports' },
        'Failed to execute rollback via RPC'
      );
      return NextResponse.json({
        success: false,
        ...errorInfo,
        instructions: 'Please run the rollback SQL manually in Supabase SQL Editor',
        sql: rollbackSQL
      }, { status: errorInfo.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Rollback completed successfully',
      result: rollbackResult,
      details: 'teacher_reports table has been restored to its state before migrations 20250111000000 and 20250111000001'
    });

  } catch (error) {
    logger.error('Unexpected error in POST /api/migrations/rollback-teacher-reports', {
      endpoint: '/api/migrations/rollback-teacher-reports',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/migrations/rollback-teacher-reports' },
      'Failed to rollback migration'
    );
    return NextResponse.json({
      success: false,
      ...errorInfo,
      ...(process.env.NODE_ENV === 'development' && { details: error instanceof Error ? error.stack : undefined })
    }, { status: errorInfo.status });
  }
}

