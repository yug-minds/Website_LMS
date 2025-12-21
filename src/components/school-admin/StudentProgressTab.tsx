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
  BarChart3
} from "lucide-react";
import { useSchoolAdminStudentProgress } from "../../hooks/useStudentProgress";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function StudentProgressTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");

  // Fetch student progress data
  const { 
    data: progressData, 
    isLoading, 
    error,
    refetch 
  } = useSchoolAdminStudentProgress({
    courseId: selectedCourse !== "all" ? selectedCourse : undefined,
    grade: selectedGrade !== "all" ? selectedGrade : undefined,
    teacherId: selectedTeacher !== "all" ? selectedTeacher : undefined
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
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
  const courses = progressData?.courses || [];
  const teachers = progressData?.teachers || [];
  const summary = progressData?.summary;

  // Filter students based on search term
  const filteredStudents = students.filter((student: any) =>
    student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get unique grades for filter
  const availableGrades = [...new Set(students.map((s: any) => s.grade))].sort();

  // Prepare chart data
  const gradeProgressData = availableGrades.map((grade: any) => {
    const gradeStudents = students.filter((s: any) => s.grade === grade);
    const avgProgress = gradeStudents.length > 0 
      ? Math.round(gradeStudents.reduce((sum: number, s: any) => sum + s.average_progress, 0) / gradeStudents.length)
      : 0;
    
    return {
      grade,
      students: gradeStudents.length,
      avgProgress,
      completed: gradeStudents.filter((s: any) => s.average_progress === 100).length
    };
  });

  const courseCompletionData = courses.map((course: any) => ({
    name: course.course_name,
    completion_rate: course.completion_rate,
    enrolled: course.enrolled_students,
    completed: course.completed_students
  }));

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

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_students || 0}</div>
            <p className="text-xs text-muted-foreground">
              In your school
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
            <CardTitle className="text-sm font-medium">School Average</CardTitle>
            <School className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.average_school_progress || 0}%</div>
            <p className="text-xs text-muted-foreground">
              Overall progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Progress by Grade
            </CardTitle>
            <CardDescription>Average progress and completion by grade level</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={gradeProgressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="grade" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgProgress" fill="#8884d8" name="Avg Progress %" />
                <Bar dataKey="completed" fill="#82ca9d" name="Completed Students" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Course Completion Rates
            </CardTitle>
            <CardDescription>Completion rates across all courses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={courseCompletionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.payload?.name || entry.name}: ${entry.payload?.completion_rate || entry.value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="completion_rate"
                >
                  {courseCompletionData.map((entry, index) => (
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
                  placeholder="Search students..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
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
            <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Teacher" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teachers</SelectItem>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.teacher_id} value={teacher.teacher_id}>
                    {teacher.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="students" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="students">Students</TabsTrigger>
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
                Detailed progress tracking for all students in your school
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredStudents.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">No students found</p>
                  <p className="text-sm text-gray-600 mt-2">
                    {searchTerm ? 'Try adjusting your search terms.' : 'No students are enrolled in your school yet.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredStudents.map((student) => (
                    <div key={student.student_id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">{student.full_name}</h3>
                            <Badge variant="outline">{student.grade}</Badge>
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
                                {student.courses.map((course) => (
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
              )}
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
                Performance metrics for all courses in your school
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {courses.map((course) => (
                  <div key={course.course_id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{course.course_name}</h3>
                        <p className="text-sm text-gray-600">Grade: {course.grade}</p>
                      </div>
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
                Progress overview by grade level
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {gradeProgressData.map((grade) => (
                  <div key={grade.grade} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">{grade.grade}</h3>
                      <Badge variant="outline" className="text-lg px-3 py-1">
                        {grade.avgProgress}% average
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div className="text-center">
                        <div className="text-lg font-bold">{grade.students}</div>
                        <div className="text-xs text-gray-500">Total Students</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-600">{grade.completed}</div>
                        <div className="text-xs text-gray-500">Completed Courses</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">{grade.avgProgress}%</div>
                        <div className="text-xs text-gray-500">Average Progress</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
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