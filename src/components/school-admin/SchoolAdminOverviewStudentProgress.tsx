"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Users, 
  BookOpen, 
  TrendingUp, 
  CheckCircle,
  AlertCircle,
  PlayCircle,
  School,
  GraduationCap,
  BarChart3,
  ArrowRight
} from "lucide-react";
import { useSchoolAdminStudentProgress, type CourseProgress } from "../../hooks/useStudentProgress";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

interface _Course {
  course_name?: string;
  completion_rate?: number;
  enrolled_students?: number;
  [key: string]: unknown;
}

interface _Student {
  id?: string;
  student_id?: string;
  full_name?: string;
  grade?: string;
  average_progress?: number;
  total_courses?: number;
  completed_courses?: number;
  in_progress_courses?: number;
  courses?: Array<{
    course_id?: string;
    course_name?: string;
    progress_percentage?: number;
    status?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface CourseCompletionEntry {
  name: string;
  completion_rate: number;
  enrolled: number;
  [key: string]: unknown;
}

interface _PieChartEntry {
  name: string;
  completion_rate: number;
  [key: string]: unknown;
}

export default function SchoolAdminOverviewStudentProgress() {
  const router = useRouter();
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");

  // Fetch student progress data
  const { 
    data: progressData, 
    isLoading, 
    error
  } = useSchoolAdminStudentProgress({
    courseId: selectedCourse !== "all" ? selectedCourse : undefined,
    grade: selectedGrade !== "all" ? selectedGrade : undefined
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-6 bg-gray-200 rounded w-1/2"></div>
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Student Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-6">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
            <p className="text-sm font-medium text-red-600">Error loading student progress</p>
            <p className="text-xs text-gray-600 mt-1">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const students = progressData?.students || [];
  const coursesRaw = progressData?.courses || [];
  const summary = progressData?.summary;

  // Deduplicate courses by course_id (same course can appear for different grades)
  type CourseFromAPI = { course_id?: string; course_name?: string; completion_rate?: number; enrolled_students?: number };
  const coursesMap = new Map<string, CourseFromAPI>();
  coursesRaw.forEach((course: CourseFromAPI) => {
    const id = course.course_id ?? '';
    if (id && !coursesMap.has(id)) {
      coursesMap.set(id, course);
    }
  });
  const courses = Array.from(coursesMap.values());

  // Get unique grades for filter
  const availableGrades = [...new Set(students.map((s) => s.grade).filter((g): g is string => typeof g === 'string'))].sort();

  // Filter students based on selected filters
  const filteredStudents = students.filter((student) => {
    const matchesGrade = selectedGrade === "all" || student.grade === selectedGrade;
    const matchesCourse = selectedCourse === "all" || 
      (student.courses ?? []).some((c) => c.course_id === selectedCourse);
    return matchesGrade && matchesCourse;
  });

  // Get top 8 students by progress
  const topStudents = [...filteredStudents]
    .sort((a, b) => (b.average_progress ?? 0) - (a.average_progress ?? 0))
    .slice(0, 8);

  // Prepare chart data
  const gradeProgressData = availableGrades.map((grade: string) => {
    const gradeStudents = filteredStudents.filter((s) => s.grade === grade);
    const avgProgress = gradeStudents.length > 0 
      ? Math.round(gradeStudents.reduce((sum: number, s) => sum + (s.average_progress ?? 0), 0) / gradeStudents.length)
      : 0;
    
    return {
      grade,
      avgProgress,
      students: gradeStudents.length
    };
  });

  const courseCompletionData: CourseCompletionEntry[] = courses.slice(0, 5).map((course): CourseCompletionEntry => {
    const name = course.course_name ?? '';
    return {
      name: name.length > 15 ? name.substring(0, 15) + '...' : name,
      completion_rate: course.completion_rate ?? 0,
      enrolled: course.enrolled_students ?? 0
    };
  });

  const _gradeDistributionData = availableGrades.map((grade: string) => {
    const gradeStudents = filteredStudents.filter((s) => s.grade === grade);
    return {
      name: grade,
      value: gradeStudents.length
    };
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'in_progress':
        return <PlayCircle className="h-3 w-3 text-blue-500" />;
      default:
        return <AlertCircle className="h-3 w-3 text-gray-400" />;
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Student Progress
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
        </CardTitle>
        <CardDescription>Track student performance and course completion for your school</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Header with Quick Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-lg font-semibold">Student Performance Overview</h3>
            <p className="text-sm text-gray-600">Filter and analyze student progress</p>
          </div>
          <div className="flex gap-2">
          <Select value={selectedGrade} onValueChange={setSelectedGrade}>
            <SelectTrigger className="w-[140px]">
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
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((course) => {
                const cid = course.course_id ?? '';
                const cname = course.course_name ?? '';
                return (
                  <SelectItem key={cid} value={cid}>
                    {cname.length > 25 ? cname.substring(0, 25) + '...' : cname}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Progress by Grade
            </CardTitle>
            <CardDescription className="text-xs">Average progress by grade level</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={gradeProgressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="grade" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="avgProgress" fill="#8884d8" name="Avg Progress %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4" />
              Course Completion
            </CardTitle>
            <CardDescription className="text-xs">Top performing courses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={courseCompletionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(props) => {
                    const entry = courseCompletionData[props.index];
                    return entry ? `${entry.name}: ${entry.completion_rate}%` : '';
                  }}
                  outerRadius={70}
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

      {/* Top Students Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Top Performing Students
              </CardTitle>
              <CardDescription className="text-xs">
                Students with highest progress rates
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/school-admin/reports?tab=student-progress')}
              className="text-xs"
            >
              View Full Report
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {topStudents.length === 0 ? (
            <div className="text-center py-6">
              <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm font-medium text-gray-600">No students found</p>
              <p className="text-xs text-gray-500 mt-1">
                {selectedGrade !== "all" || selectedCourse !== "all" 
                  ? 'Try adjusting your filters.' 
                  : 'No students are enrolled yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {topStudents.map((student) => (
                <div key={student.student_id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{student.full_name ?? ''}</h4>
                      <Badge variant="outline" className="text-xs">{student.grade ?? ''}</Badge>
                      <Badge className={`text-xs ${getStatusColor(
                        (student.average_progress ?? 0) === 100 ? 'completed' :
                        (student.average_progress ?? 0) > 0 ? 'in_progress' : 'not_started'
                      )}`}>
                        {(student.average_progress ?? 0) === 100 ? 'Completed' :
                         (student.average_progress ?? 0) > 0 ? 'In Progress' : 'Not Started'}
                      </Badge>
                    </div>
                    <div className="text-sm font-semibold">{student.average_progress ?? 0}%</div>
                  </div>
                  
                  <div className="flex items-center gap-4 mb-2 text-xs text-gray-600">
                    <span>{student.total_courses ?? 0} courses</span>
                    <span className="text-green-600">{student.completed_courses ?? 0} completed</span>
                    <span className="text-blue-600">{student.in_progress_courses ?? 0} in progress</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${student.average_progress ?? 0}%` }}
                    ></div>
                  </div>

                  {/* Course Preview */}
                  {(student.courses ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(student.courses ?? []).slice(0, 3).map((course: CourseProgress) => (
                        <div key={course.course_id} className="flex items-center gap-1 text-xs">
                          {getStatusIcon(course.status ?? '')}
                          <span className="text-gray-600 truncate max-w-[120px]">
                            {course.course_name}
                          </span>
                          <span className="text-gray-400">({course.progress_percentage}%)</span>
                        </div>
                      ))}
                      {(student.courses ?? []).length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{(student.courses ?? []).length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </CardContent>
    </Card>
  );
}

