"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { FileText } from "lucide-react";
import { useTeacherReports } from "../../hooks/useTeacherData";
import { SkeletonTable } from "../ui/skeleton-table";

interface TeacherReportsTabProps {
  selectedSchoolId?: string;
}

export default function TeacherReportsTab({ selectedSchoolId }: TeacherReportsTabProps) {
  const { data: reports, isLoading: reportsLoading } = useTeacherReports(selectedSchoolId, { limit: 10 });

  if (reportsLoading) {
    return <SkeletonTable columns={4} rows={5} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Reports</CardTitle>
              <CardDescription>Your submitted teaching reports</CardDescription>
            </div>
            <Link href="/teacher/reports">
              <Button size="sm">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {reports && reports.length > 0 ? (
            <div className="space-y-3">
              {reports.map((report: any) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    {(() => {
                      // Handle both array and object formats for classes
                      const classData = Array.isArray(report.classes) ? report.classes[0] : report.classes;
                      return (
                        <>
                          <p className="font-medium">{report.grade || classData?.grade || 'N/A'}</p>
                          <p className="text-sm text-gray-600">
                            {report.topics_taught?.substring(0, 100) || 'No topics listed'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(report.date).toLocaleDateString()} • {new Date(report.created_at).toLocaleTimeString()}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                  <Badge variant={
                    report.report_status === 'Approved' ? 'default' :
                    report.report_status === 'Flagged' ? 'destructive' :
                    'secondary'
                  }>
                    {report.report_status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No reports submitted yet</p>
              <Link href="/teacher/reports">
                <Button className="mt-4" size="sm">Submit Your First Report</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


