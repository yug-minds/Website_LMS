/**
 * Check for certificates with NULL certificate_url that need processing
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // Find certificates with NULL certificate_url
    const { data: pendingCerts, error } = await supabaseAdmin
      .from('certificates')
      .select(`
        id,
        student_id,
        course_id,
        certificate_name,
        issued_at
      `)
      .is('certificate_url', null)
      .order('issued_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch pending certificates', details: error.message },
        { status: 500 }
      )
    }

    // Fetch student and course details separately
    const studentIds = Array.from(new Set(pendingCerts?.map((c: { id: string; student_id: string; course_id: string; certificate_name: string | null; issued_at: string | null }) => c.student_id) || []))
    const courseIds = Array.from(new Set(pendingCerts?.map((c: { id: string; student_id: string; course_id: string; certificate_name: string | null; issued_at: string | null }) => c.course_id) || []))

    const studentsMap = new Map()
    const coursesMap = new Map()

    if (studentIds.length > 0) {
      const { data: students } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds)
      if (students) {
        students.forEach((s: { id: string; full_name: string | null; email: string }) => studentsMap.set(s.id, s))
      }
    }

    if (courseIds.length > 0) {
      const { data: courses } = await supabaseAdmin
        .from('courses')
        .select('id, name, title')
        .in('id', courseIds)
      if (courses) {
        courses.forEach((c: { id: string; name: string | null; title: string | null }) => coursesMap.set(c.id, c))
      }
    }

    const enrichedCerts = pendingCerts?.map((cert: { id: string; student_id: string; course_id: string; certificate_name: string | null; issued_at: string | null }) => ({
      ...cert,
      student: studentsMap.get(cert.student_id) || null,
      course: coursesMap.get(cert.course_id) || null,
    })) || []

    return NextResponse.json({
      count: enrichedCerts.length,
      pendingCertificates: enrichedCerts,
      message: `Found ${enrichedCerts.length} certificate(s) pending image generation`,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}


