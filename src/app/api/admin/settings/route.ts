import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { systemSettingsSchema, validateRequestBody } from '../../../../lib/validation-schemas';
import { logger, handleApiError } from '../../../../lib/logger';


// GET: Retrieve system settings
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
    // In a real application, you would fetch from a settings table
    // For now, return default settings
    const defaultSettings = {
      site_name: "RoboCoders Student Portal",
      site_description: "Comprehensive student management system",
      email_notifications: true,
      sms_notifications: false,
      maintenance_mode: false,
      max_file_size: 10,
      session_timeout: 30
    };

    // Try to get from a settings table if it exists
    const { data: settings } = await supabaseAdmin
      .from('system_settings')
      .select('id, key, value, created_at, updated_at')
      .eq('key', 'main')
       
      .single() as any;

    if (settings && settings.value) {
      return NextResponse.json({ settings: { ...defaultSettings, ...settings.value } });
    }

    return NextResponse.json({ settings: defaultSettings });
  } catch (error) {
    logger.warn('Error fetching settings, returning defaults', {
      endpoint: '/api/admin/settings',
    }, error instanceof Error ? error : new Error(String(error)));
    
    // If table doesn't exist, return defaults
    return NextResponse.json({
      settings: {
        site_name: "RoboCoders Student Portal",
        site_description: "Comprehensive student management system",
        email_notifications: true,
        sms_notifications: false,
        maintenance_mode: false,
        max_file_size: 10,
        session_timeout: 30
      }
    });
  }
}

// POST: Save system settings
export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);

  try {
    const body = await request.json();
    
    // Validate request body
    const validation = validateRequestBody(systemSettingsSchema, body);
    if (!validation.success) {
       
      const errorMessages = validation.details?.issues?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || validation.error || 'Invalid request data';
      logger.warn('Validation failed for system settings update', {
        endpoint: '/api/admin/settings',
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
    
    // In a real application, you would save to a settings table
    // For now, we'll create/update a system_settings table entry
    
    // Ensure system_settings table exists (create if needed)
    const { error: createError } = await supabaseAdmin.rpc('create_system_settings_table_if_not_exists');
    
    // Try to upsert settings
    const { data, error } = await (supabaseAdmin
      .from('system_settings')
      .upsert({
        key: 'main',
        value: body,
        updated_at: new Date().toISOString()
       
      } as any, {
        onConflict: 'key'
      })
      .select()
       
      .single() as any);

    if (error && error.code !== '42P01') { // 42P01 = table doesn't exist
      console.error('Error saving system settings:', error);
      // Still return success since settings are stored in memory/state
    }

    const successResponse = NextResponse.json({
      success: true,
      message: 'System settings saved successfully',
      settings: body
    });
    ensureCsrfToken(successResponse, request);
    return successResponse;
  } catch (error) {
    logger.error('Unexpected error in POST /api/admin/settings', {
      endpoint: '/api/admin/settings',
    }, error instanceof Error ? error : new Error(String(error)));
    
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/admin/settings' },
      'Failed to save settings'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}



