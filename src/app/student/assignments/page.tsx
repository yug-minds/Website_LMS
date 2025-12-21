'use client'

import { useState, useMemo } from 'react'
import { useStudentAssignments } from '../../../hooks/useStudentData'
import { Card } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Upload,
  Eye,
  Calendar,
  BookOpen,
  Filter,
  Award
} from 'lucide-react'
import Link from 'next/link'

interface Assignment {
  id: string
  title: string
  description: string
  assignment_type: 'mcq' | 'essay' | 'project' | 'quiz'
  due_date: string
  max_marks: number
  course_title: string
  course_grade: string
  course_subject: string
  status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'overdue'
  submission?: {
    id: string
    grade: number
    feedback: string
    submitted_at: string
    status: string
  }
  is_overdue: boolean
  days_until_due: number
}

export default function AssignmentsPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted' | 'graded' | 'overdue'>('all')
  
  // Use the optimized hook instead of redundant queries
  const { data: assignmentsData = [], isLoading } = useStudentAssignments()

  // Transform hook data to match component's Assignment interface
  const assignments: Assignment[] = useMemo(() => {
    if (!Array.isArray(assignmentsData)) return []
    return (assignmentsData as unknown as any[]).map((assignment: any) => ({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      assignment_type: assignment.assignment_type,
      due_date: assignment.due_date,
      max_marks: assignment.max_marks,
      course_title: assignment.course_title || 'Unknown',
      course_grade: assignment.course_grade || 'Unknown',
      course_subject: assignment.course_subject || 'Unknown',
      status: assignment.status,
      submission: assignment.submission,
      is_overdue: assignment.is_overdue,
      days_until_due: assignment.days_until_due
    }))
  }, [assignmentsData])

  const loading = isLoading

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
      case 'graded': return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'submitted': return <Upload className="h-5 w-5 text-blue-500" />
      case 'in_progress': return <Clock className="h-5 w-5 text-yellow-500" />
      case 'overdue': return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'not_started': return <FileText className="h-5 w-5 text-gray-500" />
      default: return <FileText className="h-5 w-5 text-gray-500" />
    }
  }

  const getAssignmentTypeIcon = (type: string) => {
    switch (type) {
      case 'mcq': return '📝'
      case 'essay': return '✍️'
      case 'project': return '📁'
      case 'quiz': return '❓'
      default: return '📄'
    }
  }

  const filteredAssignments = assignments.filter((assignment: any) => {
    switch (filter) {
      case 'pending': return assignment.status === 'not_started' || assignment.status === 'in_progress'
      case 'submitted': return assignment.status === 'submitted'
      case 'graded': return assignment.status === 'graded'
      case 'overdue': return assignment.status === 'overdue'
      default: return true
    }
  })

  if (loading) {
    return (
      <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
        </div>
      </div>
    )
  }

  return (
      <div className="p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Assignments</h1>
            <p className="text-gray-600 mt-2">Track your assignments and submissions.</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/student/assignments/hierarchy">
              <BookOpen className="h-4 w-4 mr-2" />
              View by Course
            </Link>
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            {[
              { key: 'all', label: 'All', count: assignments.length },
              { key: 'pending', label: 'Pending', count: assignments.filter((a: any) => a.status === 'not_started' || a.status === 'in_progress').length },
              { key: 'submitted', label: 'Submitted', count: assignments.filter((a: any) => a.status === 'submitted').length },
              { key: 'graded', label: 'Graded', count: assignments.filter((a: any) => a.status === 'graded').length },
              { key: 'overdue', label: 'Overdue', count: assignments.filter((a: any) => a.status === 'overdue').length },
            ].map((tab) => (
              <button
                key={tab.key}
                 
                onClick={() => setFilter(tab.key as any)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        {/* Assignments List */}
        <div className="space-y-4">
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {filter === 'all' ? 'No assignments found' : `No ${filter} assignments`}
              </h3>
              <p className="text-gray-500">
                {filter === 'all' 
                  ? 'You don\'t have any assignments yet.' 
                  : `You don't have any ${filter} assignments.`
                }
              </p>
            </div>
          ) : (
            filteredAssignments.map((assignment) => (
              <Card key={assignment.id} className="p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <span className="text-2xl">{getAssignmentTypeIcon(assignment.assignment_type)}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{assignment.title}</h3>
                        <p className="text-sm text-gray-500">
                          {assignment.course_title} • {assignment.course_grade} • {assignment.course_subject}
                        </p>
                      </div>
                    </div>

                    <p className="text-gray-600 mb-4 line-clamp-2">{assignment.description}</p>

                    <div className="flex items-center space-x-6 text-sm text-gray-500">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2" />
                        Due: {new Date(assignment.due_date).toLocaleDateString()}
                      </div>
                      <div className="flex items-center">
                        <BookOpen className="h-4 w-4 mr-2" />
                        {assignment.max_marks} marks
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-2" />
                        {assignment.is_overdue 
                          ? `${Math.abs(assignment.days_until_due)} days overdue`
                          : assignment.days_until_due > 0 
                            ? `${assignment.days_until_due} days left`
                            : 'Due today'
                        }
                      </div>
                    </div>

                    {/* Submission Status */}
                    {assignment.submission && (
                      <div className={`mt-4 p-4 rounded-lg border ${
                        (assignment.status === 'graded' || assignment.submission.grade !== null) 
                          ? 'bg-green-50 border-green-200' 
                          : 'bg-blue-50 border-blue-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            {getStatusIcon(assignment.status === 'graded' || assignment.submission.grade !== null ? 'graded' : assignment.status)}
                            <div>
                              <span className={`text-sm font-semibold ${
                                (assignment.status === 'graded' || assignment.submission.grade !== null) ? 'text-green-900' : 'text-blue-900'
                              }`}>
                                {(assignment.status === 'graded' || assignment.submission.grade !== null) ? 'Graded' : 'Submitted'}
                              </span>
                              {assignment.submission.grade !== null && assignment.submission.grade !== undefined && (
                                <span className={`ml-3 text-base font-bold ${
                                  (assignment.status === 'graded' || assignment.submission.grade !== null) ? 'text-green-700' : 'text-blue-700'
                                }`}>
                                  Score: {typeof assignment.submission.grade === 'number' 
                                    ? assignment.submission.grade 
                                    : parseFloat(assignment.submission.grade)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-gray-600">
                            Submitted: {new Date(assignment.submission.submitted_at).toLocaleDateString()}
                          </span>
                        </div>
                        {assignment.submission.feedback && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-sm font-medium text-gray-700 mb-1">Feedback:</p>
                            <p className="text-sm text-gray-600">{assignment.submission.feedback}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end space-y-3 ml-6">
                    <Badge className={`${getStatusColor(
                      (assignment.status === 'graded' || (assignment.submission && assignment.submission.grade !== null && assignment.submission.grade !== undefined)) 
                        ? 'graded' 
                        : assignment.status
                    )} text-xs font-semibold px-3 py-1`}>
                      {((assignment.status === 'graded' || (assignment.submission && assignment.submission.grade !== null && assignment.submission.grade !== undefined))) && (
                        <Award className="h-3 w-3 mr-1 inline" />
                      )}
                      {((assignment.status === 'graded' || (assignment.submission && assignment.submission.grade !== null && assignment.submission.grade !== undefined)) 
                        ? 'GRADED' 
                        : assignment.status.replace('_', ' ').toUpperCase())}
                    </Badge>

                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link href={
                          (assignment.status === 'submitted' || assignment.status === 'graded' || 
                           (assignment.submission && assignment.submission.grade !== null && assignment.submission.grade !== undefined))
                            ? `/student/assignments/${assignment.id}/view`
                            : `/student/assignments/${assignment.id}`
                        }>
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Link>
                      </Button>
                      
                      {(assignment.status === 'not_started' || assignment.status === 'in_progress') && 
                       !(assignment.submission && assignment.submission.grade !== null && assignment.submission.grade !== undefined) && (
                        <Button
                          size="sm"
                          asChild
                        >
                          <Link href={`/student/assignments/${assignment.id}?action=submit`}>
                            <Upload className="h-4 w-4 mr-2" />
                            {assignment.status === 'not_started' ? 'Start' : 'Continue'}
                          </Link>
                        </Button>
                      )}
                      {((assignment.status === 'submitted' || assignment.status === 'graded') || 
                        (assignment.submission && assignment.submission.grade !== null && assignment.submission.grade !== undefined)) && (
                        <div className="text-xs text-gray-500 text-right">
                          <p className="font-medium">Already Submitted</p>
                          <p className="text-gray-400">View only</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
  )
}
