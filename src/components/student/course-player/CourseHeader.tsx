'use client'

import { Card } from '../../ui/card'
import { Progress } from '../../ui/progress'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { 
  BookOpen, 
  Calendar, 
  Award, 
  Play,
  ArrowLeft,
  CheckCircle
} from 'lucide-react'
import Link from 'next/link'

interface CourseHeaderProps {
  course: {
    id: string
    name?: string
    title?: string
    description?: string
    grade?: string
    subject?: string
    release_type?: string
    progress_percentage?: number
  }
  totalChapters: number
  completedChapters: number
  nextChapterId?: string
}

export default function CourseHeader({
  course,
  totalChapters,
  completedChapters,
  nextChapterId,
}: CourseHeaderProps) {
  const progressPercentage = totalChapters > 0 
    ? (completedChapters / totalChapters) * 100 
    : 0
  
  const isCompleted = completedChapters === totalChapters && totalChapters > 0

  return (
    <Card className="mb-6" role="banner" aria-label="Course information">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Link href="/student/my-courses">
              <Button 
                variant="ghost" 
                size="sm" 
                className="mb-4"
                aria-label="Go back to my courses"
              >
                <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                Back to Courses
              </Button>
            </Link>
            
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {course.name || course.title || 'Course'}
            </h1>
            
            {course.description && (
              <p className="text-gray-600 mb-4">{course.description}</p>
            )}
            
            <div className="flex items-center gap-4 mb-4 flex-wrap" role="list" aria-label="Course details">
              {course.grade && (
                <Badge variant="outline" role="listitem">{course.grade}</Badge>
              )}
              {course.subject && (
                <Badge variant="outline" role="listitem">{course.subject}</Badge>
              )}
              {course.release_type && (
                <Badge variant="outline" role="listitem">
                  <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
                  {course.release_type} Release
                </Badge>
              )}
              {isCompleted && (
                <Badge 
                  className="bg-green-100 text-green-800" 
                  role="listitem"
                  aria-label="Course completed"
                >
                  <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                  Completed
                </Badge>
              )}
            </div>
            
            <div className="mt-4" role="region" aria-label="Course progress">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Course Progress</span>
                <span className="font-medium" aria-live="polite">
                  {progressPercentage.toFixed(0)}%
                </span>
              </div>
              <Progress 
                value={progressPercentage} 
                className="h-2"
                aria-label={`Course progress: ${progressPercentage.toFixed(0)}%`}
              />
              <p className="text-xs text-gray-500 mt-1">
                {completedChapters} of {totalChapters} chapters completed
              </p>
            </div>
          </div>
          
          {nextChapterId && !isCompleted && (
            <Link href={`/student/my-courses/${course.id}/chapters/${nextChapterId}`}>
              <Button 
                size="lg" 
                className="ml-6"
                aria-label={completedChapters > 0 ? 'Continue learning this course' : 'Start learning this course'}
              >
                <Play className="h-5 w-5 mr-2" aria-hidden="true" />
                {completedChapters > 0 ? 'Continue Learning' : 'Start Learning'}
              </Button>
            </Link>
          )}
          
          {isCompleted && (
            <div className="ml-6 text-center">
              <div className="bg-green-100 rounded-full p-4 mb-2">
                <Award className="h-8 w-8 text-green-600" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-green-700">Course Complete!</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}












