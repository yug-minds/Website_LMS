'use client'

// This page is deprecated - redirecting to new My Courses page
import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

type PageProps = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CourseDetailRedirect(props: PageProps) {
  const router = useRouter()
  const params = React.use(props.params)
  React.use(props.searchParams)
  const courseId = params.courseId

  useEffect(() => {
    if (courseId) {
      router.replace(`/student/my-courses/${courseId}`)
    } else {
      router.replace('/student/my-courses')
    }
  }, [router, courseId])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-600">Redirecting to My Courses...</p>
      </div>
    </div>
  )
}
