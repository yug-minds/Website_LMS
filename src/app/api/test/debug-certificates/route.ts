/**
 * Debug endpoint to check why certificates aren't being generated
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

interface CourseProgress {
  course_id: string;
  completed: boolean;
  chapter_id: string;
  courses: {
    id: string;
    name: string | null;
    title: string | null;
  } | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') || 'sharma@dawnbudsmodelschool.edu'

    type ProfileRow = { id?: string; full_name?: string | null; email?: string | null };
    type CertRow = { id?: string; certificate_url?: string | null };
    // Find student
    const { data: studentData } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('email', email)
      .eq('role', 'student')
      .single()

    const student = studentData as ProfileRow | null
    if (!student?.id) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Get all courses for this student
    const { data: progressData } = await supabaseAdmin
      .from('course_progress')
      .select(`
        course_id,
        completed,
        chapter_id,
        courses (id, name, title)
      `)
      .eq('student_id', student.id)

    const progress = (progressData || []) as CourseProgress[]
    // Get all courses
    const courseIds = Array.from(new Set(progress.map((p) => p.course_id)))
    
    const courseDetails = await Promise.all(courseIds.map(async (courseId) => {
      // Get total published chapters
      const { data: chapters } = await supabaseAdmin
        .from('chapters')
        .select('id')
        .eq('course_id', courseId)
        .eq('is_published', true)

      const totalChapters = chapters?.length || 0

      // Get completed chapters for this student
      const cid = courseId ?? ''
      const { data: studentProgress } = await supabaseAdmin
        .from('course_progress')
        .select('completed')
        .eq('student_id', student.id as string)
        .eq('course_id', cid)

      const completedChapters = studentProgress?.filter((p: { completed: boolean }) => p.completed === true).length || 0
      const completion = totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0

      // Check existing certificate
      const { data: certData } = await supabaseAdmin
        .from('certificates')
        .select('id, certificate_url')
        .eq('student_id', student.id as string)
        .eq('course_id', cid)
        .maybeSingle()

      const cert = certData as CertRow | null
      const course = progress.find((p) => p.course_id === courseId)
      const courseInfo = course?.courses

      return {
        courseId,
        courseName: courseInfo?.name || courseInfo?.title || 'Unknown',
        totalChapters,
        completedChapters,
        completion: Math.round(completion),
        eligible: completion >= 80,
        hasCertificate: !!cert,
        hasCertificateUrl: !!cert?.certificate_url,
        certificateId: cert?.id,
      }
    }))

    // Note: Trigger check would require direct SQL access

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.full_name,
        email: student.email,
      },
      courses: courseDetails,
      summary: {
        totalCourses: courseDetails.length,
        eligibleCourses: courseDetails.filter(c => c.eligible).length,
        coursesWithCertificates: courseDetails.filter(c => c.hasCertificateUrl).length,
        coursesNeedingCertificates: courseDetails.filter(c => c.eligible && !c.hasCertificateUrl).length,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      { status: 500 }
    )
  }
}


