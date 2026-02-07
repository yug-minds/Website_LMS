/**
 * Test endpoint to generate certificates for all eligible students
 * This will find all students with 80%+ completion and generate certificates
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

export async function POST(request: NextRequest) {
  // Validate CSRF protection
  const { validateCsrf, ensureCsrfToken } = await import('../../../../lib/csrf-middleware');
  const csrfError = await validateCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  ensureCsrfToken(request);
  
  try {
    type ProgressRow = { student_id?: string; course_id?: string; completed?: boolean; courses?: { name?: string | null; title?: string | null } | null; profiles?: { full_name?: string | null } | null };
    type ChapterRow = { id?: string; course_id?: string };
    type CertRow = { certificate_url?: string | null };
    // Find all students with course progress
    const { data: allProgressData, error: progressError } = await supabaseAdmin
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

    const allProgress = (allProgressData || []) as ProgressRow[]
    // Group by student and course
    const studentCourseMap = new Map<string, {
      studentId: string
      courseId: string
      studentName: string
      courseName: string
      completed: number
      total: number
    }>()

    for (const progress of allProgress) {
      const sid = progress.student_id ?? '';
      const cid = progress.course_id ?? '';
      const key = `${sid}-${cid}`
      if (sid && cid && !studentCourseMap.has(key)) {
        studentCourseMap.set(key, {
          studentId: sid,
          courseId: cid,
          studentName: (progress.profiles?.full_name ?? 'Student') as string,
          courseName: (progress.courses?.name ?? progress.courses?.title ?? 'Course') as string,
          completed: 0,
          total: 0,
        })
      }
      if (sid && cid) {
        const entry = studentCourseMap.get(key)!
        entry.total++
        if (progress.completed) {
          entry.completed++
        }
      }
    }

    // Get total chapters for each course
    const courseIds = Array.from(new Set(Array.from(studentCourseMap.values()).map(e => e.courseId)))
    const { data: chaptersData } = await supabaseAdmin
      .from('chapters')
      .select('id, course_id')
      .in('course_id', courseIds)
      .eq('is_published', true)

    const chapters = (chaptersData || []) as ChapterRow[]
    const courseChapterCounts = new Map<string, number>()
    for (const chapter of chapters) {
      const cid = chapter.course_id ?? '';
      if (cid) {
        const count = courseChapterCounts.get(cid) || 0
        courseChapterCounts.set(cid, count + 1)
      }
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
        const { data: existingCertData } = await supabaseAdmin
          .from('certificates')
          .select('certificate_url')
          .eq('student_id', entry.studentId)
          .eq('course_id', entry.courseId)
          .maybeSingle()

        const existingCert = existingCertData as CertRow | null
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
      } catch (error: unknown) {
        errorCount++
        results.push({
          studentName: item.studentName,
          courseName: item.courseName,
          completion: item.completion,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate',
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
  } catch (error: unknown) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}


