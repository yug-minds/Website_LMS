'use client'

// This page is deprecated - redirecting to new My Courses page
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function CoursesPageRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/student/my-courses')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-600">Redirecting to My Courses...</p>
      </div>
    </div>
  )
}
