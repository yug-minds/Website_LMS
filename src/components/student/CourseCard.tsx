'use client'

import Image from 'next/image'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Progress } from '../ui/progress'
import { Badge } from '../ui/badge'
import { 
  BookOpen, 
  Play, 
  Clock, 
  CheckCircle,
  MoreHorizontal
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '../../lib/utils'

interface CourseCardProps {
  course: {
    id: string
    title: string
    description: string
    grade: string
    subject: string
    thumbnail_url?: string
    progress_percentage: number
    last_accessed: string
    total_chapters: number
    completed_chapters: number
    total_assignments: number
    completed_assignments: number
    average_grade?: number
    status: 'active' | 'completed' | 'not_started'
  }
   
  onViewChapters?: (course: any) => void
}

export default function CourseCard({ course, onViewChapters }: CourseCardProps) {
  const router = useRouter()
  const isStarted = course.progress_percentage > 0 || course.status === 'active' || course.status === 'completed'
  const isCompleted = course.progress_percentage === 100 || course.status === 'completed'

  const handleViewChapters = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onViewChapters) {
      onViewChapters(course)
    } else {
      // Fallback: navigate directly if no callback provided
      router.push(`/student/my-courses/${course.id}`)
    }
  }

  return (
    <Card className="text-card-foreground gap-6 rounded-xl border py-6 shadow-sm group flex flex-col overflow-hidden h-full border-gray-200 hover:shadow-xl transition-all duration-300 ease-in-out bg-white">
      {/* Course Thumbnail Container */}
      <div className="relative w-full pt-[56.25%] bg-gray-100 overflow-hidden">
        {course.thumbnail_url ? (
          <Image 
            src={course.thumbnail_url} 
            alt={course.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <BookOpen className="h-12 w-12 text-gray-400" />
          </div>
        )}
        
        {/* Overlay on Hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />

        {/* Status Badge */}
        {isCompleted && (
           <div className="absolute top-3 right-3">
             <Badge className="bg-green-500/90 hover:bg-green-500 text-white border-none shadow-sm backdrop-blur-sm">
               Completed
             </Badge>
           </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-col flex-grow px-6">
        <div className="flex-grow space-y-2">
          <h3 className="font-bold text-gray-900 line-clamp-2 text-lg leading-tight group-hover:text-blue-600 transition-colors">
            {course.title}
          </h3>
          
          <p className="text-sm text-gray-500 line-clamp-2">
            {course.description}
          </p>
          
          <div className="text-xs text-gray-500 pt-1">
            {course.grade} • {course.subject}
          </div>

          {/* Progress Section */}
          <div className="pt-3 space-y-2">
             <div className="flex justify-between text-xs font-medium text-gray-600">
               <span>{isCompleted ? '100% Complete' : `${Math.round(course.progress_percentage)}% Complete`}</span>
               <span>{course.completed_chapters}/{course.total_chapters} Chapters</span>
             </div>
             <Progress value={course.progress_percentage} className={`h-1.5 bg-gray-100 ${isCompleted ? '[&>div]:bg-green-500' : '[&>div]:bg-blue-600'}`} />
             
             {isStarted && !isCompleted && (
                <p className="text-xs text-gray-400 pt-1">
                  Continue where you left off
                </p>
             )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
           {isStarted && !isCompleted ? (
             <>
               <Button 
                 variant="outline" 
                 className="flex-1 border-gray-300 hover:bg-gray-50 hover:text-blue-600"
                 onClick={handleViewChapters}
               >
                 <BookOpen className="h-4 w-4 mr-2" />
                 View Chapters
               </Button>
               <Button 
                 className="flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                 asChild
               >
                 <Link href={`/student/my-courses/${course.id}`}>
                   <Play className="h-4 w-4 mr-2" />
                   Resume
                 </Link>
               </Button>
             </>
           ) : (
             <>
               <Button 
                 variant="outline" 
                 className="flex-1 border-gray-300 hover:bg-gray-50 hover:text-blue-600"
                 onClick={handleViewChapters}
               >
                 <BookOpen className="h-4 w-4 mr-2" />
                 View Chapters
               </Button>
               <Button 
                 className="flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                 asChild
               >
                 <Link href={`/student/my-courses/${course.id}`}>
                   {isCompleted ? 'Review' : 'Start'}
                 </Link>
               </Button>
             </>
           )}
        </div>
      </div>
    </Card>
  )
}

