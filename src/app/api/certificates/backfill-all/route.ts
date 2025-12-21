/**
 * Backfill Certificates for All Eligible Students
 * 
 * This endpoint will:
 * 1. Find all students with 80%+ completion who don't have certificates
 * 2. Create certificate records for them
 * 3. Generate the actual certificate images
 * 
 * Can be called manually or via cron job
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    console.log('🔍 Starting certificate backfill for all eligible students...')

    // Step 1: Find all student-course combinations with progress
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

    // Step 2: Group by student and course to calculate completion
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

    // Step 3: Get total chapters for each course
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

    // Step 4: Find eligible students (80%+ completion) without certificates
    const eligible: Array<{
      studentId: string
      courseId: string
      completion: number
    }> = []

    for (const entry of studentCourseMap.values()) {
      const totalChapters = courseChapterCounts.get(entry.courseId) || entry.total
      const completion = totalChapters > 0 ? (entry.completed / totalChapters) * 100 : 0

      if (completion >= 80) {
        // Check if certificate exists with URL
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
            completion: Math.round(completion),
          })
        }
      }
    }

    console.log(`✅ Found ${eligible.length} eligible student-course combinations`)

    if (eligible.length === 0) {
      return NextResponse.json({
        processed: 0,
        success: 0,
        errors: 0,
        message: 'No eligible students found who need certificates',
      })
    }

    // Step 5: Process certificates (limit to avoid overload)
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

    console.log(`🔄 Processing ${toProcess.length} certificate(s)...`)

    for (const item of toProcess) {
      try {
        // Ensure certificate record exists first
        const { data: existingCert } = await supabaseAdmin
          .from('certificates')
          .select('id')
          .eq('student_id', item.studentId)
          .eq('course_id', item.courseId)
          .maybeSingle()

        if (!existingCert) {
          // Create certificate record
          const { data: course } = await supabaseAdmin
            .from('courses')
            .select('name, title')
            .eq('id', item.courseId)
            .single()

          await supabaseAdmin
            .from('certificates')
            .insert({
              student_id: item.studentId,
              course_id: item.courseId,
              certificate_name: `${course?.name || course?.title || 'Course'} - Certificate of Completion`,
              certificate_url: null,
              issued_at: new Date().toISOString(),
            })
        }

        // Generate certificate image
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
          console.log(`✅ Generated certificate for student ${item.studentId}, course ${item.courseId}`)
        } else {
          errorCount++
          results.push({
            ...item,
            success: false,
            error: result.error || 'Unknown error',
          })
          console.error(`❌ Failed to generate certificate:`, result.error)
        }
      } catch (error: any) {
        errorCount++
        results.push({
          ...item,
          success: false,
          error: error.message || 'Failed to generate certificate',
        })
        console.error(`❌ Error processing certificate:`, error)
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
    console.error('Error in backfill-all:', error)
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
 * GET /api/certificates/backfill-all
 * 
 * Returns count of eligible students without processing
 */
export async function GET(request: NextRequest) {
  try {
    // Similar logic to POST but just count
    const { data: allProgress } = await supabaseAdmin
      .from('course_progress')
      .select('student_id, course_id, completed')

    const studentCourseMap = new Map<string, { completed: number; total: number }>()
    for (const progress of allProgress || []) {
      const key = `${progress.student_id}-${progress.course_id}`
      if (!studentCourseMap.has(key)) {
        studentCourseMap.set(key, { completed: 0, total: 0 })
      }
      const entry = studentCourseMap.get(key)!
      entry.total++
      if (progress.completed) entry.completed++
    }

    const courseIds = Array.from(new Set(Array.from(studentCourseMap.keys()).map(k => k.split('-')[1])))
    const { data: chapters } = await supabaseAdmin
      .from('chapters')
      .select('course_id')
      .in('course_id', courseIds)
      .eq('is_published', true)

    const courseChapterCounts = new Map<string, number>()
    for (const chapter of chapters || []) {
      courseChapterCounts.set(chapter.course_id, (courseChapterCounts.get(chapter.course_id) || 0) + 1)
    }

    let eligibleCount = 0
    for (const [key, entry] of studentCourseMap.entries()) {
      const [, courseId] = key.split('-')
      const totalChapters = courseChapterCounts.get(courseId) || entry.total
      const completion = totalChapters > 0 ? (entry.completed / totalChapters) * 100 : 0
      if (completion >= 80) {
        const [studentId] = key.split('-')
        const { data: cert } = await supabaseAdmin
          .from('certificates')
          .select('certificate_url')
          .eq('student_id', studentId)
          .eq('course_id', courseId)
          .maybeSingle()
        if (!cert?.certificate_url) {
          eligibleCount++
        }
      }
    }

    return NextResponse.json({
      eligibleCount,
      message: `Found ${eligibleCount} student-course combination(s) eligible for certificates`,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}


