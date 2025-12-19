"use client";

import { useTeacherSchool } from "../context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Label } from "../../../components/ui/label";
import { useTeacherClasses, useTeacherSchedules } from "../../../hooks/useTeacherData";
import { BookOpen, Users, Calendar, FileText, CheckCircle, AlertCircle, Filter, X, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { frontendLogger } from "../../../lib/frontend-logger";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";

/**
 * My Classes Page
 * 
 * Displays all classes assigned to the teacher
 */
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ClassesPage() {
  const { selectedSchool, schools } = useTeacherSchool();
  const queryClient = useQueryClient();
  const { data: classes, isLoading: classesLoading, error: classesError, refetch: refetchClasses } = useTeacherClasses(selectedSchool?.id);
  const { data: schedules, isLoading: schedulesLoading, error: schedulesError, refetch: refetchSchedules } = useTeacherSchedules(selectedSchool?.id);

  // Filter state
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate and refetch both queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher', 'schedules', selectedSchool?.id] }),
        queryClient.invalidateQueries({ queryKey: ['teacher', 'classes', selectedSchool?.id] }),
        refetchSchedules(),
        refetchClasses()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Use smart refresh hook instead of manual event listeners
  useSmartRefresh({
    queryKeys: [
      ['teacher', 'schedules', selectedSchool?.id],
      ['teacher', 'classes', selectedSchool?.id]
    ],
    minRefreshInterval: 60000, // 1 minute minimum between refreshes
  });

  // Debug logging
  useEffect(() => {
    frontendLogger.debug('Classes Page Debug', {
      component: 'ClassesPage',
      selectedSchool: selectedSchool?.id,
      classesCount: classes?.length || 0,
      schedulesCount: schedules?.length || 0,
      classesLoading,
      schedulesLoading,
      hasClassesError: !!classesError,
      hasSchedulesError: !!schedulesError,
    });
    if (classes && classes.length > 0) {
      frontendLogger.debug('Classes data loaded', {
        component: 'ClassesPage',
        count: classes.length,
      });
    }
    if (schedules && schedules.length > 0) {
      const schedulesByDay = {
         
        Sunday: schedules.filter((s: any) => s.day_of_week === 'Sunday').length,
         
        Monday: schedules.filter((s: any) => s.day_of_week === 'Monday').length,
         
        Tuesday: schedules.filter((s: any) => s.day_of_week === 'Tuesday').length,
         
        Wednesday: schedules.filter((s: any) => s.day_of_week === 'Wednesday').length,
         
        Thursday: schedules.filter((s: any) => s.day_of_week === 'Thursday').length,
         
        Friday: schedules.filter((s: any) => s.day_of_week === 'Friday').length,
         
        Saturday: schedules.filter((s: any) => s.day_of_week === 'Saturday').length,
      };
      frontendLogger.debug('Schedules data loaded', {
        component: 'ClassesPage',
        totalSchedules: schedules.length,
        schedulesByDay,
      });
    }
  }, [selectedSchool, classes, schedules, classesLoading, schedulesLoading, classesError, schedulesError]);

  // Extract unique grades from schedules and classes
  const availableGrades = useMemo(() => {
    const gradeSet = new Set<string>();
    if (schedules) {
       
      schedules.forEach((s: any) => {
        if (s.grade) gradeSet.add(s.grade);
      });
    }
    if (classes) {
       
      classes.forEach((c: any) => {
        if (c.grade) gradeSet.add(c.grade);
      });
    }
    return Array.from(gradeSet).sort();
  }, [schedules, classes]);

  // Filter schedules based on selected filters
  const filteredSchedules = useMemo(() => {
    if (!schedules) {
      console.log('⚠️ No schedules available for filtering');
      return [];
    }
    
    console.log('🔍 Filtering schedules:', {
      total: schedules.length,
      selectedDay,
      selectedGrade,
      selectedSchoolFilter
    });
    
    let filtered = [...schedules];

    if (selectedDay !== 'all') {
       
      filtered = filtered.filter((s: any) => s.day_of_week === selectedDay);
      console.log(`📅 Filtered by day "${selectedDay}": ${filtered.length} schedules`);
    }

    if (selectedGrade !== 'all') {
       
      filtered = filtered.filter((s: any) => s.grade === selectedGrade);
      console.log(`📅 Filtered by grade "${selectedGrade}": ${filtered.length} schedules`);
    }

    if (selectedSchoolFilter !== 'all') {
       
      filtered = filtered.filter((s: any) => s.school_id === selectedSchoolFilter);
      console.log(`📅 Filtered by school "${selectedSchoolFilter}": ${filtered.length} schedules`);
    }

    console.log(`✅ Final filtered schedules: ${filtered.length} out of ${schedules.length}`);
    return filtered;
  }, [schedules, selectedDay, selectedGrade, selectedSchoolFilter]);

  // Filter classes based on selected filters
  const filteredClasses = useMemo(() => {
    if (!classes) return [];
    let filtered = [...classes];

    if (selectedGrade !== 'all') {
       
      filtered = filtered.filter((c: any) => c.grade === selectedGrade);
    }

    if (selectedSchoolFilter !== 'all') {
       
      filtered = filtered.filter((c: any) => c.school_id === selectedSchoolFilter);
    }

    return filtered;
  }, [classes, selectedGrade, selectedSchoolFilter]);

  // Check if any filters are active
  const hasActiveFilters = selectedDay !== 'all' || selectedGrade !== 'all' || selectedSchoolFilter !== 'all';

  // Clear all filters
  const clearFilters = () => {
    setSelectedDay('all');
    setSelectedGrade('all');
    setSelectedSchoolFilter('all');
  };

  if (!selectedSchool) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-8">
              <p className="text-lg font-medium">No school selected</p>
              <p className="text-sm text-gray-600 mt-2">
                Please select a school from the dropdown to view your classes.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Classes</h1>
          <p className="text-gray-600 mt-2">
            All classes assigned to you at {selectedSchool.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Link href="/teacher/reports">
            <Button className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Submit Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Error State */}
      {(classesError || schedulesError) && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-8">
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-600" />
              <p className="text-lg font-medium text-red-600">Error loading classes</p>
              <p className="text-sm text-gray-600 mt-2">
                {classesError && (classesError instanceof Error ? classesError.message : 'Failed to load classes.')}
                {schedulesError && (schedulesError instanceof Error ? schedulesError.message : 'Failed to load schedules.')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-600" />
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* School Filter */}
            <div className="space-y-2">
              <Label htmlFor="school-filter">School</Label>
              <Select
                value={selectedSchoolFilter}
                onValueChange={setSelectedSchoolFilter}
              >
                <SelectTrigger id="school-filter">
                  <SelectValue placeholder="All Schools" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name} {school.school_code ? `(${school.school_code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Day Filter */}
            <div className="space-y-2">
              <Label htmlFor="day-filter">Day</Label>
              <Select
                value={selectedDay}
                onValueChange={setSelectedDay}
              >
                <SelectTrigger id="day-filter">
                  <SelectValue placeholder="All Days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Days</SelectItem>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Grade Filter */}
            <div className="space-y-2">
              <Label htmlFor="grade-filter">Grade</Label>
              <Select
                value={selectedGrade}
                onValueChange={setSelectedGrade}
              >
                <SelectTrigger id="grade-filter">
                  <SelectValue placeholder="All Grades" />
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Class Schedule Table */}
      {schedulesLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Class Schedule</CardTitle>
            <CardDescription>Your weekly class schedule</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-500 mt-2">Loading schedule...</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredSchedules && filteredSchedules.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Class Schedule</CardTitle>
                <CardDescription>
                  {hasActiveFilters 
                    ? `Showing ${filteredSchedules.length} of ${schedules?.length || 0} schedules`
                    : `Your weekly class schedule at ${selectedSchool.name}`
                  }
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Room</TableHead>
                    {schools.length > 1 && <TableHead>School</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((schedule: any) => {
                    const formatTime = (time: string) => {
                      if (!time) return '';
                      const [hours, minutes] = time.split(':');
                      const hour = parseInt(hours);
                      const ampm = hour >= 12 ? 'PM' : 'AM';
                      const displayHour = hour % 12 || 12;
                      return `${displayHour}:${minutes} ${ampm}`;
                    };

                    return (
                      <TableRow key={schedule.id}>
                        <TableCell>
                          <Badge variant="outline">{schedule.day_of_week}</Badge>
                        </TableCell>
                        <TableCell>
                          {schedule.period ? (
                            <span className="text-sm">
                              {formatTime(schedule.period.start_time)} - {formatTime(schedule.period.end_time)}
                            </span>
                          ) : schedule.start_time && schedule.end_time ? (
                            <span className="text-sm">
                              {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{schedule.subject}</TableCell>
                        <TableCell>{schedule.grade}</TableCell>
                        <TableCell>
                          {schedule.room ? (
                            <span>{schedule.room.room_number} {schedule.room.room_name && `- ${schedule.room.room_name}`}</span>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </TableCell>
                        {schools.length > 1 && (
                          <TableCell>
                            {schedule.school ? (
                              <span className="text-sm">{schedule.school.name}</span>
                            ) : (
                              <span className="text-sm text-gray-400">N/A</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : schedules && schedules.length > 0 && filteredSchedules.length === 0 && hasActiveFilters ? (
        <Card>
          <CardContent className="p-8">
            <div className="text-center py-6">
              <Filter className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">No schedules match the selected filters</p>
              <p className="text-xs text-gray-600 mt-1">
                Try adjusting your filters or{' '}
                <Button
                  variant="link"
                  className="p-0 h-auto text-blue-600 text-xs"
                  onClick={clearFilters}
                >
                  clear all filters
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Classes Grid */}
      {classesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mt-2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredClasses && filteredClasses.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Classes</CardTitle>
                <CardDescription>
                  {hasActiveFilters 
                    ? `Showing ${filteredClasses.length} of ${classes?.length || 0} classes`
                    : `All classes assigned to you`
                  }
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredClasses.map((classItem: any) => (
            <Card key={classItem.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{classItem.grade || classItem.class_name || 'N/A'}</CardTitle>
                    <CardDescription className="mt-2">
                      {classItem.subject || 'General'}
                    </CardDescription>
                  </div>
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>Max Students: {classItem.max_students || 'N/A'}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>Academic Year: {classItem.academic_year || '2024-25'}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <Badge variant={classItem.is_active ? 'default' : 'secondary'}>
                      {classItem.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Link href={`/teacher/reports?class_id=${classItem.id}`}>
                      <Button size="sm" variant="outline">
                        Submit Report
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (!schedules || schedules.length === 0) && (!classes || classes.length === 0) ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center py-8">
              <BookOpen className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium text-gray-900">No classes assigned</p>
              <p className="text-sm text-gray-600 mt-2">
                You don&apos;t have any classes assigned yet. Please contact your School Admin.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : hasActiveFilters && filteredSchedules.length === 0 && filteredClasses.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center py-8">
              <Filter className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium text-gray-900">No results found</p>
              <p className="text-sm text-gray-600 mt-2">
                No classes or schedules match the selected filters. Try adjusting your filters or{' '}
                <Button
                  variant="link"
                  className="p-0 h-auto text-blue-600"
                  onClick={clearFilters}
                >
                  clear all filters
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats Summary */}
      {filteredClasses && filteredClasses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredClasses.length}</div>
              <p className="text-xs text-muted-foreground">
                {hasActiveFilters ? 'Filtered classes' : 'Classes assigned'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Classes</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {filteredClasses.filter((c: any) => c.is_active).length}
              </div>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredClasses.reduce((sum: number, c: any) => sum + (c.max_students || 0), 0)}
              </div>
              <p className="text-xs text-muted-foreground">Total students capacity</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
