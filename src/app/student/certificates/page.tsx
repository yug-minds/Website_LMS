"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Progress } from "../../../components/ui/progress";
import { 
  Award,
  Download,
  Eye,
  CheckCircle,
  Clock,
  BookOpen,
  Trophy,
  Star,
  Loader2
} from "lucide-react";
import { useStudentCertificates, useStudentCourses } from "../../../hooks/useStudentData";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "../../../components/ui/toast";

export default function CertificatesPage() {
  const { data: certificates, isLoading: certificatesLoading } = useStudentCertificates();
  const { data: courses, isLoading: coursesLoading } = useStudentCourses();
  const queryClient = useQueryClient();
  const [generatingCertId, setGeneratingCertId] = useState<string | null>(null);

  // Filter courses eligible for certificates (80%+ completion)
  // Note: We check progress_percentage >= 80, regardless of status
  const eligibleCourses = courses?.filter((course: any) => 
    course.progress_percentage >= 80
  ) || [];

  const inProgressCourses = courses?.filter((course: any) => 
    course.progress_percentage < 80
  ) || [];

  // Check which eligible courses don't have certificates yet
  // Only show "Generate Certificate" button if:
  // 1. Course is 80%+ complete (already filtered above)
  // 2. No certificate exists with a valid URL
  const eligibleCoursesWithoutCert = eligibleCourses.filter((course: any) => {
    if (!certificates || certificates.length === 0) {
      // No certificates at all, so button should show
      return true;
    }
    
    // Check if certificate exists for this course with a valid URL
    const hasCertificateWithUrl = certificates.some((cert: any) => {
      // Check both course_id (direct field) and courses?.id (from joined data) for compatibility
      const courseMatches = cert.course_id === course.id || cert.courses?.id === course.id;
      const hasValidUrl = cert.certificate_url && 
                         typeof cert.certificate_url === 'string' && 
                         cert.certificate_url.trim() !== '';
      return courseMatches && hasValidUrl;
    });
    
    // Only show button if NO certificate with valid URL exists
    return !hasCertificateWithUrl;
  });

  // Handle manual certificate generation (fallback)
  const handleRequestCertificate = async (courseId: string) => {
    setGeneratingCertId(courseId);
    try {
      const response = await fetch('/api/student/certificates/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ courseId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Certificate generated successfully!');
        // Refresh certificates list
        queryClient.invalidateQueries({ queryKey: ['studentCertificates'] });
      } else {
        toast.error(data.error || 'Failed to generate certificate. Please try again later.');
      }
    } catch (error) {
      console.error('Error generating certificate:', error);
      toast.error('An error occurred. Please try again later.');
    } finally {
      setGeneratingCertId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Certificates & Achievements</h1>
        <p className="text-gray-600 mt-2">Track your achievements and download certificates</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Earned Certificates</CardTitle>
            <Award className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{certificates?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total certificates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eligible Courses</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{eligibleCourses.length}</div>
            <p className="text-xs text-muted-foreground">Ready for certificate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{inProgressCourses.length}</div>
            <p className="text-xs text-muted-foreground">Courses to complete</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Earned Certificates */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Earned Certificates</CardTitle>
              <CardDescription>Download and share your achievements</CardDescription>
            </CardHeader>
            <CardContent>
              {certificatesLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : certificates && certificates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {certificates.map((cert: any) => (
                    <div key={cert.id} className="border rounded-lg p-4 bg-gradient-to-br from-yellow-50 to-orange-50">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                          <Trophy className="h-6 w-6 text-yellow-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{cert.certificate_name}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {cert.courses?.name || cert.courses?.title || 'Course'}
                          </p>
                          {(cert.courses?.grade || cert.courses?.subject) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {cert.courses?.grade ? `${cert.courses.grade} • ` : ''}{cert.courses?.subject || ''}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="border-t pt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span>Issued</span>
                          <span>{new Date(cert.issued_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span>Issued By</span>
                          <span>{cert.profiles?.full_name || 'System'}</span>
                        </div>
                      </div>

                      {/* Certificate Preview */}
                      {cert.certificate_url ? (
                        <>
                          <div className="mb-4 border rounded-lg overflow-hidden bg-white">
                            <img 
                              src={cert.certificate_url} 
                              alt={cert.certificate_name}
                              className="w-full h-auto object-contain"
                              loading="lazy"
                            />
                          </div>
                          
                          <div className="flex gap-2 mt-4">
                            <a 
                              href={cert.certificate_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex-1"
                            >
                              <Button variant="outline" size="sm" className="w-full">
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </Button>
                            </a>
                            <a 
                              href={cert.certificate_url} 
                              download
                              className="flex-1"
                            >
                              <Button size="sm" className="w-full bg-yellow-600 hover:bg-yellow-700">
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            </a>
                          </div>
                        </>
                      ) : (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-700">
                            <Clock className="h-4 w-4 inline mr-2" />
                            Certificate is being generated. Please check back in a few moments.
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Award className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No certificates yet</p>
                  <p className="text-sm mt-2">Complete courses to earn certificates</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Eligible Courses Without Certificates (Fallback Manual Generation) */}
          {eligibleCoursesWithoutCert.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ready for Certificate</CardTitle>
                <CardDescription>
                  Certificates are generated automatically. Use this button if your certificate hasn't appeared yet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {eligibleCoursesWithoutCert.map((course: any) => (
                    <div key={course.id} className="border rounded-lg p-4 bg-green-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{course.name || course.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {course.grade} • {course.subject}
                          </p>
                          <div className="mt-2">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-600">Completion</span>
                              <span className="font-medium text-green-600">
                                {course.progress_percentage?.toFixed(0)}%
                              </span>
                            </div>
                            <Progress value={course.progress_percentage} className="h-2" />
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          className="ml-4 bg-green-600 hover:bg-green-700"
                          onClick={() => handleRequestCertificate(course.id)}
                          disabled={generatingCertId === course.id}
                        >
                          {generatingCertId === course.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Award className="h-4 w-4 mr-2" />
                              Generate Certificate
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Achievement Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Achievement Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{certificates?.length || 0}</p>
                  <p className="text-xs text-gray-600">Certificates Earned</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{courses?.filter((c: any) => c.status === 'completed').length || 0}</p>
                  <p className="text-xs text-gray-600">Courses Completed</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Star className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-lg">
                    {courses && courses.length > 0
                       
                      ? Math.round(courses.reduce((acc: number, c: any) => acc + (c.average_grade || 0), 0) / courses.length)
                      : 0}%
                  </p>
                  <p className="text-xs text-gray-600">Average Grade</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* In Progress Courses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Complete These Next</CardTitle>
              <CardDescription>Courses in progress</CardDescription>
            </CardHeader>
            <CardContent>
              {inProgressCourses.length > 0 ? (
                <div className="space-y-3">
                  {inProgressCourses.slice(0, 5).map((course: any) => (
                    <Link key={course.id} href={`/student/my-courses/${course.id}`}>
                      <div className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                        <h4 className="text-sm font-medium text-gray-900 line-clamp-1">
                          {course.name || course.title}
                        </h4>
                        <div className="mt-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600">Progress</span>
                            <span className="font-medium">{course.progress_percentage?.toFixed(0)}%</span>
                          </div>
                          <Progress value={course.progress_percentage} className="h-1.5" />
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          {80 - course.progress_percentage > 0 
                            ? `${(80 - course.progress_percentage).toFixed(0)}% to certificate`
                            : 'Ready for certificate!'
                          }
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">No courses in progress</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Certificate Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Certificate Requirements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-600">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Complete 80% of course chapters</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Submit all required assignments</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Achieve passing grade (60%+)</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Maintain 75%+ attendance</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
