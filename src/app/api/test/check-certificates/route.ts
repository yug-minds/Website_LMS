/**
 * Test endpoint to check certificate status for a student
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') || 'sharma@dawnbudsmodelschool.edu'

    // Find student
    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('email', email)
      .eq('role', 'student')
      .single()

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Check existing certificates
    const { data: certificates } = await supabaseAdmin
      .from('certificates')
      .select('id, certificate_name, certificate_url, issued_at, course_id')
      .eq('student_id', student.id)

    // Check course progress
    const { data: progress } = await supabaseAdmin
      .from('course_progress')
      .select(`
        course_id,
        completed,
        courses (id, name, title)
      `)
      .eq('student_id', student.id)

    // Calculate completion for each course
    const courseMap = new Map<string, any>()
    for (const p of progress || []) {
      const courseId = p.course_id
      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, {
          course: (p as any).courses,
          completed: 0,
          total: 0,
        })
      }
      const entry = courseMap.get(courseId)!
      entry.total++
      if (p.completed) {
        entry.completed++
      }
    }

    // Get total chapters
    for (const [courseId, entry] of courseMap.entries()) {
      const { data: chapters } = await supabaseAdmin
        .from('chapters')
        .select('id')
        .eq('course_id', courseId)
        .eq('is_published', true)
      entry.total = chapters?.length || entry.total
    }

    const courseDetails = Array.from(courseMap.entries()).map(([courseId, entry]) => {
      const completion = entry.total > 0 ? (entry.completed / entry.total) * 100 : 0
      const cert = certificates?.find((c: { id: string; certificate_name: string | null; certificate_url: string | null; issued_at: string | null; course_id: string }) => c.course_id === courseId)
      return {
        courseId,
        courseName: entry.course?.name || entry.course?.title,
        completion: Math.round(completion),
        eligible: completion >= 80,
        hasCertificate: !!cert,
        hasCertificateUrl: !!cert?.certificate_url,
        certificateId: cert?.id,
      }
    })

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.full_name,
        email: student.email,
      },
      certificates: certificates || [],
      courses: courseDetails,
      summary: {
        totalCertificates: certificates?.length || 0,
        certificatesWithUrl: certificates?.filter((c: { id: string; certificate_name: string | null; certificate_url: string | null; issued_at: string | null; course_id: string }) => c.certificate_url).length || 0,
        eligibleCourses: courseDetails.filter(c => c.eligible).length,
        eligibleWithoutCert: courseDetails.filter(c => c.eligible && !c.hasCertificateUrl).length,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}


