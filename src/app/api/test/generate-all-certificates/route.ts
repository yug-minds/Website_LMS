/**
 * Test endpoint to generate certificates for all eligible students
 * This will find all students with 80%+ completion and generate certificates
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

export async function POST(request: NextRequest) {
  try {
    // Find all students with course progress
    const { data: allProgress, error: progressError } = await supabaseAdmin
      .from('course_progress')
      .select(`
        student_id,
        course_id,
        completed,
        courses (id, name, title),
        profiles!course_progress_student_id_fkey (id, full_name, email)
      `)

    if (progressError) {
      return NextResponse.json(
        { error: 'Failed to fetch progress', details: progressError.message },
        { status: 500 }
      )
    }

    // Group by student and course
    const studentCourseMap = new Map<string, {
      studentId: string
      courseId: string
      studentName: string
      courseName: string
      completed: number
      total: number
    }>()

    for (const progress of allProgress || []) {
      const key = `${progress.student_id}-${progress.course_id}`
      if (!studentCourseMap.has(key)) {
        studentCourseMap.set(key, {
          studentId: progress.student_id,
          courseId: progress.course_id,
          studentName: (progress as any).profiles?.full_name || 'Student',
          courseName: (progress as any).courses?.name || (progress as any).courses?.title || 'Course',
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

    // Find eligible students (80%+ completion) without certificates
    const eligible: Array<{
      studentId: string
      courseId: string
      studentName: string
      courseName: string
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
            studentName: entry.studentName,
            courseName: entry.courseName,
            completion: Math.round(completion),
          })
        }
      }
    }

    if (eligible.length === 0) {
      return NextResponse.json({
        message: 'No eligible students found who need certificates',
        eligible: 0,
      })
    }

    // Generate certificates
    const results: Array<{
      studentName: string
      courseName: string
      completion: number
      success: boolean
      error?: string
    }> = []

    let successCount = 0
    let errorCount = 0

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                   'http://localhost:3000'

    for (const item of eligible) {
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
            studentName: item.studentName,
            courseName: item.courseName,
            completion: item.completion,
            success: true,
          })
        } else {
          errorCount++
          results.push({
            studentName: item.studentName,
            courseName: item.courseName,
            completion: item.completion,
            success: false,
            error: result.error || 'Unknown error',
          })
        }
      } catch (error: any) {
        errorCount++
        results.push({
          studentName: item.studentName,
          courseName: item.courseName,
          completion: item.completion,
          success: false,
          error: error.message || 'Failed to generate',
        })
      }
    }

    return NextResponse.json({
      totalEligible: eligible.length,
      processed: eligible.length,
      success: successCount,
      errors: errorCount,
      results,
      message: `Generated ${successCount} of ${eligible.length} certificates`,
    })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}


