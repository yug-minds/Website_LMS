/**
 * Batch Generate Certificates Endpoint
 * 
 * Admin endpoint to generate certificates for all eligible students
 * who have completed 80%+ of courses but don't have certificates yet
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabase'
import { verifyAdmin } from '../../../../../lib/auth-utils'

/**
 * POST /api/admin/certificates/batch-generate
 * 
 * Generates certificates for all eligible students
 * 
 * Query params:
 * - limit: Number of certificates to process (default: 50)
 * - force: If true, regenerate even if certificate exists (default: false)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const auth = await verifyAdmin(request)
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const force = searchParams.get('force') === 'true'

    // Find all students with 80%+ completion who need certificates
    const { data: eligibleStudents, error: findError } = await supabaseAdmin
      .rpc('batch_generate_certificates_for_eligible_students')

    if (findError) {
      console.error('Error finding eligible students:', findError)
      return NextResponse.json(
        { error: 'Failed to find eligible students', details: findError.message },
        { status: 500 }
      )
    }

    if (!eligibleStudents || eligibleStudents.length === 0) {
      return NextResponse.json({
        processed: 0,
        success: 0,
        errors: 0,
        message: 'No eligible students found',
      })
    }

    // Process certificates (limit to avoid overload)
    const toProcess = eligibleStudents.slice(0, limit)
    const results: Array<{
      studentId: string
      courseId: string
      success: boolean
      certificateUrl?: string
      error?: string
    }> = []

    let successCount = 0
    let errorCount = 0

    // Get base URL for API calls
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                   'http://localhost:3000'

    for (const item of toProcess) {
      try {
        // Check if certificate already has URL (unless force is true)
        if (!force) {
          const { data: existingCert } = await supabaseAdmin
            .from('certificates')
            .select('certificate_url')
            .eq('student_id', item.student_id)
            .eq('course_id', item.course_id)
            .maybeSingle()

          if (existingCert?.certificate_url) {
            results.push({
              studentId: item.student_id,
              courseId: item.course_id,
              success: true,
              certificateUrl: existingCert.certificate_url,
            })
            successCount++
            continue
          }
        }

        // Call auto-generate endpoint
        const response = await fetch(`${baseUrl}/api/certificates/auto-generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            studentId: item.student_id,
            courseId: item.course_id,
          }),
        })

        const result = await response.json()

        if (result.success && result.certificateUrl) {
          successCount++
          results.push({
            studentId: item.student_id,
            courseId: item.course_id,
            success: true,
            certificateUrl: result.certificateUrl,
          })
        } else {
          errorCount++
          results.push({
            studentId: item.student_id,
            courseId: item.course_id,
            success: false,
            error: result.error || 'Unknown error',
          })
        }
      } catch (error: any) {
        errorCount++
        results.push({
          studentId: item.student_id,
          courseId: item.course_id,
          success: false,
          error: error.message || 'Failed to generate certificate',
        })
        console.error(`Error generating certificate for student ${item.student_id}, course ${item.course_id}:`, error)
      }
    }

    return NextResponse.json({
      processed: toProcess.length,
      success: successCount,
      errors: errorCount,
      totalEligible: eligibleStudents.length,
      results,
      message: `Processed ${toProcess.length} certificate(s): ${successCount} success, ${errorCount} errors`,
    })
  } catch (error: any) {
    console.error('Error in batch certificate generation:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/certificates/batch-generate
 * 
 * Returns count of eligible students who need certificates
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const auth = await verifyAdmin(request)
    if (!auth.success) {
      return auth.response
    }

    const { data: eligibleStudents, error } = await supabaseAdmin
      .rpc('batch_generate_certificates_for_eligible_students')

    if (error) {
      return NextResponse.json(
        { error: 'Failed to find eligible students', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      eligibleCount: eligibleStudents?.length || 0,
      message: `Found ${eligibleStudents?.length || 0} student(s) eligible for certificates`,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


