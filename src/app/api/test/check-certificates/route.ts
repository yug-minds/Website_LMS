/**
 * Test endpoint to check certificate status for a student
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

type ProfileRow = { id?: string; full_name?: string | null; email?: string | null };
type CertRow = { id?: string; certificate_name?: string | null; certificate_url?: string | null; issued_at?: string | null; course_id?: string };
type ProgressRow = { course_id?: string; completed?: boolean; courses?: { id?: string; name?: string | null; title?: string | null } | null };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') || 'sharma@dawnbudsmodelschool.edu'

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

    // Check existing certificates
    const { data: certsData } = await supabaseAdmin
      .from('certificates')
      .select('id, certificate_name, certificate_url, issued_at, course_id')
      .eq('student_id', student.id)
    const certificates = (certsData || []) as CertRow[]

    // Check course progress
    const { data: progressData } = await supabaseAdmin
      .from('course_progress')
      .select(`
        course_id,
        completed,
        courses (id, name, title)
      `)
      .eq('student_id', student.id)
    const progress = (progressData || []) as ProgressRow[]

    // Calculate completion for each course
    const courseMap = new Map<string, { course: unknown; completed: number; total: number }>()
    for (const p of progress) {
      const courseId = p.course_id ?? ''
      if (courseId && !courseMap.has(courseId)) {
        courseMap.set(courseId, {
          course: p.courses,
          completed: 0,
          total: 0,
        })
      }
      if (courseId) {
        const entry = courseMap.get(courseId)!
        entry.total++
        if (p.completed) {
          entry.completed++
        }
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
      const cert = certificates.find((c) => c.course_id === courseId)
      const course = entry.course as { name?: string | null; title?: string | null } | null
      return {
        courseId,
        courseName: course?.name ?? course?.title ?? '',
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
      certificates,
      courses: courseDetails,
      summary: {
        totalCertificates: certificates.length,
        certificatesWithUrl: certificates.filter((c) => c.certificate_url).length,
        eligibleCourses: courseDetails.filter(c => c.eligible).length,
        eligibleWithoutCert: courseDetails.filter(c => c.eligible && !c.hasCertificateUrl).length,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}


