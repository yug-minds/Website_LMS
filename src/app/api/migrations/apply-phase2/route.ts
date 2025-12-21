import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { readFileSync } from 'fs';
import { join } from 'path';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { migrationFileSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * API endpoint to apply Phase 2 migrations
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

    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(migrationFileSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for migration file', {
        endpoint: '/api/migrations/apply-phase2',
        errors: errorMessages,
      });
      
      return NextResponse.json(
        { 
          success: false,
          error: 'Validation failed',
          details: errorMessages,
        },
        { status: 400 }
      );
    }

    const { migrationFile } = validation.data;

    // Read the migration file
    const migrationPath = join(process.cwd(), migrationFile);
    const sql = readFileSync(migrationPath, 'utf-8');

    console.log(`📄 Applying migration: ${migrationFile}`);
    console.log(`📊 SQL length: ${sql.length} characters`);

    // Create a function to execute the migration
    const functionName = `apply_phase2_migration_${Date.now()}`;
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION ${functionName}()
      RETURNS void AS $func$
      BEGIN
        ${sql}
      END;
      $func$ LANGUAGE plpgsql;
    `;

    // Execute via Supabase REST API
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    
    // Try to execute the function creation and call
    try {
      // Use pg_net or direct connection - for now, return instructions
      return NextResponse.json({
        success: true,
        message: 'Migration SQL prepared',
        instructions: [
          'Since Supabase JS client cannot execute raw SQL directly,',
          'please apply this migration using one of the following methods:',
          '',
          'Method 1: Supabase Dashboard SQL Editor (Recommended)',
          `1. Go to: https://supabase.com/dashboard/project/${supabaseUrl ? supabaseUrl.match(/https?:\/\/([^.]+)/)?.[1] || 'YOUR_PROJECT' : 'YOUR_PROJECT'}/sql/new`,
          '2. Copy and paste the SQL below',
          '3. Click Run',
          '',
          'Method 2: Supabase CLI (for hosted project)',
          '1. Link: supabase link --project-ref YOUR_PROJECT_REF',
          '2. Push: supabase db push --password YOUR_DB_PASSWORD',
          '',
          '⚠️  Note: This project uses hosted Supabase only.',
          '',
          'SQL to execute:',
          sql.substring(0, 500) + '...'
        ],
        sqlLength: sql.length
      });
     
    } catch (error: any) {
      logger.error('Error preparing migration', {
        endpoint: '/api/migrations/apply-phase2',
        migrationFile,
      }, error instanceof Error ? error : new Error(String(error)));
      
      const errorInfo = await handleApiError(
        error,
        { endpoint: '/api/migrations/apply-phase2', migrationFile },
        'Failed to prepare migration'
      );
      return NextResponse.json({
        success: false,
        ...errorInfo,
        instructions: [
          'Please apply the migration manually using Supabase Studio SQL Editor',
          `File: ${migrationFile}`
        ]
      }, { status: errorInfo.status });
    }

  } catch (error) {
    logger.error('Unexpected error in POST /api/migrations/apply-phase2', {
      endpoint: '/api/migrations/apply-phase2',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/migrations/apply-phase2' },
      'Failed to apply migration'
    );
    return NextResponse.json({
      success: false,
      ...errorInfo
    }, { status: errorInfo.status });
  }
}

