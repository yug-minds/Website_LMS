'use client'

import { useStudentCourses } from '../../../hooks/useStudentData'
import CourseCard from '../../../components/student/CourseCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select'
import { 
  BookOpen, 
  Search,
  Filter,
  Play,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useMemo, useEffect } from 'react'
import ErrorBoundary from '../../../components/student/course-player/ErrorBoundary'

export default function MyCoursesPage() {
  const router = useRouter()
  const { data: coursesData, isLoading: coursesLoading, error: coursesError } = useStudentCourses()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortOption, setSortOption] = useState<string>('newest')
  const [mounted, setMounted] = useState(false)

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    // Use a timeout to avoid setState in effect
    const timer = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(timer)
  }, [])

  const courses = useMemo(() => {
    return (coursesData || []).map((course: any) => ({
      id: course.id,
      name: course.name || course.title || '',
      title: course.title || course.name || '',
      description: course.description || '',
      grade: course.grade || '',
      subject: course.subject || '',
      thumbnail_url: course.thumbnail_url,
      progress_percentage: course.progress_percentage || 0,
      last_accessed: course.last_accessed || new Date().toISOString(),
      total_chapters: course.total_chapters || 0,
      completed_chapters: course.completed_chapters || 0,
      total_assignments: course.total_assignments || 0,
      completed_assignments: course.completed_assignments || 0,
      average_grade: course.average_grade || 0,
      status: course.status || 'active',
    }))
  }, [coursesData])

  const filteredAndSortedCourses = useMemo(() => {
    let filtered: any[] = courses

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((course: any) =>
        course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter((course: any) => course.status === filterStatus)
    }

    // Sort
    if (sortOption === 'newest') {
      filtered = filtered.sort((a: any, b: any) => 
        new Date(b.last_accessed).getTime() - new Date(a.last_accessed).getTime()
      )
    } else if (sortOption === 'alphabetical') {
      filtered = filtered.sort((a: any, b: any) => a.name.localeCompare(b.name))
    } else if (sortOption === 'progress') {
      filtered = filtered.sort((a: any, b: any) => b.progress_percentage - a.progress_percentage)
    }

    return filtered
  }, [courses, searchQuery, filterStatus, sortOption])

  // Show loading until mounted
  if (!mounted) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  // Handle error state
  if (coursesError) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-semibold mb-2">Error Loading Courses</h2>
            <p className="text-gray-600 mb-4">
              {coursesError instanceof Error ? coursesError.message : 'Failed to load courses'}
            </p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Retry
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Header / Welcome Section */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-8 mb-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <BookOpen className="h-48 w-48 text-white transform rotate-12 translate-x-12 -translate-y-12" />
                </div>
                <div className="relative z-10 w-full sm:w-2/3">
                    <h1 className="text-3xl font-bold mb-2">Welcome Back!</h1>
                    <p className="text-blue-100 text-lg mb-6 max-w-xl">
                        Ready to continue learning? You have {filteredAndSortedCourses.filter((c: any) => c.status === 'active' || c.status === 'completed').length} courses available.
                    </p>
                    
                     <div className="flex gap-4">
                         {filteredAndSortedCourses.some((c: any) => c.status === 'active') && (
                            <Button variant="secondary" className="bg-white text-blue-800 hover:bg-blue-50">
                                <Play className="h-4 w-4 mr-2" /> Resume Learning
                            </Button>
                         )}
                    </div>
                </div>
            </div>

            {/* Main Content Area with Tabs */}
            <div className="space-y-6">
                 {/* Custom Tabs */}
                 <div className="flex border-b border-gray-200">
                    <button 
                        className={`pb-4 px-4 font-medium text-sm transition-colors relative ${filterStatus === 'all' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        onClick={() => setFilterStatus('all')}
                    >
                        All Courses
                        {filterStatus === 'all' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />}
                    </button>
                    <button 
                         className={`pb-4 px-4 font-medium text-sm transition-colors relative ${filterStatus === 'active' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                         onClick={() => setFilterStatus('active')}
                    >
                        In Progress
                        {filterStatus === 'active' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />}
                    </button>
                    <button 
                         className={`pb-4 px-4 font-medium text-sm transition-colors relative ${filterStatus === 'completed' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                         onClick={() => setFilterStatus('completed')}
                    >
                        Completed
                         {filterStatus === 'completed' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />}
                    </button>
                 </div>

                 {/* Check and Search Bar */}
                 <div className="flex justify-between items-center py-2">
                     <h2 className="text-xl font-semibold text-gray-800">
                         {filterStatus === 'all' ? 'Your Learning Journey' : 
                          filterStatus === 'active' ? 'Continue Learning' : 'Achievements'}
                     </h2>
                     
                     <div className="relative w-64">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search courses..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-white"
                          />
                    </div>
                 </div>

                {/* Courses Grid */}
                {coursesLoading ? (
                <div className="text-center py-24">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading your courses...</p>
                </div>
                ) : filteredAndSortedCourses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAndSortedCourses.map((course) => (
                    <div key={course.id} className="transform hover:-translate-y-1 transition-transform duration-300">
                        <CourseCard
                        course={course}
                        onViewChapters={(c) => {
                            // Navigate to course detail page which shows course overview with all chapters
                            router.push(`/student/my-courses/${c.id}`)
                        }}
                        />
                    </div>
                    ))}
                </div>
                ) : (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                    <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookOpen className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchQuery || filterStatus !== 'all'
                        ? 'No courses found'
                        : 'Start your learning journey'}
                    </h3>
                    <p className="text-gray-500 max-w-sm mx-auto">
                    {searchQuery || filterStatus !== 'all'
                        ? 'Try adjusting your search or filters to find what you are looking for.'
                        : 'You are not enrolled in any courses yet. Check your schedule or contact your administrator.'}
                    </p>
                    {filterStatus !== 'all' && (
                        <Button variant="link" onClick={() => setFilterStatus('all')} className="mt-2 text-blue-600">
                            View all courses
                        </Button>
                    )}
                </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

