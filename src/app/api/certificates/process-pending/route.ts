/**
 * Process Pending Certificates Endpoint
 * 
 * Background job endpoint to process certificates that were created
 * but don't have certificate_url yet (e.g., if pg_net API call failed)
 * 
 * This endpoint can be called by:
 * - Cron jobs
 * - Scheduled tasks
 * - Manual admin actions
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

/**
 * POST /api/certificates/process-pending
 * 
 * Processes pending certificates (those with NULL certificate_url)
 * 
 * Query params:
 * - limit: Number of certificates to process (default: 10)
 * 
 * Returns: { processed: number, success: number, errors: number, results: array }
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    // Get pending certificates (created in last 7 days to avoid processing very old records)
    const { data: pendingCertificates, error: fetchError } = await supabaseAdmin
      .from('certificates')
      .select('id, student_id, course_id, certificate_name, issued_at')
      .is('certificate_url', null)
      .gte('issued_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('issued_at', { ascending: true })
      .limit(limit)

    if (fetchError) {
      console.error('Error fetching pending certificates:', fetchError)
      return NextResponse.json(
        { 
          processed: 0, 
          success: 0, 
          errors: 0, 
          error: 'Failed to fetch pending certificates',
          details: fetchError.message 
        },
        { status: 500 }
      )
    }

    if (!pendingCertificates || pendingCertificates.length === 0) {
      return NextResponse.json({
        processed: 0,
        success: 0,
        errors: 0,
        message: 'No pending certificates found',
      })
    }

    const results: Array<{
      certificateId: string
      studentId: string
      courseId: string
      success: boolean
      error?: string
    }> = []

    let successCount = 0
    let errorCount = 0

    // Get base URL for API calls
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                   'http://localhost:3000'

    // Process each pending certificate
    for (const cert of pendingCertificates) {
      try {
        // Call the auto-generate endpoint internally
        const response = await fetch(`${baseUrl}/api/certificates/auto-generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            studentId: cert.student_id,
            courseId: cert.course_id,
          }),
        })

        const result = await response.json()

        if (result.success && result.certificateUrl) {
          successCount++
          results.push({
            certificateId: cert.id,
            studentId: cert.student_id,
            courseId: cert.course_id,
            success: true,
          })
        } else {
          errorCount++
          results.push({
            certificateId: cert.id,
            studentId: cert.student_id,
            courseId: cert.course_id,
            success: false,
            error: result.error || 'Unknown error',
          })
        }
      } catch (error: any) {
        errorCount++
        results.push({
          certificateId: cert.id,
          studentId: cert.student_id,
          courseId: cert.course_id,
          success: false,
          error: error.message || 'Failed to process certificate',
        })
        console.error(`Error processing certificate ${cert.id}:`, error)
      }
    }

    return NextResponse.json({
      processed: pendingCertificates.length,
      success: successCount,
      errors: errorCount,
      results,
      message: `Processed ${pendingCertificates.length} certificate(s): ${successCount} success, ${errorCount} errors`,
    })
  } catch (error) {
    console.error('Error in process-pending certificates:', error)
    return NextResponse.json(
      { 
        processed: 0,
        success: 0,
        errors: 0,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/certificates/process-pending
 * 
 * Returns count of pending certificates without processing them
 */
export async function GET(request: NextRequest) {
  try {
    const { data: pendingCertificates, error } = await supabaseAdmin
      .from('certificates')
      .select('id')
      .is('certificate_url', null)
      .gte('issued_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch pending certificates', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      pendingCount: pendingCertificates?.length || 0,
      message: `Found ${pendingCertificates?.length || 0} pending certificate(s)`,
    })
  } catch (error) {
    console.error('Error checking pending certificates:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


