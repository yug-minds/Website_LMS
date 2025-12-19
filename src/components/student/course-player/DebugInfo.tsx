'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { Card } from '../../ui/card'

export default function DebugInfo() {
  const params = useParams()
  const courseId = params?.courseId as string
  const chapterId = params?.chapterId as string
  const [debugData, setDebugData] = useState<any>({})

  useEffect(() => {
    const runDebug = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: { session } } = await supabase.auth.getSession()
        
        // Test direct chapter query
        const { data: chapter, error: chapterError } = await supabase
          .from('chapters')
          .select('*')
          .eq('id', chapterId)
          .maybeSingle()

        // Test direct course query
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .maybeSingle()

        // Test student school
        const { data: studentSchool, error: schoolError } = await supabase
          .from('student_schools')
          .select('*')
          .eq('student_id', user?.id)
          .eq('is_active', true)
          .maybeSingle()

        // Test course access
        const { data: courseAccess, error: accessError } = await supabase
          .from('course_access')
          .select('*')
          .eq('course_id', courseId)

        // Test enrollment
        const { data: enrollment, error: enrollmentError } = await supabase
          .from('enrollments')
          .select('*')
          .eq('student_id', user?.id)
          .eq('course_id', courseId)

        setDebugData({
          user: user ? { id: user.id, email: user.email } : null,
          hasSession: !!session,
          hasToken: !!session?.access_token,
          courseId,
          chapterId,
          chapter: { data: chapter, error: chapterError },
          course: { data: course, error: courseError },
          studentSchool: { data: studentSchool, error: schoolError },
          courseAccess: { data: courseAccess, error: accessError },
          enrollment: { data: enrollment, error: enrollmentError },
        })
      } catch (error) {
        setDebugData({ error: error instanceof Error ? error.message : String(error) })
      }
    }

    if (courseId && chapterId) {
      runDebug()
    }
  }, [courseId, chapterId])

  return (
    <Card className="p-4 mb-4 bg-yellow-50 border-yellow-200">
      <h3 className="font-bold text-yellow-800 mb-2">Debug Information</h3>
      <pre className="text-xs overflow-auto max-h-96 bg-white p-2 rounded">
        {JSON.stringify(debugData, null, 2)}
      </pre>
    </Card>
  )
}