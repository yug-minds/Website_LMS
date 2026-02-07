"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Search } from "lucide-react";
import { fetchWithCsrf } from "../../lib/csrf-client";

interface ReportFilterDialogProps {
  reportType: 'schools' | 'teachers' | 'students' | 'courses' | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters: (filters: Record<string, unknown>) => void;
}

interface School {
  id: string;
  name: string;
  school_code?: string;
  is_active?: boolean;
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  teacher_schools?: Array<{ school_id: string; school_name?: string }>;
}

interface StudentData {
  id: string;
  full_name?: string;
  email?: string;
  section?: string;
}

interface Student {
  id: string;
  full_name: string;
  email: string;
  section?: string;
}

interface Course {
  id: string;
  title: string;
  course_name: string;
}

const gradeOptions = [
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
  "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10",
  "Grade 11", "Grade 12"
];

export default function ReportFilterDialog({
  reportType,
  isOpen,
  onClose,
  onApplyFilters,
}: ReportFilterDialogProps) {
  // Filter states
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [datePeriod, setDatePeriod] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Data states
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]); // Store all teachers for filtering
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [_loading, _setLoading] = useState(false);
  const [searchTerms, setSearchTerms] = useState({
    schools: '',
    teachers: '',
    students: '',
    courses: '',
  });

  // Get available sections from students
  const availableSections = [...new Set(students.map((s) => s.section).filter((s): s is string => typeof s === 'string'))].sort();

  // Apply filtering based on selected schools
  const applyTeacherFiltering = useCallback((teacherList: Teacher[]) => {
    if (selectedSchoolIds.length === 0) {
      // If no schools selected, show all teachers
      setTeachers(teacherList);
    } else {
      // Filter teachers to only those assigned to selected schools
      const filtered = teacherList.filter(teacher => {
        const teacherSchools = teacher.teacher_schools || [];
        return teacherSchools.some((ts) => 
          selectedSchoolIds.includes(ts.school_id)
        );
      });
      setTeachers(filtered);
    }
  }, [selectedSchoolIds]);

  const loadSchools = useCallback(async () => {
    try {
      const response = await fetchWithCsrf("/api/admin/schools");
      if (response.ok) {
        const data = await response.json();
        const schoolsList = data.schools || data.data || [];
        if (Array.isArray(schoolsList) && schoolsList.length > 0) {
          setSchools(schoolsList.filter((s: School) => s.is_active !== false));
        } else {
          setSchools([]);
        }
      } else {
        setSchools([]);
      }
    } catch {
      setSchools([]);
    }
  }, []);

  const loadTeachers = useCallback(async () => {
    try {
      const response = await fetchWithCsrf("/api/admin/teachers?limit=1000&offset=0");
      if (response.ok) {
        const data = await response.json();
        const teachersList = data.teachers || data.data || [];
        if (Array.isArray(teachersList) && teachersList.length > 0) {
          interface TeacherData {
            id: string;
            full_name?: string;
            name?: string;
            email?: string;
            teacher_schools?: Array<{ school_id?: string }>;
          }
          const mappedTeachers = teachersList.map((t: TeacherData) => ({
            id: t.id,
            full_name: t.full_name || t.name || 'Unknown',
            email: t.email || '',
            teacher_schools: (t.teacher_schools || []).map((ts) => ({ school_id: ts.school_id ?? '', school_name: undefined }))
          })) as Teacher[];
          setAllTeachers(mappedTeachers);
          if (selectedSchoolIds.length === 0) {
            setTeachers(mappedTeachers);
          } else {
            const filtered = mappedTeachers.filter(teacher => {
              const teacherSchools = teacher.teacher_schools || [];
              return teacherSchools.some((ts) =>
                selectedSchoolIds.includes(ts.school_id || '')
              );
            });
            setTeachers(filtered as Teacher[]);
          }
        } else {
          setAllTeachers([]);
          setTeachers([]);
        }
      } else {
        setAllTeachers([]);
        setTeachers([]);
      }
    } catch {
      setAllTeachers([]);
      setTeachers([]);
    }
  }, [selectedSchoolIds]);

  const loadStudents = useCallback(async () => {
    try {
      const response = await fetchWithCsrf("/api/admin/students?limit=1000");
      if (response.ok) {
        const data = await response.json();
        if (data.students && Array.isArray(data.students)) {
          setStudents(data.students.map((s: StudentData) => ({
            id: s.id,
            full_name: s.full_name || 'Unknown',
            email: s.email || ''
          })));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const loadCourses = useCallback(async () => {
    try {
      const response = await fetchWithCsrf("/api/admin/courses?limit=1000&offset=0");
      if (response.ok) {
        const data = await response.json();
        const coursesList = data.courses || data.data || [];
        if (Array.isArray(coursesList) && coursesList.length > 0) {
          interface CourseData {
            id: string;
            title?: string;
            name?: string;
            course_name?: string;
          }
          setCourses(coursesList.map((c: CourseData) => ({
            id: c.id,
            title: c.title || c.course_name || c.name || 'Unknown',
            course_name: c.course_name || c.name || c.title || ''
          })));
        } else {
          setCourses([]);
        }
      } else {
        setCourses([]);
      }
    } catch {
      setCourses([]);
    }
  }, []);

  // Load data based on report type (intentional setState in effect: load data when dialog opens)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- load data when dialog opens */
    if (isOpen && reportType) {
      loadSchools();
      if (reportType === 'teachers') {
        loadTeachers();
      } else if (reportType === 'students') {
        loadStudents();
      } else if (reportType === 'courses') {
        loadCourses();
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, reportType, loadSchools, loadTeachers, loadStudents, loadCourses]);

  // Re-filter teachers when selected schools change
  useEffect(() => {
    if (reportType === 'teachers' && allTeachers.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync filtered teachers with selection
      applyTeacherFiltering(allTeachers);
    }
  }, [selectedSchoolIds, reportType, allTeachers, applyTeacherFiltering]);

  // Reset filters when dialog closes
  useEffect(() => {
    if (!isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect -- reset form when dialog closes */
      setSelectedSchoolIds([]);
      setSelectedTeacherIds([]);
      setSelectedStudentIds([]);
      setSelectedCourseIds([]);
      setSelectedGrades([]);
      setDatePeriod('all');
      setDateFrom('');
      setDateTo('');
      setSearchTerms({ schools: '', teachers: '', students: '', courses: '' });
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [isOpen]);

  // Filtered data based on search
  const filteredSchools = useMemo(() => {
    if (!searchTerms.schools.trim()) return schools;
    const term = searchTerms.schools.toLowerCase();
    return schools.filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.school_code?.toLowerCase().includes(term)
    );
  }, [schools, searchTerms.schools]);

  const filteredTeachers = useMemo(() => {
    if (!searchTerms.teachers.trim()) return teachers;
    const term = searchTerms.teachers.toLowerCase();
    return teachers.filter(t =>
      t.full_name.toLowerCase().includes(term) ||
      t.email.toLowerCase().includes(term)
    );
  }, [teachers, searchTerms.teachers]);

  const filteredStudents = useMemo(() => {
    if (!searchTerms.students.trim()) return students;
    const term = searchTerms.students.toLowerCase();
    return students.filter(s =>
      s.full_name.toLowerCase().includes(term) ||
      s.email.toLowerCase().includes(term)
    );
  }, [students, searchTerms.students]);

  const filteredCourses = useMemo(() => {
    if (!searchTerms.courses.trim()) return courses;
    const term = searchTerms.courses.toLowerCase();
    return courses.filter(c =>
      c.title.toLowerCase().includes(term) ||
      c.course_name.toLowerCase().includes(term)
    );
  }, [courses, searchTerms.courses]);

  // Calculate date range based on period
  const calculateDateRange = (period: string) => {
    const today = new Date();
    const from = new Date();
    const to = new Date(today);

    switch (period) {
      case 'weekly':
        from.setDate(today.getDate() - 7);
        break;
      case 'monthly':
        from.setMonth(today.getMonth() - 1);
        break;
      case 'yearly':
        from.setFullYear(today.getFullYear() - 1);
        break;
      default:
        return { from: '', to: '' };
    }

    return {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
    };
  };

  const handlePeriodChange = (period: string) => {
    setDatePeriod(period);
    if (period === 'custom') {
      // Keep custom dates
    } else if (period !== 'all') {
      const range = calculateDateRange(period);
      setDateFrom(range.from);
      setDateTo(range.to);
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  const handleApply = () => {
    const filters: Record<string, unknown> = {};

    if (selectedSchoolIds.length > 0) {
      filters.school_ids = selectedSchoolIds.join(',');
    }

    if (reportType === 'teachers') {
      if (selectedTeacherIds.length > 0) {
        filters.teacher_ids = selectedTeacherIds.join(',');
      }
      if (datePeriod !== 'all') {
        if (datePeriod === 'custom') {
          if (dateFrom) filters.date_from = dateFrom;
          if (dateTo) filters.date_to = dateTo;
        } else {
          const range = calculateDateRange(datePeriod);
          filters.date_from = range.from;
          filters.date_to = range.to;
          filters.period = datePeriod;
        }
      }
    } else if (reportType === 'students') {
      if (selectedStudentIds.length > 0) {
        filters.student_ids = selectedStudentIds.join(',');
      }
      if (selectedGrades.length > 0) {
        filters.grades = selectedGrades.join(',');
      }
      if (selectedSections.length > 0) {
        filters.sections = selectedSections.join(',');
      }
    } else if (reportType === 'courses') {
      if (selectedCourseIds.length > 0) {
        filters.course_ids = selectedCourseIds.join(',');
      }
      if (selectedGrades.length > 0) {
        filters.grades = selectedGrades.join(',');
      }
      if (selectedSections.length > 0) {
        filters.sections = selectedSections.join(',');
      }
      if (selectedSchoolIds.length > 0) {
        filters.school_ids = selectedSchoolIds.join(',');
      }
    }

    onApplyFilters(filters);
  };

  const toggleSelection = (
    id: string,
    selected: string[],
    setSelected: (ids: string[]) => void
  ) => {
    if (selected.includes(id)) {
      setSelected(selected.filter(i => i !== id));
    } else {
      setSelected([...selected, id]);
    }
  };

  const selectAll = (items: Array<{ id: string }>, selected: string[], setSelected: (ids: string[]) => void) => {
    if (selected.length === items.length) {
      setSelected([]);
    } else {
      setSelected(items.map(item => item.id));
    }
  };

  if (!reportType) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Filter {reportType === 'schools' ? 'School' :
                   reportType === 'teachers' ? 'Teacher Performance' :
                   reportType === 'students' ? 'Student Enrollment' :
                   'Course Progress'} Report
          </DialogTitle>
          <DialogDescription>
            Select filters to customize your report. Leave empty to include all data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Schools Filter - Available for all report types */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Schools</Label>
              {selectedSchoolIds.length > 0 && (
                <Badge variant="secondary">{selectedSchoolIds.length} selected</Badge>
              )}
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search schools..."
                  value={searchTerms.schools}
                  onChange={(e) => setSearchTerms({ ...searchTerms, schools: e.target.value })}
                  className="pl-8"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectAll(filteredSchools, selectedSchoolIds, setSelectedSchoolIds)}
                >
                  {selectedSchoolIds.length === filteredSchools.length ? 'Deselect All' : 'Select All'}
                </Button>
                {selectedSchoolIds.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSchoolIds([])}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {filteredSchools.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No schools found</p>
                ) : (
                  filteredSchools.map((school) => (
                    <div key={school.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`school-${school.id}`}
                        checked={selectedSchoolIds.includes(school.id)}
                        onCheckedChange={() => toggleSelection(school.id, selectedSchoolIds, setSelectedSchoolIds)}
                      />
                      <label
                        htmlFor={`school-${school.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                      >
                        {school.name}
                        {school.school_code && (
                          <span className="text-muted-foreground ml-2">({school.school_code})</span>
                        )}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Teachers Filter - Only for Teacher Performance Report */}
          {reportType === 'teachers' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Teachers</Label>
                {selectedTeacherIds.length > 0 && (
                  <Badge variant="secondary">{selectedTeacherIds.length} selected</Badge>
                )}
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search teachers..."
                    value={searchTerms.teachers}
                    onChange={(e) => setSearchTerms({ ...searchTerms, teachers: e.target.value })}
                    className="pl-8"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectAll(filteredTeachers, selectedTeacherIds, setSelectedTeacherIds)}
                  >
                    {selectedTeacherIds.length === filteredTeachers.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedTeacherIds.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTeacherIds([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                  {filteredTeachers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No teachers found</p>
                  ) : (
                    filteredTeachers.map((teacher) => (
                      <div key={teacher.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`teacher-${teacher.id}`}
                          checked={selectedTeacherIds.includes(teacher.id)}
                          onCheckedChange={() => toggleSelection(teacher.id, selectedTeacherIds, setSelectedTeacherIds)}
                        />
                        <label
                          htmlFor={`teacher-${teacher.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {teacher.full_name}
                          {teacher.email && (
                            <span className="text-muted-foreground ml-2">({teacher.email})</span>
                          )}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Date Range Filter - Only for Teacher Performance Report */}
          {reportType === 'teachers' && (
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={datePeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="weekly">Last Week</SelectItem>
                  <SelectItem value="monthly">Last Month</SelectItem>
                  <SelectItem value="yearly">Last Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              {datePeriod === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="date-from">From</Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date-to">To</Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Students Filter - Only for Student Enrollment Report */}
          {reportType === 'students' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Students</Label>
                {selectedStudentIds.length > 0 && (
                  <Badge variant="secondary">{selectedStudentIds.length} selected</Badge>
                )}
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search students..."
                    value={searchTerms.students}
                    onChange={(e) => setSearchTerms({ ...searchTerms, students: e.target.value })}
                    className="pl-8"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectAll(filteredStudents, selectedStudentIds, setSelectedStudentIds)}
                  >
                    {selectedStudentIds.length === filteredStudents.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedStudentIds.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedStudentIds([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                  {filteredStudents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No students found</p>
                  ) : (
                    filteredStudents.map((student) => (
                      <div key={student.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`student-${student.id}`}
                          checked={selectedStudentIds.includes(student.id)}
                          onCheckedChange={() => toggleSelection(student.id as string, selectedStudentIds, setSelectedStudentIds)}
                        />
                        <label
                          htmlFor={`student-${student.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {student.full_name}
                          {student.email && (
                            <span className="text-muted-foreground ml-2">({student.email})</span>
                          )}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Grades Filter - For Students and Courses Reports */}
          {(reportType === 'students' || reportType === 'courses') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Grades</Label>
                {selectedGrades.length > 0 && (
                  <Badge variant="secondary">{selectedGrades.length} selected</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedGrades.length === gradeOptions.length) {
                      setSelectedGrades([]);
                    } else {
                      setSelectedGrades([...gradeOptions]);
                    }
                  }}
                >
                  {selectedGrades.length === gradeOptions.length ? 'Deselect All' : 'Select All'}
                </Button>
                {selectedGrades.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedGrades([])}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {gradeOptions.map((grade) => (
                  <div key={grade} className="flex items-center space-x-2">
                    <Checkbox
                      id={`grade-${grade}`}
                      checked={selectedGrades.includes(grade)}
                      onCheckedChange={() => {
                        if (selectedGrades.includes(grade)) {
                          setSelectedGrades(selectedGrades.filter(g => g !== grade));
                        } else {
                          setSelectedGrades([...selectedGrades, grade]);
                        }
                      }}
                    />
                    <label
                      htmlFor={`grade-${grade}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {grade}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sections Filter - For Students and Courses Reports */}
          {(reportType === 'students' || reportType === 'courses') && availableSections.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sections</Label>
                {selectedSections.length > 0 && (
                  <Badge variant="secondary">{selectedSections.length} selected</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedSections.length === availableSections.length) {
                      setSelectedSections([]);
                    } else {
                      setSelectedSections([...availableSections]);
                    }
                  }}
                >
                  {selectedSections.length === availableSections.length ? 'Deselect All' : 'Select All'}
                </Button>
                {selectedSections.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSections([])}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {availableSections.map((section) => (
                  <div key={section} className="flex items-center space-x-2">
                    <Checkbox
                      id={`section-${section}`}
                      checked={selectedSections.includes(section)}
                      onCheckedChange={() => {
                        if (selectedSections.includes(section)) {
                          setSelectedSections(selectedSections.filter(s => s !== section));
                        } else {
                          setSelectedSections([...selectedSections, section]);
                        }
                      }}
                    />
                    <label
                      htmlFor={`section-${section}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {section ?? ''}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Courses Filter - Only for Course Progress Report */}
          {reportType === 'courses' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Courses</Label>
                {selectedCourseIds.length > 0 && (
                  <Badge variant="secondary">{selectedCourseIds.length} selected</Badge>
                )}
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search courses..."
                    value={searchTerms.courses}
                    onChange={(e) => setSearchTerms({ ...searchTerms, courses: e.target.value })}
                    className="pl-8"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectAll(filteredCourses, selectedCourseIds, setSelectedCourseIds)}
                  >
                    {selectedCourseIds.length === filteredCourses.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedCourseIds.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCourseIds([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                  {filteredCourses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No courses found</p>
                  ) : (
                    filteredCourses.map((course) => (
                      <div key={course.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`course-${course.id}`}
                          checked={selectedCourseIds.includes(course.id)}
                          onCheckedChange={() => toggleSelection(course.id, selectedCourseIds, setSelectedCourseIds)}
                        />
                        <label
                          htmlFor={`course-${course.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {course.title}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply Filters & Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

