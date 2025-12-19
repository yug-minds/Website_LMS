import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { migrationExecuteSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { getRequiredEnv } from '../../../../lib/env';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * API endpoint to execute SQL directly using Supabase admin client
 * This endpoint fixes the duplicate migration issue and applies the new migration
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
    const validation = validateRequestBody(migrationExecuteSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for SQL execution', {
        endpoint: '/api/migrations/execute-sql',
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

    const { sql } = validation.data;

    console.log('🔧 Executing SQL...');

    // Since Supabase JS client doesn't support raw SQL, we'll use a workaround
    // We'll execute the SQL by creating a stored procedure and calling it
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // Try to execute SQL using REST API
    const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role Key');
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ sql })
    });

    if (response.ok) {
      const result = await response.json();
      return NextResponse.json({
        success: true,
        message: 'SQL executed successfully',
        result
      });
    }

    // If RPC doesn't work, return instructions
    return NextResponse.json({
      success: false,
      message: 'Cannot execute SQL via RPC',
      instructions: [
        'Please run the SQL manually in Supabase SQL Editor',
        'Or use Supabase CLI: supabase migration up --local'
      ],
      sql
    }, { status: 200 });

  } catch (error) {
    logger.error('Unexpected error in POST /api/migrations/execute-sql', {
      endpoint: '/api/migrations/execute-sql',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/migrations/execute-sql' },
      'Failed to execute SQL'
    );
    return NextResponse.json({
      success: false,
      ...errorInfo,
      ...(process.env.NODE_ENV === 'development' && { details: error instanceof Error ? error.stack : undefined })
    }, { status: errorInfo.status });
  }
}

