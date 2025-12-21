/**
 * Generate Certificates for All Eligible Students
 * 
 * Admin endpoint to generate certificates for all students who have
 * completed 80%+ of courses but don't have certificates yet
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabase'
import { verifyAdmin } from '../../../../../lib/auth-utils'

/**
 * POST /api/admin/certificates/generate-all-eligible
 * 
 * Finds all eligible students and generates certificates for them
 * 
 * Query params:
 * - limit: Number of certificates to process per batch (default: 20)
 * - batch: Batch number (for processing in chunks, default: 0)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const auth = await verifyAdmin(request)
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // Find all students with 80%+ completion who need certificates
    // Query: Get all student-course combinations with 80%+ completion
    const { data: allProgress, error: progressError } = await supabaseAdmin
      .from('course_progress')
      .select(`
        student_id,
        course_id,
        completed
      `)

    if (progressError) {
      return NextResponse.json(
        { error: 'Failed to fetch progress data', details: progressError.message },
        { status: 500 }
      )
    }

    // Group by student and course to calculate completion
    const studentCourseMap = new Map<string, {
      studentId: string
      courseId: string
      completed: number
      total: number
    }>()

    for (const progress of allProgress || []) {
      const key = `${progress.student_id}-${progress.course_id}`
      if (!studentCourseMap.has(key)) {
        studentCourseMap.set(key, {
          studentId: progress.student_id,
          courseId: progress.course_id,
          completed: 0,
          total: 0,
        })
      }
      const entry = studentCourseMap.get(key)!
      entry.total++
      if (progress.completed) {
        entry.completed++
      }
    }

    // Get total chapters for each course
    const courseIds = Array.from(new Set(Array.from(studentCourseMap.values()).map(e => e.courseId)))
    const { data: chapters } = await supabaseAdmin
      .from('chapters')
      .select('id, course_id')
      .in('course_id', courseIds)
      .eq('is_published', true)

    const courseChapterCounts = new Map<string, number>()
    for (const chapter of chapters || []) {
      const count = courseChapterCounts.get(chapter.course_id) || 0
      courseChapterCounts.set(chapter.course_id, count + 1)
    }

    // Find eligible students (80%+ completion)
    const eligible: Array<{ studentId: string; courseId: string; completion: number }> = []
    
    for (const entry of studentCourseMap.values()) {
      const totalChapters = courseChapterCounts.get(entry.courseId) || entry.total
      const completion = totalChapters > 0 ? (entry.completed / totalChapters) * 100 : 0
      
      if (completion >= 80) {
        // Check if certificate already exists with URL
        const { data: existingCert } = await supabaseAdmin
          .from('certificates')
          .select('certificate_url')
          .eq('student_id', entry.studentId)
          .eq('course_id', entry.courseId)
          .maybeSingle()

        if (!existingCert?.certificate_url) {
          eligible.push({
            studentId: entry.studentId,
            courseId: entry.courseId,
            completion,
          })
        }
      }
    }

    if (eligible.length === 0) {
      return NextResponse.json({
        processed: 0,
        success: 0,
        errors: 0,
        message: 'No eligible students found who need certificates',
      })
    }

    // Process certificates (limit to avoid overload)
    const toProcess = eligible.slice(0, limit)
    const results: Array<{
      studentId: string
      courseId: string
      completion: number
      success: boolean
      certificateUrl?: string
      error?: string
    }> = []

    let successCount = 0
    let errorCount = 0

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                   'http://localhost:3000'

    for (const item of toProcess) {
      try {
        const response = await fetch(`${baseUrl}/api/certificates/auto-generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            studentId: item.studentId,
            courseId: item.courseId,
          }),
        })

        const result = await response.json()

        if (result.success && result.certificateUrl) {
          successCount++
          results.push({
            ...item,
            success: true,
            certificateUrl: result.certificateUrl,
          })
        } else {
          errorCount++
          results.push({
            ...item,
            success: false,
            error: result.error || 'Unknown error',
          })
        }
      } catch (error: any) {
        errorCount++
        results.push({
          ...item,
          success: false,
          error: error.message || 'Failed to generate certificate',
        })
      }
    }

    return NextResponse.json({
      processed: toProcess.length,
      success: successCount,
      errors: errorCount,
      totalEligible: eligible.length,
      remaining: eligible.length - toProcess.length,
      results,
      message: `Processed ${toProcess.length} of ${eligible.length} eligible certificate(s): ${successCount} success, ${errorCount} errors`,
    })
  } catch (error: any) {
    console.error('Error in generate-all-eligible:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    )
  }
}


