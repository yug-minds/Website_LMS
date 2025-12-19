"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  X,
  Mail,
  Phone,
  Calendar,
  MapPin,
  GraduationCap,
  Briefcase,
  School,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  ChevronLeft,
  FileText
} from "lucide-react";

interface Teacher {
  id: string;
  teacher_id: string;
  full_name: string;
  email: string;
  phone?: string;
  qualification?: string;
  experience_years?: number;
  specialization?: string;
  status: 'Active' | 'Inactive' | 'On Leave' | 'Suspended';
  created_at: string;
  updated_at?: string;
  teacher_schools?: TeacherSchool[];
}

interface TeacherSchool {
  id: string;
  teacher_id: string;
  school_id: string;
  grades_assigned: string[];
  subjects: string[];
  working_days_per_week: number;
  max_students_per_session: number;
  is_primary: boolean;
  schools?: {
    id: string;
    name: string;
    school_code: string;
    city?: string;
    state?: string;
  };
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: 'Present' | 'Absent (Approved)' | 'Absent (Unapproved)' | 'Late';
  check_in_time?: string;
  check_out_time?: string;
  notes?: string;
}

interface DailyReport {
  id: string;
  date: string;
  summary: string;
  grade?: string;
  school_name?: string;
  subjects?: string[];
}

interface TeacherProfileViewProps {
  teacher: Teacher | null;
  open: boolean;
  onClose: () => void;
  refreshTrigger?: number; // Add refresh trigger
}

export default function TeacherProfileView({ teacher, open, onClose, refreshTrigger }: TeacherProfileViewProps) {
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [workSummary, setWorkSummary] = useState({
    totalWorkingDays: 0,
    totalLeavesTaken: 0,
    attendancePercentage: 0,
    totalDays: 0
  });
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    if (open && teacher) {
      setCurrentTeacher(teacher);
      loadTeacherData();
    }
  }, [open, teacher]);

  // Handle refresh trigger
  useEffect(() => {
    if (open && teacher && refreshTrigger) {
      loadTeacherData();
    }
  }, [refreshTrigger]);

  // Update current teacher when prop changes
  useEffect(() => {
    if (teacher) {
      setCurrentTeacher(teacher);
    }
  }, [teacher]);

  const loadTeacherData = async () => {
    if (!teacher) return;
    
    setLoading(true);
    try {
      // Fetch latest teacher data with school assignments
      const teacherResponse = await fetch(`/api/admin/teachers`);
      if (teacherResponse.ok) {
        const teacherData = await teacherResponse.json();
        const list = Array.isArray(teacherData?.data) ? teacherData.data : (teacherData?.teachers || []);
        const updatedTeacher = list?.find((t: Teacher) => t.id === teacher.id);
        if (updatedTeacher) {
          setCurrentTeacher(updatedTeacher);
        }
      }

      // Load attendance data
      const attendanceResponse = await fetch(`/api/admin/teacher-attendance?teacherId=${teacher.id}`);
      if (attendanceResponse.ok) {
        const attendanceData = await attendanceResponse.json();
        const records = attendanceData.attendance || [];
        setAttendanceRecords(records);
        
        // Calculate work summary
         
        const presentDays = records.filter((r: any) => r.status === 'Present').length;
         
        const leaveDays = records.filter((r: any) => r.status === 'Absent (Approved)').length;
        const totalDays = records.length;
        
        setWorkSummary({
          totalWorkingDays: presentDays,
          totalLeavesTaken: leaveDays,
          attendancePercentage: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
          totalDays: totalDays
        });
      }

      // Load daily reports (demo data for now)
      setDailyReports([
        {
          id: '1',
          date: '2025-10-29',
          summary: 'Taught Mathematics to Grade 6 students. Covered basic algebra concepts.',
          grade: 'Grade 6',
          school_name: 'Demo School',
          subjects: ['Mathematics']
        },
        {
          id: '2',
          date: '2025-10-28',
          summary: 'Conducted Science experiments with Grade 7 students. Explained chemical reactions.',
          grade: 'Grade 7',
          school_name: 'Demo School',
          subjects: ['Science']
        },
        {
          id: '3',
          date: '2025-10-27',
          summary: 'Review session for Grade 6 Mathematics. Prepared students for upcoming test.',
          grade: 'Grade 6',
          school_name: 'Demo School',
          subjects: ['Mathematics']
        }
      ]);
    } catch (error) {
      console.error('Error loading teacher data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Present':
        return 'bg-green-100 text-green-800';
      case 'Absent (Approved)':
        return 'bg-yellow-100 text-yellow-800';
      case 'Absent (Unapproved)':
        return 'bg-red-100 text-red-800';
      case 'Late':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDayStatus = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const record = attendanceRecords.find((r: any) => r.date === dateStr);
    
    if (record) {
      if (record.status === 'Present') return 'present';
      if (record.status === 'Absent (Approved)') return 'leave';
      return 'absent';
    }
    
    // Check if weekend
    const day = date.getDay();
    if (day === 0 || day === 6) return 'weekend';
    
    return 'normal';
  };

  const exportAttendanceCSV = () => {
    if (!teacher) return;
    
    const headers = ['Date', 'Status', 'Check In', 'Check Out', 'Notes'];
    const rows = attendanceRecords.map((r: any) => [
      r.date,
      r.status,
      r.check_in_time || 'N/A',
      r.check_out_time || 'N/A',
      r.notes || ''
    ]);
    
    const csv = [headers, ...rows].map((row: any) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentTeacher?.full_name || 'teacher'}_attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (!currentTeacher) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold">Teacher Profile</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading teacher data...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* General Information */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  General Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="text-lg font-semibold">{currentTeacher.full_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-lg flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {currentTeacher.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Contact Number</p>
                    <p className="text-lg flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {currentTeacher.phone || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Teacher ID</p>
                    <p className="text-lg font-mono">{currentTeacher.teacher_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Qualification</p>
                    <p className="text-lg">{currentTeacher.qualification || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Experience</p>
                    <p className="text-lg">{currentTeacher.experience_years || 0} years</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Specialization</p>
                    <p className="text-lg">{currentTeacher.specialization || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date of Joining</p>
                    <p className="text-lg flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {new Date(currentTeacher.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={
                      currentTeacher.status === 'Active' ? 'bg-green-500' :
                      currentTeacher.status === 'On Leave' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }>
                      {currentTeacher.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assigned Schools and Grades */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <School className="h-5 w-5" />
                  Assigned Schools and Grades
                </CardTitle>
              </CardHeader>
              <CardContent>
                {currentTeacher.teacher_schools && currentTeacher.teacher_schools.length > 0 ? (
                  <div className="space-y-4">
                    {currentTeacher.teacher_schools.map((schoolAssignment) => (
                      <div key={schoolAssignment.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-lg flex items-center gap-2">
                              {schoolAssignment.schools?.name || 'Unknown School'}
                              {schoolAssignment.is_primary && (
                                <Badge variant="secondary" className="text-xs">Primary</Badge>
                              )}
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {schoolAssignment.schools?.school_code}
                            </p>
                            <div className="mt-3 space-y-2">
                              <div>
                                <p className="text-sm font-medium">Grades:</p>
                                <div className="flex gap-2 mt-1">
                                  {schoolAssignment.grades_assigned.map((grade) => (
                                    <Badge key={grade} variant="outline">{grade}</Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-sm font-medium">Subjects:</p>
                                <div className="flex gap-2 mt-1">
                                  {schoolAssignment.subjects.map((subject) => (
                                    <Badge key={subject} variant="outline">{subject}</Badge>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Working Days/Week:</p>
                                  <p className="font-medium">{schoolAssignment.working_days_per_week} days</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Max Students/Session:</p>
                                  <p className="font-medium">{schoolAssignment.max_students_per_session}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No schools assigned</p>
                )}
              </CardContent>
            </Card>

            {/* Work Summary */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Work Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Working Days</p>
                    <p className="text-2xl font-bold text-blue-600">{workSummary.totalWorkingDays}</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Leaves Taken</p>
                    <p className="text-2xl font-bold text-yellow-600">{workSummary.totalLeavesTaken}</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Attendance Percentage</p>
                    <p className="text-2xl font-bold text-green-600">{workSummary.attendancePercentage}%</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Days Tracked</p>
                    <p className="text-2xl font-bold text-gray-600">{workSummary.totalDays}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs for Calendar, Reports, and Attendance */}
            <Tabs defaultValue="calendar" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="calendar">Calendar View</TabsTrigger>
                <TabsTrigger value="reports">Daily Reports</TabsTrigger>
                <TabsTrigger value="attendance">Attendance Record</TabsTrigger>
              </TabsList>

              {/* Calendar View */}
              <TabsContent value="calendar" className="space-y-4">
                <Card className="bg-white">
                  <CardHeader>
                    <CardTitle>Attendance Calendar</CardTitle>
                    <CardDescription>
                      Visual representation of teacher attendance and leaves
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-7 gap-2 p-4 bg-gray-50 rounded-lg">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day: any) => (
                        <div key={day} className="text-center font-semibold text-sm text-gray-600 py-2">
                          {day}
                        </div>
                      ))}
                      {Array.from({ length: 30 }, (_, i) => {
                        const date = new Date();
                        date.setDate(date.getDate() + i - 15);
                        const status = getDayStatus(date);
                        return (
                          <div
                            key={i}
                            className={`aspect-square flex items-center justify-center rounded cursor-pointer transition-colors ${
                              status === 'present' ? 'bg-green-500 text-white' :
                              status === 'leave' ? 'bg-yellow-500 text-white' :
                              status === 'absent' ? 'bg-red-500 text-white' :
                              status === 'weekend' ? 'bg-gray-300 text-gray-600' :
                              'bg-white border border-gray-200 hover:bg-gray-100'
                            }`}
                            onClick={() => setSelectedDate(date)}
                            title={date.toLocaleDateString()}
                          >
                            {date.getDate()}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-green-500 rounded"></div>
                        <span>Present</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                        <span>Leave</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-red-500 rounded"></div>
                        <span>Absent</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-gray-300 rounded"></div>
                        <span>Weekend</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Daily Reports */}
              <TabsContent value="reports" className="space-y-4">
                <Card className="bg-white">
                  <CardHeader>
                    <CardTitle>Daily Reports</CardTitle>
                    <CardDescription>
                      Activity logs and reports submitted by the teacher
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {dailyReports.length > 0 ? (
                      <div className="space-y-4">
                        {dailyReports.map((report) => (
                          <div key={report.id} className="border rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{new Date(report.date).toLocaleDateString()}</span>
                                  {report.grade && (
                                    <Badge variant="outline">{report.grade}</Badge>
                                  )}
                                  {report.school_name && (
                                    <Badge variant="outline">{report.school_name}</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-gray-700 mb-2">{report.summary}</p>
                                {report.subjects && report.subjects.length > 0 && (
                                  <div className="flex gap-2">
                                    {report.subjects.map((subject) => (
                                      <Badge key={subject} variant="secondary" className="text-xs">
                                        {subject}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">No daily reports available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Attendance Record */}
              <TabsContent value="attendance" className="space-y-4">
                <Card className="bg-white">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Attendance Record</CardTitle>
                        <CardDescription>
                          Detailed attendance history with dates and status
                        </CardDescription>
                      </div>
                      <Button onClick={exportAttendanceCSV} variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {attendanceRecords.length > 0 ? (
                      <div className="space-y-2">
                        {attendanceRecords.map((record) => (
                          <div key={record.id} className="border rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{new Date(record.date).toLocaleDateString()}</p>
                                <p className="text-sm text-muted-foreground">
                                  {record.check_in_time && `Check-in: ${record.check_in_time}`}
                                  {record.check_out_time && ` | Check-out: ${record.check_out_time}`}
                                </p>
                                {record.notes && (
                                  <p className="text-sm text-gray-600 mt-1">{record.notes}</p>
                                )}
                              </div>
                            </div>
                            <Badge className={getStatusColor(record.status)}>
                              {record.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">No attendance records available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
