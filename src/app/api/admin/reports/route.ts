import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../../../lib/auth-utils';
import { supabaseAdmin } from '../../../../lib/supabase';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../../../../lib/rate-limit';
import { logger } from '../../../../lib/logger';
import { ensureCsrfToken } from '../../../../lib/csrf-middleware';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface School {
  id?: string;
  name?: string;
}

interface Student {
  id?: string;
  full_name?: string;
  email?: string;
  grade?: string;
  school_name?: string;
  parent_name?: string;
  parent_phone?: string;
  [key: string]: unknown;
}

interface CourseAccess {
  school_id?: string | number;
  course_id?: string;
  [key: string]: unknown;
}

interface Course {
  id?: string;
  course_name?: string;
  title?: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  ensureCsrfToken(request);
  
  // Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.READ);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} seconds.`
      },
      { 
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult)
      }
    );
  }

// Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    return adminCheck.response;
  }

  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get('type');

  // Parse filter parameters
  const parseFilterArray = (param: string | null): string[] => {
    if (!param) return [];
    return param.split(',').filter(Boolean);
  };

  try {
    let pdfDoc: jsPDF;
    let filename = '';

    switch (reportType) {
      case 'schools': {
        // Parse school filter
        const schoolIds = parseFilterArray(searchParams.get('school_ids'));
        
        let query = supabaseAdmin
          .from('schools')
          .select('id, name, address, contact_phone, contact_email, principal_name, created_at, updated_at');
        
        // Apply school filter if provided
        if (schoolIds.length > 0) {
          query = query.in('id', schoolIds);
        }
        
        query = query.order('created_at', { ascending: false });
        
        const { data: schools, error: schoolsError } = await query;
        
        if (schoolsError) {
          logger.error('Error fetching schools for report', { error: schoolsError });
          throw new Error(`Failed to fetch schools: ${schoolsError.message}`);
        }
        
        logger.info('Schools report data', { 
          count: schools?.length || 0,
          schools: schools?.map((s: { id: string; name?: string }) => ({ id: s.id, name: s.name || '' })) || []
        });
        
        pdfDoc = new jsPDF();
        pdfDoc.setFontSize(18);
        pdfDoc.text('School Report', 14, 22);
        pdfDoc.setFontSize(11);
        pdfDoc.setTextColor(100);
        pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
        pdfDoc.text(`Total Schools: ${schools?.length || 0}`, 14, 36);

        if (schools && schools.length > 0) {
          interface School {
            name?: string | null;
            address?: string | null;
            contact_phone?: string | null;
            contact_email?: string | null;
            principal_name?: string | null;
            created_at?: string | null;
          }
          
          const tableData = schools.map((school: School) => [
            String(school.name || 'N/A'),
            String(school.address || 'N/A'),
            String(school.contact_phone || 'N/A'),
            String(school.contact_email || 'N/A'),
            String(school.principal_name || 'N/A'),
            school.created_at ? new Date(school.created_at).toLocaleDateString() : 'N/A'
          ]);

          autoTable(pdfDoc, {
            head: [['School Name', 'Address', 'Phone', 'Email', 'Principal', 'Created Date']],
            body: tableData,
            startY: 42,
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            margin: { top: 42, left: 14, right: 14 },
          });
        } else {
          pdfDoc.setFontSize(12);
          pdfDoc.text('No schools found', 14, 50);
        }

        filename = `school-report-${new Date().toISOString().split('T')[0]}.pdf`;
        break;
      }

      case 'teachers': {
        // Parse filters
        const schoolIds = parseFilterArray(searchParams.get('school_ids'));
        const teacherIds = parseFilterArray(searchParams.get('teacher_ids'));
        const dateFrom = searchParams.get('date_from');
        const dateTo = searchParams.get('date_to');
        const period = searchParams.get('period');
        
        // Calculate date range if period is provided
        let finalDateFrom = dateFrom;
        let finalDateTo = dateTo;
        if (period && !dateFrom && !dateTo) {
          const today = new Date();
          const from = new Date();
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
          }
          if (period !== 'all') {
            finalDateFrom = from.toISOString().split('T')[0];
            finalDateTo = today.toISOString().split('T')[0];
          }
        }
        
        // Log filters for debugging
        logger.info('Teacher Performance Report filters', {
          schoolIds,
          teacherIds,
          dateFrom: finalDateFrom,
          dateTo: finalDateTo,
          period
        });

        // Map teacher IDs to profile IDs if needed
        // teacher_reports.teacher_id references profiles.id, but filter might use teachers.id
        let profileIds = teacherIds;
        if (teacherIds.length > 0) {
          try {
            // Try to find profiles by matching with teachers table (if teachers.id was provided)
            // First, get emails from teachers table
            const { data: teachersData, error: teachersLookupError } = await supabaseAdmin
              .from('teachers')
              .select('id, email')
              .in('id', teacherIds);
            
            interface Teacher {
              id: string;
              email?: string | null;
            }
            
            if (!teachersLookupError && teachersData && teachersData.length > 0) {
              // Get profile IDs from emails
              const teacherEmails = teachersData.map((t: Teacher) => t.email).filter(Boolean);
              if (teacherEmails.length > 0) {
                const { data: profilesData, error: profilesLookupError } = await supabaseAdmin
                  .from('profiles')
                  .select('id, email')
                  .in('email', teacherEmails)
                  .eq('role', 'teacher');
                
                interface Profile {
                  id: string;
                  email?: string | null;
                }
                
                if (!profilesLookupError && profilesData) {
                  profileIds = profilesData.map((p: Profile) => p.id).filter(Boolean);
                  logger.info('Mapped teacher IDs to profile IDs', {
                    teacherIds,
                    profileIds,
                    emails: teacherEmails
                  });
                } else {
                  // If lookup fails, try using teacherIds directly (they might already be profile IDs)
                  logger.warn('Failed to map teacher IDs to profile IDs, using as-is', {
                    error: profilesLookupError
                  });
                  profileIds = teacherIds;
                }
              } else {
                profileIds = teacherIds; // Use as-is if no emails found
              }
            } else {
              // If teachers table lookup fails, assume teacherIds are already profile IDs
              logger.info('Teachers table lookup failed or empty, assuming teacherIds are profile IDs', {
                error: teachersLookupError
              });
              profileIds = teacherIds;
            }
          } catch (mappingError) {
            logger.warn('Error mapping teacher IDs, using as-is', { error: mappingError });
            profileIds = teacherIds;
          }
        }

        // Query daily reports from teacher_reports table
        let reportsQuery = supabaseAdmin
          .from('teacher_reports')
          .select(`
            id,
            teacher_id,
            school_id,
            date,
            class_name,
            grade,
            topics_taught,
            student_count,
            duration_hours,
            notes,
            activities,
            start_time,
            end_time,
            created_at
          `);
        
        // Apply filters
        if (schoolIds.length > 0) {
          reportsQuery = reportsQuery.in('school_id', schoolIds);
          logger.info('Applied school filter', { schoolIds });
        }
        
        if (profileIds.length > 0) {
          reportsQuery = reportsQuery.in('teacher_id', profileIds);
          logger.info('Applied teacher filter (profile IDs)', { 
            originalTeacherIds: teacherIds,
            profileIds 
          });
        }
        
        if (finalDateFrom) {
          reportsQuery = reportsQuery.gte('date', finalDateFrom);
          logger.info('Applied date from filter', { finalDateFrom });
        }
        
        if (finalDateTo) {
          reportsQuery = reportsQuery.lte('date', finalDateTo);
          logger.info('Applied date to filter', { finalDateTo });
        }
        
        reportsQuery = reportsQuery
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });
        
        const { data: reports, error: reportsError } = await reportsQuery;
        
        if (reportsError) {
          logger.error('Error fetching teacher reports for report', { 
            error: reportsError,
            message: reportsError.message,
            details: reportsError.details,
            hint: reportsError.hint
          });
          throw new Error(`Failed to fetch teacher reports: ${reportsError.message}`);
        }

        type ReportSample = {
          id: string;
          teacher_id: string;
          school_id: string;
          date: string;
          grade?: string | null;
        };
        logger.info('Teacher reports query result', {
          reportCount: reports?.length || 0,
          sampleReports: reports?.slice(0, 3).map((r: ReportSample) => ({
            id: r.id,
            teacher_id: r.teacher_id,
            school_id: r.school_id,
            date: r.date,
            grade: r.grade
          }))
        });

        if (!reports || reports.length === 0) {
          logger.warn('No teacher reports found', {
            filters: {
              schoolIds,
              teacherIds,
              dateFrom: finalDateFrom,
              dateTo: finalDateTo
            }
          });
          
          // Try a query without filters to see if there are any reports at all
          const { data: allReports, error: _allReportsError } = await supabaseAdmin
            .from('teacher_reports')
            .select('id, teacher_id, school_id, date')
            .limit(5);
          
          logger.info('Sample reports in database (without filters)', {
            count: allReports?.length || 0,
            sample: allReports?.map((r: ReportSample) => ({
              teacher_id: r.teacher_id,
              school_id: r.school_id,
              date: r.date
            }))
          });
          
          pdfDoc = new jsPDF();
          pdfDoc.setFontSize(18);
          pdfDoc.text('Teacher Performance Report', 14, 22);
          pdfDoc.setFontSize(11);
          pdfDoc.setTextColor(100);
          pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
          pdfDoc.setFontSize(12);
          pdfDoc.text('No daily reports found matching the selected filters', 14, 50);
          filename = `teacher-report-${new Date().toISOString().split('T')[0]}.pdf`;
          break;
        }

        // Get unique teacher IDs and school IDs
        const uniqueTeacherIds = [...new Set((reports || []).map((r: ReportSample) => r.teacher_id).filter(Boolean))];
        const uniqueSchoolIds = [...new Set((reports || []).map((r: ReportSample) => r.school_id).filter(Boolean))];

        // Fetch teacher profiles
        const teachersMap = new Map();
        if (uniqueTeacherIds.length > 0) {
          const { data: teachersData, error: teachersError } = await supabaseAdmin
          .from('profiles')
            .select('id, full_name, email')
            .in('id', uniqueTeacherIds);
          
          interface TeacherProfile {
            id: string;
            full_name?: string | null;
            email?: string | null;
          }
          
          if (teachersError) {
            logger.warn('Error fetching teacher profiles (non-fatal)', { error: teachersError });
          } else {
            (teachersData || []).forEach((teacher: TeacherProfile) => {
              if (teacher.id) {
                teachersMap.set(teacher.id, teacher);
              }
            });
          }
        }

        // Fetch school names
        const schoolsMap = new Map();
        if (uniqueSchoolIds.length > 0) {
          const { data: schoolsData, error: schoolsError } = await supabaseAdmin
            .from('schools')
            .select('id, name')
            .in('id', uniqueSchoolIds);
          
          if (schoolsError) {
            logger.warn('Error fetching schools (non-fatal)', { error: schoolsError });
          } else {
            interface School {
              id?: string;
              name?: string;
            }
            
            (schoolsData || []).forEach((school: School) => {
              if (school.id) {
                schoolsMap.set(school.id, school);
              }
            });
          }
        }

        // Transform reports with teacher and school names
        interface Report {
          teacher_id?: string;
          school_id?: string;
          date?: string;
          grade?: string;
          class_name?: string;
          topics_taught?: string;
          student_count?: number;
          duration_hours?: number;
          notes?: string;
          activities?: string;
          start_time?: string;
          end_time?: string;
        }
        
        const reportsWithDetails = (reports || []).map((report: Report) => {
          const teacher = teachersMap.get(report.teacher_id);
          const school = schoolsMap.get(report.school_id);
          
          return {
            teacher_name: teacher?.full_name || 'Unknown',
            teacher_email: teacher?.email || 'N/A',
            school_name: school?.name || 'Unknown',
            date: report.date ? new Date(report.date).toLocaleDateString() : 'N/A',
            grade: report.grade || report.class_name || 'N/A',
            topics_taught: report.topics_taught || 'N/A',
            student_count: report.student_count || 0,
            duration_hours: report.duration_hours || 0,
            notes: report.notes || '',
            activities: report.activities || '',
            start_time: report.start_time || '',
            end_time: report.end_time || ''
          };
        });
        
        logger.info('Teacher reports data', { 
          count: reportsWithDetails.length,
          reports: reportsWithDetails.slice(0, 5).map((r: { teacher_name?: string; school_name?: string; date?: string }) => ({ 
            teacher: r.teacher_name, 
            school: r.school_name, 
            date: r.date 
          }))
        });
        
        pdfDoc = new jsPDF();
        pdfDoc.setFontSize(18);
        pdfDoc.text('Teacher Performance Report', 14, 22);
        pdfDoc.setFontSize(11);
        pdfDoc.setTextColor(100);
        pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
        pdfDoc.text(`Total Daily Reports: ${reportsWithDetails.length}`, 14, 36);

        if (reportsWithDetails.length > 0) {
          const tableData = reportsWithDetails.map((report: { teacher_name?: string; school_name?: string; date?: string; grade?: string; topics_taught?: string; student_count?: number; duration_hours?: number; notes?: string }) => [
            String(report.teacher_name || 'N/A'),
            String(report.school_name || 'N/A'),
            String(report.date || 'N/A'),
            String(report.grade || 'N/A'),
            String(report.topics_taught || 'N/A').substring(0, 50) + (report.topics_taught && report.topics_taught.length > 50 ? '...' : ''),
            String(report.student_count || 0),
            String(report.duration_hours || 0) + ' hrs',
            String(report.notes || '').substring(0, 30) + (report.notes && report.notes.length > 30 ? '...' : '')
          ]);

          autoTable(pdfDoc, {
            head: [['Teacher Name', 'School', 'Date', 'Grade', 'Topics Taught', 'Students', 'Duration', 'Notes']],
            body: tableData,
            startY: 42,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 9 },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            margin: { top: 42, left: 14, right: 14 },
            columnStyles: {
              0: { cellWidth: 35 }, // Teacher Name
              1: { cellWidth: 40 }, // School
              2: { cellWidth: 25 }, // Date
              3: { cellWidth: 20 }, // Grade
              4: { cellWidth: 45 }, // Topics Taught
              5: { cellWidth: 20 }, // Students
              6: { cellWidth: 20 }, // Duration
              7: { cellWidth: 30 }  // Notes
            }
          });
        } else {
          pdfDoc.setFontSize(12);
          pdfDoc.text('No daily reports found', 14, 50);
        }

        filename = `teacher-performance-report-${new Date().toISOString().split('T')[0]}.pdf`;
        break;
      }

      case 'students': {
        try {
          // Parse filters
          const schoolIds = parseFilterArray(searchParams.get('school_ids'));
          const studentIds = parseFilterArray(searchParams.get('student_ids'));
          const grades = parseFilterArray(searchParams.get('grades'));
          const _sections = parseFilterArray(searchParams.get('sections'));
          
          // Query students from profiles
          let studentsQuery = supabaseAdmin
          .from('profiles')
            .select(`
              id, 
              full_name, 
              email, 
              phone, 
              role, 
              parent_name, 
              parent_phone,
              created_at, 
              updated_at
            `)
            .eq('role', 'student');
          
          // Filter by student IDs if provided
          if (studentIds.length > 0) {
            studentsQuery = studentsQuery.in('id', studentIds);
          }
          
          studentsQuery = studentsQuery.order('created_at', { ascending: false });
          
          const { data: students, error: studentsError } = await studentsQuery;
          
          if (studentsError) {
            logger.error('Error fetching students for report', { error: studentsError });
            throw new Error(`Failed to fetch students: ${studentsError.message}`);
          }

          // Get student IDs and fetch school assignments separately
          const allStudentIds = (students || []).map((s) => (s as Student).id).filter((id): id is string => !!id);
          const studentSchoolsMap = new Map();
          let filteredStudentIds = allStudentIds;
          
          if (allStudentIds.length > 0) {
            try {
              let studentSchoolsQuery = supabaseAdmin
                .from('student_schools')
                .select(`
                  student_id,
                  school_id,
                  grade,
                  schools (
                    id,
                    name,
                    address
                  )
                `)
                .in('student_id', allStudentIds)
                .eq('is_active', true);
              
              // Apply school filter if provided
              if (schoolIds.length > 0) {
                studentSchoolsQuery = studentSchoolsQuery.in('school_id', schoolIds);
              }
              
              // Apply grade filter if provided
              if (grades.length > 0) {
                studentSchoolsQuery = studentSchoolsQuery.in('grade', grades);
              }
              
              const { data: studentSchools, error: ssError } = await studentSchoolsQuery;
              
              if (ssError) {
                logger.warn('Error fetching student schools (non-fatal)', { error: ssError });
                // Continue without school data - students will show "Not enrolled"
              } else {
                // Get filtered student IDs if filters were applied
                type StudentSchoolData = {
                  student_id?: string;
                  school_id?: string;
                  grade?: string;
                  schools?: {
                    name?: string;
                    address?: string;
                  };
                };
                if (schoolIds.length > 0 || grades.length > 0) {
                  filteredStudentIds = [...new Set((studentSchools || []).map((ss: StudentSchoolData) => ss.student_id).filter((id): id is string => !!id))];
                }
                
                // Map student_id to school info
                (studentSchools || []).forEach((ss: StudentSchoolData) => {
                  if (ss.student_id && !studentSchoolsMap.has(ss.student_id)) {
                    studentSchoolsMap.set(ss.student_id, {
                      school_name: ss.schools?.name || 'Not enrolled',
                      school_address: ss.schools?.address || null,
                      grade: ss.grade || null
                    });
                  }
                });
              }
            } catch (ssQueryError) {
              logger.warn('Exception fetching student schools (non-fatal)', { error: ssQueryError });
              // Continue without school data
            }
          }
          
          // Filter students by school/grade if filters were applied
          let filteredStudents = students || [];
          if (schoolIds.length > 0 || grades.length > 0) {
            filteredStudents = filteredStudents.filter((s) => {
              const student = s as Student;
              const studentId = student.id;
              return studentId && filteredStudentIds.includes(studentId);
            });
          }

          const studentsWithSchool = filteredStudents.map((student: Student) => {
            const schoolInfo = studentSchoolsMap.get(student.id) || {
              school_name: 'Not enrolled',
              school_address: null,
              grade: null
            };
            
            const studentData = student as Student & { phone?: string; parent_name?: string; parent_phone?: string; created_at?: string };
            return {
              id: studentData.id,
              full_name: studentData.full_name || 'N/A',
              email: studentData.email || 'N/A',
              phone: studentData.phone || 'N/A',
              grade: schoolInfo.grade || 'N/A',
              parent_name: studentData.parent_name || 'N/A',
              parent_phone: studentData.parent_phone || 'N/A',
              school_name: schoolInfo.school_name,
              created_at: studentData.created_at || new Date().toISOString()
            };
          });
          
          // Create PDF
          pdfDoc = new jsPDF();
          pdfDoc.setFontSize(18);
          pdfDoc.text('Student Enrollment Report', 14, 22);
          pdfDoc.setFontSize(11);
          pdfDoc.setTextColor(100);
          pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
          pdfDoc.text(`Total Students: ${studentsWithSchool.length}`, 14, 36);

          const tableData = studentsWithSchool.map((student) => {
            try {
              const studentData = student as Student & { phone?: string; parent_name?: string; parent_phone?: string; created_at?: string };
              return [
                String(studentData.full_name || 'N/A'),
                String(studentData.email || 'N/A'),
                String(studentData.grade || 'N/A'),
                String(studentData.school_name || 'Not enrolled'),
                String(studentData.parent_name || 'N/A'),
                String(studentData.parent_phone || 'N/A'),
                studentData.created_at ? new Date(studentData.created_at).toLocaleDateString() : 'N/A'
              ];
            } catch (rowError) {
              logger.warn('Error formatting student row', { student, error: rowError });
              return ['Error', 'Error', 'Error', 'Error', 'Error', 'Error', 'Error'];
            }
          });

          // Only add table if we have data
          if (tableData.length > 0) {
            autoTable(pdfDoc, {
              head: [['Student Name', 'Email', 'Grade', 'School', 'Parent Name', 'Parent Phone', 'Enrolled Date']],
              body: tableData,
              startY: 42,
              styles: { fontSize: 8, cellPadding: 2 },
              headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
              alternateRowStyles: { fillColor: [245, 247, 250] },
              margin: { top: 42, left: 14, right: 14 },
              columnStyles: {
                0: { cellWidth: 40 },
                1: { cellWidth: 45 },
                2: { cellWidth: 20 },
                3: { cellWidth: 35 },
                4: { cellWidth: 35 },
                5: { cellWidth: 30 },
                6: { cellWidth: 25 }
              }
            });
          } else {
            // Add message if no data
            pdfDoc.setFontSize(12);
            pdfDoc.text('No students found', 14, 50);
          }

          filename = `student-report-${new Date().toISOString().split('T')[0]}.pdf`;
        } catch (studentError) {
          logger.error('Error in students report generation', { 
            error: studentError instanceof Error ? studentError.message : String(studentError),
            stack: studentError instanceof Error ? studentError.stack : undefined
          });
          throw new Error(`Failed to generate student report: ${studentError instanceof Error ? studentError.message : 'Unknown error'}`);
        }
        break;
      }

      case 'courses': {
        // Parse filters
        const filterSchoolIds = parseFilterArray(searchParams.get('school_ids'));
        const filterCourseIds = parseFilterArray(searchParams.get('course_ids'));
        const grades = parseFilterArray(searchParams.get('grades'));
        
        let fetchedCourseIds: string[] = [];
        let courses: Course[] = [];
        
        // If specific course IDs are provided, use those directly
        if (filterCourseIds.length > 0) {
          fetchedCourseIds = filterCourseIds;
        } else {
          // Otherwise, find courses through course_access table if school/grade filters are provided
          // or fetch all courses that have student enrollments
          if (filterSchoolIds.length > 0 || grades.length > 0) {
            // Query course_access to find courses assigned to filtered schools/grades
            let courseAccessQuery = supabaseAdmin
              .from('course_access')
              .select('course_id, school_id, grade');
            
            if (filterSchoolIds.length > 0) {
              courseAccessQuery = courseAccessQuery.in('school_id', filterSchoolIds);
            }
            if (grades.length > 0) {
              courseAccessQuery = courseAccessQuery.in('grade', grades);
            }
            
            const { data: courseAccessData, error: courseAccessError } = await courseAccessQuery;
            
            if (courseAccessError) {
              logger.warn('Error fetching course_access (will try all courses)', { error: courseAccessError });
            } else if (courseAccessData && courseAccessData.length > 0) {
              type CourseAccessData = {
                course_id?: string | number;
              };
              fetchedCourseIds = [...new Set(courseAccessData.map((ca: CourseAccessData) => String(ca.course_id)).filter(Boolean))] as string[];
              logger.info('Found courses via course_access', { count: fetchedCourseIds.length });
            }
          }
        }
        
        // Fetch course details for the identified course IDs (or all if no filters)
        let coursesQuery = supabaseAdmin
          .from('courses')
          .select(`
            id, 
            course_name, 
            title, 
            description, 
            subject, 
            grade, 
            status, 
            is_published, 
            school_id, 
            created_at, 
            updated_at
          `);
        
        // Apply course ID filter if we have specific IDs
        if (fetchedCourseIds.length > 0) {
          coursesQuery = coursesQuery.in('id', fetchedCourseIds);
        }
        
        // Also apply direct school_id filter on courses table (for courses with direct school_id)
        if (filterSchoolIds.length > 0 && fetchedCourseIds.length === 0) {
          coursesQuery = coursesQuery.in('school_id', filterSchoolIds);
        }
        
        // Apply grade filter on courses table if provided (and not already filtered via course_access)
        if (grades.length > 0 && fetchedCourseIds.length === 0) {
          coursesQuery = coursesQuery.in('grade', grades);
        }
        
        coursesQuery = coursesQuery.order('created_at', { ascending: false });
        
        const { data: coursesData, error: coursesError } = await coursesQuery;
        
        if (coursesError) {
          logger.error('Error fetching courses for report', { error: coursesError });
          throw new Error(`Failed to fetch courses: ${coursesError.message}`);
        }
        
        courses = coursesData || [];
        
        if (courses.length === 0) {
          logger.warn('No courses found in database');
        } else {
          logger.info('Courses report data', { 
            count: courses.length,
            courses: courses.map((c: Course) => ({ id: c.id, title: c.title || c.course_name }))
          });
        }

        // Update fetchedCourseIds to match actual courses found
        fetchedCourseIds = courses.map((c: Course) => c.id).filter((id): id is string => !!id);
        
        // If no courses found and no filters, check if there are any student enrollments at all
        if (fetchedCourseIds.length === 0 && filterCourseIds.length === 0 && filterSchoolIds.length === 0 && grades.length === 0) {
          // Try to find courses that have student enrollments
          const { data: studentCoursesCheck, error: checkError } = await supabaseAdmin
            .from('student_courses')
            .select('course_id')
            .limit(100);
          
          if (!checkError && studentCoursesCheck && studentCoursesCheck.length > 0) {
            type StudentCourseData = {
              course_id?: string | number;
            };
            const enrolledCourseIds = [...new Set(studentCoursesCheck.map((sc: StudentCourseData) => String(sc.course_id)).filter(Boolean))] as string[];
            
            // Fetch those courses
            const { data: enrolledCourses, error: enrolledError } = await supabaseAdmin
              .from('courses')
              .select(`
                id, 
                course_name, 
                title, 
                description, 
                subject, 
                grade, 
                status, 
                is_published, 
                school_id, 
                created_at, 
                updated_at
              `)
              .in('id', enrolledCourseIds);
            
            if (!enrolledError && enrolledCourses) {
              courses = enrolledCourses;
              fetchedCourseIds = enrolledCourseIds;
              logger.info('Found courses with student enrollments', { count: courses.length });
            }
          }
        }

        // Get unique school IDs from courses and course_access
        const courseSchoolIds = [...new Set(courses.map((c: Course) => c.school_id).filter((id): id is string => !!id))];
        let allSchoolIds: string[] = [...courseSchoolIds];
        
        // Also get school IDs from course_access for the fetched courses
        if (fetchedCourseIds.length > 0) {
          const { data: courseAccessForCourses, error: caError } = await supabaseAdmin
            .from('course_access')
            .select('school_id')
            .in('course_id', fetchedCourseIds);
          
          if (!caError && courseAccessForCourses) {
            const caSchoolIds: string[] = [...new Set(courseAccessForCourses.map((ca: CourseAccess) => String(ca.school_id)).filter(Boolean))] as string[];
            // Merge and deduplicate school IDs
            const mergedSchoolIds = [...allSchoolIds, ...caSchoolIds];
            allSchoolIds = [...new Set(mergedSchoolIds)];
          }
        }
        
        const schoolsMap = new Map();
        
        if (allSchoolIds.length > 0) {
          const { data: schools, error: schoolsError } = await supabaseAdmin
            .from('schools')
            .select('id, name')
            .in('id', allSchoolIds);
          
          if (schoolsError) {
            logger.warn('Error fetching schools for courses (non-fatal)', { error: schoolsError });
          } else {
            (schools || []).forEach((school: School) => {
              if (school.id) {
                schoolsMap.set(school.id, school.name);
              }
            });
          }
        }
        
        // Use the SAME approach as Course Analytics - start with students from student_schools
        // Get students first (matching Course Analytics logic)
        let studentsQuery = supabaseAdmin
          .from('student_schools')
          .select(`
            student_id,
            school_id,
            grade,
            profiles!inner(
              id,
              full_name,
              email
            ),
            schools!inner(
              id,
              name
            )
          `)
          .eq('is_active', true);

        // Apply school filter
        if (filterSchoolIds.length > 0) {
          studentsQuery = studentsQuery.in('school_id', filterSchoolIds);
        }

        // Apply grade filter
        if (grades.length > 0) {
          studentsQuery = studentsQuery.in('grade', grades);
        }

        const { data: students, error: studentsError } = await studentsQuery;

        if (studentsError) {
          logger.error('Error fetching students', { error: studentsError });
          throw new Error(`Failed to fetch students: ${studentsError.message}`);
        }

        if (!students || students.length === 0) {
          logger.warn('No students found with filters', {
            filterSchoolIds,
            grades
          });
          pdfDoc = new jsPDF();
          pdfDoc.setFontSize(18);
          pdfDoc.text('Course Progress Report', 14, 22);
          pdfDoc.setFontSize(11);
          pdfDoc.setTextColor(100);
          pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
          pdfDoc.setFontSize(12);
          pdfDoc.text('No students found for the selected filters', 14, 50);
          filename = `course-progress-report-${new Date().toISOString().split('T')[0]}.pdf`;
          break;
        }

        type StudentWithIdData = {
          student_id?: string;
          school_id?: string;
          grade?: string;
        };
        
        const studentIds = students.map((s: StudentWithIdData) => s.student_id);
        
        logger.info('Found students', { 
          count: students.length,
          studentIds: studentIds.slice(0, 5)
        });

        // Get enrollments for these students (same as Course Analytics)
        let enrollmentsQuery = supabaseAdmin
          .from('enrollments')
          .select(`
            student_id,
            course_id,
            progress_percentage,
            status,
            enrolled_on,
            last_accessed,
            courses!inner(
              id,
              course_name,
              name,
              num_chapters,
              status,
              is_published
            )
          `)
          .in('student_id', studentIds)
          .eq('status', 'active');
        
        // Apply course filter if provided
        if (fetchedCourseIds.length > 0) {
          enrollmentsQuery = enrollmentsQuery.in('course_id', fetchedCourseIds);
        }
        
        const { data: enrollments, error: enrollmentsError } = await enrollmentsQuery;
        
        if (enrollmentsError) {
          logger.warn('Error fetching enrollments, trying student_courses', { error: enrollmentsError });
        }

        // Get course_access for virtual enrollments (same as Course Analytics)
        const schoolIdsFromStudents = [...new Set(students.map((s: StudentWithIdData) => s.school_id))];
        const gradesFromStudents = [...new Set(students.map((s: StudentWithIdData) => s.grade))];
        
        const { data: courseAccessEntries } = await supabaseAdmin
          .from('course_access')
          .select(`
            course_id,
            school_id,
            grade,
            courses!inner(
              id,
              course_name,
              name,
              num_chapters,
              status,
              is_published
            )
          `)
          .in('school_id', schoolIdsFromStudents)
          .in('grade', gradesFromStudents)
          .eq('courses.is_published', true);

        // Create virtual enrollments (same as Course Analytics)
        interface VirtualEnrollment {
          student_id?: string;
          course_id?: string;
          enrolled_at?: string | null;
          last_accessed?: string | null;
          status?: string;
        }
        
        const virtualEnrollments: VirtualEnrollment[] = [];
        if (courseAccessEntries && courseAccessEntries.length > 0) {
          type EnrollmentData = {
            student_id?: string;
            course_id?: string;
          };
          type StudentEnrollmentData = {
            student_id?: string;
            school_id?: string;
            grade?: string;
          };
          type CourseAccessEntryData = {
            school_id?: string;
            grade?: string;
            course_id?: string;
            courses?: unknown;
          };
          const existingEnrollmentKeys = new Set((enrollments || []).map((e: EnrollmentData) => `${e.student_id}-${e.course_id}`));
          
          students.forEach((student: StudentEnrollmentData) => {
            const matchingAccess = courseAccessEntries.filter((ca: CourseAccessEntryData) => 
              ca.school_id === student.school_id && 
              (ca.grade === student.grade || 
               (ca.grade && student.grade && ca.grade.toLowerCase().replace(/^grade\s*/i, '') === student.grade.toLowerCase().replace(/^grade\s*/i, '')))
            );

            matchingAccess.forEach((access: CourseAccessEntryData) => {
              const key = `${student.student_id}-${access.course_id}`;
              // Apply course filter if provided
              if (fetchedCourseIds.length === 0 || (access.course_id && fetchedCourseIds.includes(access.course_id))) {
                if (!existingEnrollmentKeys.has(key)) {
                  virtualEnrollments.push({
                    student_id: student.student_id,
                    course_id: access.course_id,
                    status: 'active',
                    enrolled_on: null,
                    last_accessed: null
                  } as VirtualEnrollment);
                  existingEnrollmentKeys.add(key);
                }
              }
            });
          });
        }

        // Combine real and virtual enrollments
        const allEnrollments = [...(enrollments || []), ...virtualEnrollments];
        
        type EnrollmentWithCourseIdData = {
          course_id?: string;
        };
        
        // Update courses list from enrollments if needed
        if (fetchedCourseIds.length === 0 && allEnrollments.length > 0) {
          const enrolledCourseIds = [...new Set(allEnrollments.map((e) => {
            const enrollment = e as EnrollmentWithCourseIdData;
            return enrollment.course_id;
          }).filter((id): id is string => !!id))];
          const { data: enrolledCoursesData } = await supabaseAdmin
          .from('courses')
          .select('id, course_name, title, description, subject, grade, status, is_published, school_id, created_at, updated_at')
            .in('id', enrolledCourseIds);
          
          if (enrolledCoursesData) {
            courses = enrolledCoursesData;
            fetchedCourseIds = enrolledCourseIds;
          }
        }

        logger.info('Found student enrollments', { 
          count: allEnrollments?.length || 0,
          fromEnrollments: enrollments?.length || 0,
          virtualEnrollments: virtualEnrollments.length,
          courseIdsFilter: fetchedCourseIds.length > 0 ? fetchedCourseIds : 'all'
        });

        if (!allEnrollments || allEnrollments.length === 0) {
          logger.warn('No student enrollments found', {
            studentsCount: students.length,
            courseIdsFilter: fetchedCourseIds.length > 0 ? fetchedCourseIds : 'none'
          });
          pdfDoc = new jsPDF();
          pdfDoc.setFontSize(18);
          pdfDoc.text('Course Progress Report', 14, 22);
          pdfDoc.setFontSize(11);
          pdfDoc.setTextColor(100);
          pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
          pdfDoc.setFontSize(12);
          pdfDoc.text('No student progress data found for the selected courses', 14, 50);
          filename = `course-progress-report-${new Date().toISOString().split('T')[0]}.pdf`;
          break;
        }

        // Get chapters and course_progress for accurate progress calculation (same as Course Analytics)
        const courseIdsForProgress = [...new Set(allEnrollments.map((e) => {
          const enrollment = e as { course_id?: string };
          return enrollment.course_id;
        }).filter(Boolean))];
        
        type ChapterData = {
          id?: string;
          course_id?: string;
          is_published?: boolean;
        };
        
        const { data: chapters } = await supabaseAdmin
          .from('chapters')
          .select('id, course_id, is_published')
          .in('course_id', courseIdsForProgress.length > 0 ? courseIdsForProgress : ['00000000-0000-0000-0000-000000000000'])
          .eq('is_published', true);

        type CourseProgressData = {
          student_id?: string;
          chapter_id?: string;
          completed?: boolean;
          course_id?: string;
        };
        
        const { data: courseProgress } = await supabaseAdmin
          .from('course_progress')
          .select('student_id, chapter_id, completed, course_id')
          .in('student_id', studentIds);
        
        logger.info('Processing student progress', {
          studentsCount: students.length,
          enrollmentsCount: allEnrollments.length,
          chaptersCount: chapters?.length || 0,
          courseProgressCount: courseProgress?.length || 0
        });

        // Add student school IDs to the schools map query (from students data)
        const studentSchoolIds: string[] = [...new Set(students.map((s: StudentWithIdData) => String(s.school_id || '')).filter((id: string) => id !== ''))] as string[];
        const allSchoolIdsWithStudents: string[] = [...new Set([...allSchoolIds, ...studentSchoolIds])];
        
        // Fetch any additional schools from student school assignments that weren't already fetched
        const missingSchoolIds = allSchoolIdsWithStudents.filter((id: string) => !allSchoolIds.includes(id));
        
        if (missingSchoolIds.length > 0) {
          const { data: additionalSchools, error: additionalSchoolsError } = await supabaseAdmin
            .from('schools')
            .select('id, name')
            .in('id', missingSchoolIds);
          
          if (!additionalSchoolsError && additionalSchools) {
            (additionalSchools || []).forEach((school: School) => {
              if (school.id) {
                schoolsMap.set(school.id, school.name);
              }
            });
          }
        }
        
        // Also add schools from students data directly to the map
        students.forEach((student: StudentWithIdData & { schools?: { name?: string } }) => {
          if (student.school_id && student.schools?.name) {
            schoolsMap.set(student.school_id, student.schools.name);
          }
        });

        // Build progress data - calculate actual progress from course_progress table (same as Course Analytics)
        interface ProgressData {
          student_name?: string;
          student_email?: string;
          course_name?: string;
          course_subject?: string;
          course_grade?: string;
          school_name?: string;
          student_grade?: string;
          progress_percentage?: number;
          is_completed?: boolean;
          enrolled_at?: string | null;
          completed_at?: string | null;
          completed_chapters?: number;
          total_chapters?: number;
        }
        
        const progressData: ProgressData[] = [];
        
        // Create a map of student data for quick lookup
        const studentMap = new Map<string, { full_name?: string; email?: string; school_id?: string; school_name?: string; grade?: string }>();
        students.forEach((student: StudentWithIdData & { profiles?: { full_name?: string; email?: string }; schools?: { name?: string } }) => {
          const studentId = student.student_id;
          if (!studentId) return;
          studentMap.set(studentId, {
            full_name: student.profiles?.full_name || 'Unknown',
            email: student.profiles?.email || 'N/A',
            school_id: student.school_id,
            school_name: student.schools?.name || 'N/A',
            grade: student.grade || 'N/A'
          });
        });

        // Process each enrollment and calculate actual progress
        type EnrollmentWithDetails = {
          course_id?: string;
          student_id?: string;
          courses?: Course;
          enrolled_on?: string | null;
          enrolled_at?: string | null;
          completed_at?: string | null;
        };
        
        allEnrollments.forEach((enrollment: EnrollmentWithDetails) => {
          const studentId = enrollment.student_id;
          if (!studentId) return;
          const student = studentMap.get(studentId);
          const course = enrollment.courses || courses.find((c: Course) => c.id === enrollment.course_id);
          
          if (!student || !course || !course.id) return;

          // Calculate actual progress from course_progress table (same as Course Analytics)
          const courseChapters = chapters?.filter((ch: ChapterData) => ch.course_id === course.id) || [];
          const totalChapters = courseChapters.length;
          
          // Get completed chapters for this student and course
          const chapterIds = courseChapters.map((ch: ChapterData) => ch.id).filter((id): id is string => !!id);
          const completedChapters = courseProgress?.filter((cp: CourseProgressData) => 
            cp.student_id === studentId && 
            cp.chapter_id && chapterIds.includes(cp.chapter_id) && 
            cp.completed
          ).length || 0;

          // Calculate actual progress percentage (same as Course Analytics)
          const progressPct = (enrollment as { progress_percentage?: number }).progress_percentage;
          const actualProgress = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : (progressPct || 0);
          const isCompleted = actualProgress >= 100;

          const courseData = course as Course & { subject?: string; grade?: string; name?: string };
          progressData.push({
            student_name: student.full_name,
            student_email: student.email,
            course_name: courseData.course_name || courseData.name || courseData.title || 'N/A',
            course_subject: courseData.subject || 'N/A',
            course_grade: courseData.grade || 'N/A',
            school_name: student.school_name,
            student_grade: student.grade,
            progress_percentage: actualProgress,
            is_completed: isCompleted,
            enrolled_at: enrollment.enrolled_on || enrollment.enrolled_at,
            completed_at: isCompleted ? (enrollment.completed_at || enrollment.enrolled_on || enrollment.enrolled_at) : null,
            completed_chapters: completedChapters,
            total_chapters: totalChapters
          });
        });

        logger.info('Course Progress Report data', {
          totalRecords: progressData.length,
          sample: progressData.slice(0, 3).map((p: ProgressData) => ({
            student: p.student_name,
            course: p.course_name,
            progress: p.progress_percentage
          }))
        });

        if (progressData.length === 0) {
          logger.warn('No student progress data after filtering');
          pdfDoc = new jsPDF();
          pdfDoc.setFontSize(18);
          pdfDoc.text('Course Progress Report', 14, 22);
          pdfDoc.setFontSize(11);
          pdfDoc.setTextColor(100);
          pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
          pdfDoc.setFontSize(12);
          pdfDoc.text('No student progress data found matching the selected filters', 14, 50);
          filename = `course-progress-report-${new Date().toISOString().split('T')[0]}.pdf`;
          break;
        }
        
        pdfDoc = new jsPDF();
        pdfDoc.setFontSize(18);
        pdfDoc.text('Course Progress Report', 14, 22);
        pdfDoc.setFontSize(11);
        pdfDoc.setTextColor(100);
        pdfDoc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
        pdfDoc.text(`Total Student Progress Records: ${progressData.length}`, 14, 36);

        const tableData = progressData.map((progress: ProgressData) => [
          String(progress.student_name || 'N/A'),
          String(progress.student_email || 'N/A'),
          String(progress.course_name || 'N/A'),
          String(progress.school_name || 'N/A'),
          String(progress.student_grade || 'N/A'),
          String(Math.round(progress.progress_percentage || 0)) + '%',
          (progress.total_chapters ?? 0) > 0 
            ? `${progress.completed_chapters || 0}/${progress.total_chapters} chapters`
            : 'N/A',
          progress.is_completed ? 'Yes' : 'No',
          progress.enrolled_at ? new Date(progress.enrolled_at).toLocaleDateString() : 'N/A',
          progress.completed_at ? new Date(progress.completed_at).toLocaleDateString() : 'N/A'
        ]);
          autoTable(pdfDoc, {
            head: [['Student Name', 'Email', 'Course', 'School', 'Student Grade', 'Progress %', 'Chapters Completed', 'Completed', 'Enrolled Date', 'Completed Date']],
            body: tableData,
            startY: 42,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            margin: { top: 42, left: 14, right: 14 },
            columnStyles: {
              0: { cellWidth: 35 }, // Student Name
              1: { cellWidth: 40 }, // Email
              2: { cellWidth: 35 }, // Course
              3: { cellWidth: 30 }, // School
              4: { cellWidth: 20 }, // Student Grade
              5: { cellWidth: 18, fontStyle: 'bold' }, // Progress % - make it bold
              6: { cellWidth: 22 }, // Chapters Completed
              7: { cellWidth: 18 }, // Completed
              8: { cellWidth: 25 }, // Enrolled Date
              9: { cellWidth: 25 }  // Completed Date
            }
          });

        filename = `course-progress-report-${new Date().toISOString().split('T')[0]}.pdf`;
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid report type' },
          { status: 400 }
        );
    }

    // Generate PDF as buffer - handle jsPDF v3 API
    let pdfBuffer: Buffer;
    let pdfArrayBuffer: ArrayBuffer;
    try {
      const pdfOutput = pdfDoc.output('arraybuffer');
      pdfArrayBuffer = pdfOutput;
      pdfBuffer = Buffer.from(pdfOutput);
    } catch (outputError) {
      logger.error('Error generating PDF buffer', { error: outputError });
      throw new Error(`Failed to generate PDF: ${outputError instanceof Error ? outputError.message : 'Unknown error'}`);
    }

    // Return PDF with proper headers
    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    const errorDetails = {
      endpoint: '/api/admin/reports',
      reportType: reportType || 'unknown',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'UnknownError'
    };
    
    logger.error('Unexpected error in GET /api/admin/reports', errorDetails, error instanceof Error ? error : new Error(String(error)));
    
    // Return detailed error for debugging (but don't expose stack in production)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return NextResponse.json(
      { 
        error: 'Failed to generate report',
        message: errorMessage,
        reportType: reportType || 'unknown',
        ...(isDevelopment && { details: errorDetails })
      },
      { status: 500 }
    );
  }
}
