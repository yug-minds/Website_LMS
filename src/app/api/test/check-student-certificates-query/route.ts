/**
 * Test endpoint to check what the student certificates query returns
 * This simulates what the frontend hook does
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') || 'sharma@dawnbudsmodelschool.edu'

    // Get student
    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('email', email)
      .eq('role', 'student')
      .single()

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Simulate the exact query from useStudentCertificates hook
    const { data, error } = await supabaseAdmin
      .from('certificates')
      .select(`
        id,
        certificate_name,
        certificate_url,
        issued_at,
        courses(id, name, title, grade, subject),
        profiles!certificates_issued_by_fkey(full_name)
      `)
      .eq('student_id', student.id)
      .order('issued_at', { ascending: false })

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.full_name,
        email: student.email,
      },
      queryResult: {
        data,
        error: error ? {
          message: error.message,
          details: error.details,
          hint: error.hint,
        } : null,
        count: data?.length || 0,
      },
      certificates: data || [],
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    )
  }
}


