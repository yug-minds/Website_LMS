'use client'

import React from 'react'
import CoursePlayer from '@/components/student/course-player/CoursePlayer'

type PageProps = {
  params: Promise<{ courseId: string; chapterId: string; contentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ContentPage(props: PageProps) {
  const params = React.use(props.params)
  React.use(props.searchParams)
  const courseId = params?.courseId

  if (!courseId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-500">Loading course...</p>
        </div>
      </div>
    )
  }

  return <CoursePlayer courseId={courseId} />
}

