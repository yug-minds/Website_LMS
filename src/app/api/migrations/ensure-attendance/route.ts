import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import fs from 'fs';
import path from 'path';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { logger, handleApiError } from '../../../../lib/logger';
import { emptyBodySchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';

/**
 * API endpoint to ensure the attendance table exists
 * This applies the migration to create the attendance table if it doesn't exist
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

    console.log('🔧 Ensuring attendance table exists...');

    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20250115000000_ensure_attendance_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Check if table exists first
    const { data: existingTable, error: checkError } = await supabaseAdmin
      .from('attendance')
      .select('id')
       
      .limit(1) as any;

    if (!checkError) {
      return NextResponse.json({ 
        success: true, 
        message: 'Attendance table already exists' 
      });
    }

    if (checkError.code !== '42P01' && !checkError.message.includes('does not exist')) {
      return NextResponse.json({ 
        error: 'Error checking attendance table', 
        details: checkError.message 
      }, { status: 500 });
    }

    // Table doesn't exist, need to create it
    // Since Supabase JS client doesn't support raw SQL directly,
    // we'll need to use the Supabase management API or provide instructions
    
    // For now, return instructions
    return NextResponse.json({ 
      success: false,
      message: 'Attendance table does not exist',
      instructions: [
        'Please apply the migration using one of these methods:',
        '1. Run: npx supabase migration up',
        '2. Or apply the migration manually via Supabase dashboard SQL editor',
        '3. Or use Supabase CLI: supabase db push'
      ],
      migration_file: 'supabase/migrations/20250115000000_ensure_attendance_table.sql'
    }, { status: 400 });

  } catch (error) {
    logger.error('Unexpected error in POST /api/migrations/ensure-attendance', {
      endpoint: '/api/migrations/ensure-attendance',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/migrations/ensure-attendance' },
      'Failed to ensure attendance'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}

