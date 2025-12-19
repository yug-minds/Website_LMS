'use client'

import { useState, useMemo } from 'react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { 
  ChevronDown, 
  ChevronRight, 
  BookOpen, 
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Upload,
  Eye,
  Calendar
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '../../../lib/utils'

interface Assignment {
  id: string
  title: string
  description: string
  assignment_type: string
  due_date: string | null
  max_score: number
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'overdue'
  submission?: {
    id: string
    grade: number | null
    feedback: string | null
    submitted_at: string
    status: string
  }
  is_overdue: boolean
  days_until_due: number
}

interface Chapter {
  id: string
  course_id: string
  title: string
  name: string
  order_index: number | null
  order_number: number | null
  assignments: Assignment[]
}

interface Course {
  id: string
  title: string
  grade: string
  subject: string
  description: string | null
  chapters: Chapter[]
}

interface AssignmentHierarchyProps {
  courses: Course[]
  searchQuery?: string
  filterStatus?: 'all' | 'pending' | 'submitted' | 'graded' | 'overdue'
}

export default function AssignmentHierarchy({ 
  courses, 
  searchQuery = '', 
  filterStatus = 'all' 
}: AssignmentHierarchyProps) {
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())

  const toggleCourse = (courseId: string) => {
    const newExpanded = new Set(expandedCourses)
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId)
    } else {
      newExpanded.add(courseId)
    }
    setExpandedCourses(newExpanded)
  }

  const toggleChapter = (chapterId: string) => {
    const newExpanded = new Set(expandedChapters)
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId)
    } else {
      newExpanded.add(chapterId)
    }
    setExpandedChapters(newExpanded)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'graded': return 'bg-green-100 text-green-800'
      case 'submitted': return 'bg-blue-100 text-blue-800'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800'
      case 'overdue': return 'bg-red-100 text-red-800'
      case 'not_started': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'graded': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'submitted': return <Upload className="h-4 w-4 text-blue-500" />
      case 'in_progress': return <Clock className="h-4 w-4 text-yellow-500" />
      case 'overdue': return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'not_started': return <FileText className="h-4 w-4 text-gray-500" />
      default: return <FileText className="h-4 w-4 text-gray-500" />
    }
  }

  const filteredCourses = useMemo(() => {
    if (!searchQuery && filterStatus === 'all') return courses

    return courses.map((course: any) => {
      const filteredChapters = course.chapters.map((chapter: any) => {
        const filteredAssignments = chapter.assignments.filter((assignment: any) => {
          // Search filter
          const matchesSearch = !searchQuery || 
            assignment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            assignment.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chapter.title.toLowerCase().includes(searchQuery.toLowerCase())

          // Status filter
          const matchesStatus = filterStatus === 'all' ||
            (filterStatus === 'pending' && (assignment.status === 'not_started' || assignment.status === 'in_progress')) ||
            (filterStatus === 'submitted' && assignment.status === 'submitted') ||
            (filterStatus === 'graded' && assignment.status === 'graded') ||
            (filterStatus === 'overdue' && assignment.status === 'overdue')

          return matchesSearch && matchesStatus
        })

        return { ...chapter, assignments: filteredAssignments }
      }).filter((chapter: any) => chapter.assignments.length > 0)

      return { ...course, chapters: filteredChapters }
    }).filter((course: any) => course.chapters.length > 0)
  }, [courses, searchQuery, filterStatus])

  if (filteredCourses.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments found</h3>
        <p className="text-gray-500">
          {searchQuery || filterStatus !== 'all' 
            ? 'Try adjusting your search or filter criteria.'
            : 'You don\'t have any assignments yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {filteredCourses.map((course: any) => {
        const isCourseExpanded = expandedCourses.has(course.id)
        const totalAssignments = course.chapters.reduce((sum: number, ch: any) => sum + ch.assignments.length, 0)

        return (
          <Card key={course.id} className="overflow-hidden">
            <button
              onClick={() => toggleCourse(course.id)}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              aria-expanded={isCourseExpanded}
              aria-label={`${isCourseExpanded ? 'Collapse' : 'Expand'} ${course.title}`}
            >
              <div className="flex items-center space-x-3 flex-1 text-left">
                {isCourseExpanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-500" />
                )}
                <BookOpen className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">{course.title}</h3>
                  <p className="text-sm text-gray-500">
                    {course.grade} • {course.subject} • {totalAssignments} assignment{totalAssignments !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </button>

            {isCourseExpanded && (
              <div className="border-t border-gray-200">
                {course.chapters.map((chapter: any) => {
                  const isChapterExpanded = expandedChapters.has(chapter.id)
                  const hasAssignments = chapter.assignments.length > 0

                  if (!hasAssignments) return null

                  return (
                    <div key={chapter.id} className="border-b border-gray-100 last:border-b-0">
                      <button
                        onClick={() => toggleChapter(chapter.id)}
                        className="w-full p-3 pl-8 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        aria-expanded={isChapterExpanded}
                        aria-label={`${isChapterExpanded ? 'Collapse' : 'Expand'} ${chapter.title}`}
                      >
                        <div className="flex items-center space-x-3 flex-1 text-left">
                          {isChapterExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          <FileText className="h-4 w-4 text-gray-500" />
                          <div>
                            <h4 className="font-medium text-gray-700">{chapter.title}</h4>
                            <p className="text-xs text-gray-500">
                              {chapter.assignments.length} assignment{chapter.assignments.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </button>

                      {isChapterExpanded && (
                        <div className="pl-12 pr-4 pb-3 space-y-2">
                          {chapter.assignments.map((assignment: any) => (
                            <Card 
                              key={assignment.id} 
                              className="p-3 hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-2">
                                    {getStatusIcon(assignment.status)}
                                    <h5 className="font-medium text-gray-900">{assignment.title}</h5>
                                    <Badge className={cn("text-xs", getStatusColor(assignment.status))}>
                                      {assignment.status.replace('_', ' ')}
                                    </Badge>
                                  </div>
                                  
                                  {assignment.description && (
                                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                                      {assignment.description}
                                    </p>
                                  )}

                                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                                    {assignment.due_date && (
                                      <div className="flex items-center">
                                        <Calendar className="h-3 w-3 mr-1" />
                                        Due: {new Date(assignment.due_date).toLocaleDateString()}
                                      </div>
                                    )}
                                    <div className="flex items-center">
                                      <FileText className="h-3 w-3 mr-1" />
                                      {assignment.max_score} points
                                    </div>
                                    {assignment.is_overdue && (
                                      <div className="flex items-center text-red-600">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        {Math.abs(assignment.days_until_due)} days overdue
                                      </div>
                                    )}
                                  </div>

                                  {assignment.submission && (
                                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium text-gray-700">
                                          {assignment.status === 'graded' ? 'Graded' : 'Submitted'}
                                        </span>
                                        {assignment.submission.grade !== null && (
                                          <span className="text-gray-600">
                                            Grade: {assignment.submission.grade}%
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="ml-4 flex space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                  >
                                    <Link href={`/student/assignments/${assignment.id}`}>
                                      <Eye className="h-3 w-3 mr-1" />
                                      View
                                    </Link>
                                  </Button>
                                  {(assignment.status === 'not_started' || assignment.status === 'in_progress') && (
                                    <Button
                                      size="sm"
                                      asChild
                                    >
                                      <Link href={`/student/assignments/${assignment.id}?action=submit`}>
                                        {assignment.status === 'not_started' ? 'Start' : 'Continue'}
                                      </Link>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}


















