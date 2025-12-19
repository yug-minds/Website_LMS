import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../../../lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // Get auth token from request
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Missing or invalid authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    // Get student's school and grade
    const { data: studentSchool } = await supabaseAdmin
      .from('student_schools')
      .select('school_id, grade')
      .eq('student_id', user.id)
      .maybeSingle()

    if (!studentSchool) {
      return NextResponse.json(
        { error: 'Student school not found' },
        { status: 404 }
      )
    }

    // Get courses the student has access to
    const { data: enrollments } = await supabaseAdmin
      .from('enrollments')
      .select('course_id')
      .eq('student_id', user.id)
      .eq('status', 'active')

    const { data: courseAccess } = await supabaseAdmin
      .from('course_access')
      .select('course_id')
      .eq('school_id', studentSchool.school_id)
      .eq('grade', studentSchool.grade)

    const courseIds = new Set<string>()
    enrollments?.forEach((e: { course_id: string }) => e.course_id && courseIds.add(e.course_id))
    courseAccess?.forEach((ca: { course_id: string }) => ca.course_id && courseIds.add(ca.course_id))

    if (courseIds.size === 0) {
      return NextResponse.json({ courses: [] })
    }

    // Fetch courses with chapters and assignments
    const { data: courses } = await supabaseAdmin
      .from('courses')
      .select('id, title, grade, subject, description')
      .in('id', Array.from(courseIds))
      .eq('is_published', true)

    if (!courses || courses.length === 0) {
      return NextResponse.json({ courses: [] })
    }

    // Fetch chapters for these courses
    const { data: chapters } = await supabaseAdmin
      .from('chapters')
      .select('id, course_id, title, name, order_index, order_number')
      .in('course_id', Array.from(courseIds))
      .eq('is_published', true)
      .order('order_index', { ascending: true })
      .order('order_number', { ascending: true })

    // Fetch assignments for these courses and chapters
    const { data: assignments } = await supabaseAdmin
      .from('assignments')
      .select('id, course_id, chapter_id, title, description, assignment_type, due_date, max_score, auto_grading_enabled, is_published')
      .in('course_id', Array.from(courseIds))
      .eq('is_published', true)

    // Fetch submissions to determine status
    const { data: submissions } = await supabaseAdmin
      .from('submissions')
      .select('id, assignment_id, status, grade, submitted_at, feedback')
      .eq('student_id', user.id)

    // Organize data hierarchically
    type CourseWithChapters = {
      id: string
      title: string
      grade: string | null
      subject: string | null
      description: string | null
      chapters: any[]
    }
    const coursesMap = new Map<string, CourseWithChapters>(courses.map((c: {
      id: string
      title: string
      grade: string | null
      subject: string | null
      description: string | null
    }) => [c.id, {
      ...c,
      chapters: [] as any[]
    }]))

    // Add chapters to courses
    chapters?.forEach((chapter: {
      id: string
      course_id: string
      title: string
      name: string
      order_index: number | null
      order_number: number | null
    }) => {
      const course = coursesMap.get(chapter.course_id)
      if (course) {
        course.chapters.push({
          ...chapter,
          assignments: [] as any[]
        })
      }
    })

    // Add assignments to chapters
    assignments?.forEach((assignment: {
      id: string
      course_id: string
      chapter_id: string | null
      title: string
      description: string | null
      assignment_type: string | null
      due_date: string | null
      max_score: number | null
      auto_grading_enabled: boolean | null
      is_published: boolean | null
    }) => {
      const course = coursesMap.get(assignment.course_id)
      if (course) {
        if (assignment.chapter_id) {
          // Assignment linked to a chapter
          const chapter = course.chapters.find((ch: any) => ch.id === assignment.chapter_id)
          if (chapter) {
            const submission = submissions?.find((s: {
              id: string
              assignment_id: string
              status: string
              grade: number | null
              submitted_at: string | null
              feedback: string | null
            }) => s.assignment_id === assignment.id)
            const dueDate = assignment.due_date ? new Date(assignment.due_date) : null
            const now = new Date()
            const isOverdue = dueDate && dueDate < now && (!submission || submission.status !== 'submitted')
            const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null

            let status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'overdue' = 'not_started'
            if (submission) {
              if (submission.status === 'graded' || submission.grade !== null) {
                status = 'graded'
              } else if (submission.status === 'submitted') {
                status = 'submitted'
              } else {
                status = 'in_progress'
              }
            } else if (isOverdue) {
              status = 'overdue'
            }

            chapter.assignments.push({
              ...assignment,
              status,
              submission: submission || undefined,
              is_overdue: isOverdue || false,
              days_until_due: daysUntilDue || 0
            })
          }
        } else {
          // Assignment linked directly to course (no chapter)
          // Create a virtual "Uncategorized" chapter
          let uncategorizedChapter = course.chapters.find((ch: any) => ch.id === 'uncategorized')
          if (!uncategorizedChapter) {
            uncategorizedChapter = {
              id: 'uncategorized',
              course_id: assignment.course_id,
              title: 'Uncategorized',
              name: 'Uncategorized',
              order_index: 9999,
              order_number: 9999,
              assignments: []
            }
            course.chapters.push(uncategorizedChapter)
          }

          const submission = submissions?.find((s: {
            id: string
            assignment_id: string
            status: string
            grade: number | null
            submitted_at: string | null
            feedback: string | null
          }) => s.assignment_id === assignment.id)
          const dueDate = assignment.due_date ? new Date(assignment.due_date) : null
          const now = new Date()
          const isOverdue = dueDate && dueDate < now && (!submission || submission.status !== 'submitted')
          const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null

          let status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'overdue' = 'not_started'
          if (submission) {
            if (submission.status === 'graded' || submission.grade !== null) {
              status = 'graded'
            } else if (submission.status === 'submitted') {
              status = 'submitted'
            } else {
              status = 'in_progress'
            }
          } else if (isOverdue) {
            status = 'overdue'
          }

          uncategorizedChapter.assignments.push({
            ...assignment,
            status,
            submission: submission || undefined,
            is_overdue: isOverdue || false,
            days_until_due: daysUntilDue || 0
          })
        }
      }
    })

    // Sort chapters by order_index
    coursesMap.forEach(course => {
      course.chapters.sort((a: any, b: any) => {
        const orderA = a.order_index ?? a.order_number ?? 9999
        const orderB = b.order_index ?? b.order_number ?? 9999
        return orderA - orderB
      })
    })

    // Convert map to array
    const result = Array.from(coursesMap.values())

    return NextResponse.json({ courses: result })
  } catch (error: any) {
    console.error('Error fetching assignment hierarchy:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

