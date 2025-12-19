"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Users, 
  BookOpen, 
  TrendingUp, 
  Clock,
  Search,
  Filter,
  Eye,
  CheckCircle,
  AlertCircle,
  PlayCircle,
  School,
  GraduationCap,
  BarChart3,
  Globe,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useAdminStudentProgress } from "../../hooks/useStudentProgress";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function AdminStudentProgressTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSchool, setSelectedSchool] = useState<string>("all");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize] = useState(50);

  // Fetch student progress data
  const { 
    data: progressData, 
    isLoading, 
    error,
    refetch 
  } = useAdminStudentProgress({
    schoolId: selectedSchool !== "all" ? selectedSchool : undefined,
    courseId: selectedCourse !== "all" ? selectedCourse : undefined,
    grade: selectedGrade !== "all" ? selectedGrade : undefined,
    limit: pageSize,
    offset: currentPage * pageSize
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <p className="text-lg font-medium text-red-600">Error loading student progress</p>
            <p className="text-sm text-gray-600 mt-2">{error.message}</p>
            <Button onClick={() => refetch()} className="mt-4">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const students = progressData?.students || [];
  const schools = progressData?.schools || [];
  const courses = progressData?.courses || [];
  const summary = progressData?.summary;
  const pagination = progressData?.pagination;

  // Filter students based on search term
  const filteredStudents = students.filter((student: any) =>
    student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.school_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get unique grades for filter
  const availableGrades = [...new Set(students.map((s: any) => s.grade))].sort();

  // Prepare chart data
  const schoolProgressData = schools.map((school: any) => ({
    name: school.school_name,
    students: school.total_students,
    avgProgress: school.average_progress
  }));

  const courseCompletionData = courses.slice(0, 10).map((course: any) => ({
    name: course.course_name.length > 20 ? course.course_name.substring(0, 20) + '...' : course.course_name,
    completion_rate: course.completion_rate,
    enrolled: course.enrolled_students,
    completed: course.completed_students
  }));

  const gradeDistributionData = availableGrades.map((grade: any) => {
    const gradeStudents = students.filter((s: any) => s.grade === grade);
    return {
      grade,
      students: gradeStudents.length,
      avgProgress: gradeStudents.length > 0 
        ? Math.round(gradeStudents.reduce((sum: number, s: any) => sum + s.average_progress, 0) / gradeStudents.length)
        : 0
    };
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <PlayCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const totalPages = pagination ? Math.ceil(pagination.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_students || 0}</div>
            <p className="text-xs text-muted-foreground">
              Across all schools
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Students</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.students_with_progress || 0}</div>
            <p className="text-xs text-muted-foreground">
              Students with progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.students_completed || 0}</div>
            <p className="text-xs text-muted-foreground">
              Students completed courses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Average</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.average_system_progress || 0}%</div>
            <p className="text-xs text-muted-foreground">
              Overall progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_schools || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active schools
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_courses || 0}</div>
            <p className="text-xs text-muted-foreground">
              Available courses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="h-5 w-5" />
              School Performance
            </CardTitle>
            <CardDescription>Average progress by school</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={schoolProgressData.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  fontSize={12}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgProgress" fill="#8884d8" name="Avg Progress %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Course Completion
            </CardTitle>
            <CardDescription>Top performing courses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={courseCompletionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  fontSize={12}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="completion_rate" fill="#82ca9d" name="Completion Rate %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Grade Distribution
            </CardTitle>
            <CardDescription>Students by grade level</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={gradeDistributionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.grade}: ${entry.students}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="students"
                >
                  {gradeDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search students or schools..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedSchool} onValueChange={setSelectedSchool}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="School" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schools</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.school_id} value={school.school_id}>
                    {school.school_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedGrade} onValueChange={setSelectedGrade}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grades</SelectItem>
                {availableGrades.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCourse} onValueChange={setSelectedCourse}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {courses.map((course) => (
                  <SelectItem key={course.course_id} value={course.course_id}>
                    {course.course_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="students" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="schools">Schools</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
        </TabsList>

        {/* Students Tab */}
        <TabsContent value="students" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Student Progress
              </CardTitle>
              <CardDescription>
                System-wide student progress tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredStudents.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">No students found</p>
                  <p className="text-sm text-gray-600 mt-2">
                    {searchTerm ? 'Try adjusting your search terms.' : 'No students are enrolled in the system yet.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {filteredStudents.map((student) => (
                      <div key={student.student_id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold">{student.full_name}</h3>
                              <Badge variant="outline">{student.grade}</Badge>
                              <Badge variant="secondary">{student.school_name}</Badge>
                              <Badge className={getStatusColor(
                                student.average_progress === 100 ? 'completed' :
                                student.average_progress > 0 ? 'in_progress' : 'not_started'
                              )}>
                                {student.average_progress === 100 ? 'Completed' :
                                 student.average_progress > 0 ? 'In Progress' : 'Not Started'}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-3">{student.email}</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                              <div className="text-center">
                                <div className="text-lg font-bold">{student.total_courses}</div>
                                <div className="text-xs text-gray-500">Total Courses</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-bold text-green-600">{student.completed_courses}</div>
                                <div className="text-xs text-gray-500">Completed</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-bold text-blue-600">{student.in_progress_courses}</div>
                                <div className="text-xs text-gray-500">In Progress</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-bold">{student.average_progress}%</div>
                                <div className="text-xs text-gray-500">Avg Progress</div>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${student.average_progress}%` }}
                              ></div>
                            </div>

                            {/* Course Details */}
                            {student.courses.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-gray-700">Course Progress:</h4>
                                <div className="grid gap-2">
                                  {student.courses.slice(0, 3).map((course) => (
                                    <div key={course.course_id} className="flex items-center justify-between bg-gray-50 rounded p-2">
                                      <div className="flex items-center gap-2">
                                        {getStatusIcon(course.status)}
                                        <span className="text-sm font-medium">{course.course_name}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-600">
                                          {course.completed_chapters}/{course.total_chapters} chapters
                                        </span>
                                        <Badge variant="outline" className="text-xs">
                                          {course.progress_percentage}%
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                  {student.courses.length > 3 && (
                                    <p className="text-xs text-gray-500 text-center">
                                      +{student.courses.length - 3} more courses
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {student.last_activity && (
                              <p className="text-xs text-gray-500 mt-2">
                                Last activity: {new Date(student.last_activity).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {pagination && totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6">
                      <div className="text-sm text-gray-600">
                        Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, pagination.total)} of {pagination.total} students
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <span className="text-sm">
                          Page {currentPage + 1} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={!pagination.hasMore}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schools Tab */}
        <TabsContent value="schools" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <School className="h-5 w-5" />
                School Performance
              </CardTitle>
              <CardDescription>
                Progress analytics by school
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {schools.map((school) => (
                  <div key={school.school_id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{school.school_name}</h3>
                      <Badge variant="outline" className="text-lg px-3 py-1">
                        {school.average_progress}% average
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="text-center">
                        <div className="text-lg font-bold">{school.total_students}</div>
                        <div className="text-xs text-gray-500">Total Students</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">{school.average_progress}%</div>
                        <div className="text-xs text-gray-500">Average Progress</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${school.average_progress}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Courses Tab */}
        <TabsContent value="courses" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Course Analytics
              </CardTitle>
              <CardDescription>
                System-wide course performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {courses.map((course) => (
                  <div key={course.course_id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{course.course_name}</h3>
                      <Badge variant="outline" className="text-lg px-3 py-1">
                        {course.completion_rate}% completion
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div className="text-center">
                        <div className="text-lg font-bold">{course.total_chapters}</div>
                        <div className="text-xs text-gray-500">Total Chapters</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">{course.enrolled_students}</div>
                        <div className="text-xs text-gray-500">Enrolled Students</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-600">{course.completed_students}</div>
                        <div className="text-xs text-gray-500">Completed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">{course.average_progress}%</div>
                        <div className="text-xs text-gray-500">Avg Progress</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${course.completion_rate}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Grades Tab */}
        <TabsContent value="grades" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Grade Level Analytics
              </CardTitle>
              <CardDescription>
                System-wide progress by grade level
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {gradeDistributionData.map((grade) => (
                  <div key={grade.grade} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{grade.grade}</h3>
                      <Badge variant="outline" className="text-lg px-3 py-1">
                        {grade.avgProgress}% average
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="text-center">
                        <div className="text-lg font-bold">{grade.students}</div>
                        <div className="text-xs text-gray-500">Total Students</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">{grade.avgProgress}%</div>
                        <div className="text-xs text-gray-500">Average Progress</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${grade.avgProgress}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}