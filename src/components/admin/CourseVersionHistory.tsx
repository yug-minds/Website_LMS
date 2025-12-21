"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import { 
  History, 
  RotateCcw, 
  Calendar,
  User,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { fetchWithCsrf } from "../../lib/csrf-client";

interface CourseVersion {
  id: string;
  course_id: string;
  version_number: number;
  published_at: string;
  published_by?: string;
  published_by_name?: string;
  changes_summary?: string;
  course_data?: any;
}

interface CourseVersionHistoryProps {
  courseId: string;
  courseName: string;
  onVersionRevert?: () => void;
}

export function CourseVersionHistory({
  courseId,
  courseName,
  onVersionRevert,
}: CourseVersionHistoryProps) {
  const [versions, setVersions] = useState<CourseVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<CourseVersion | null>(null);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    if (courseId) {
      loadVersions();
    }
  }, [courseId]);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithCsrf(
        `/api/admin/courses/${courseId}/versions`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load version history");
      }

      const data = await response.json();
      setVersions(data.versions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const handleRevert = async () => {
    if (!selectedVersion) return;

    setReverting(true);
    try {
      const response = await fetchWithCsrf(
        `/api/admin/courses/${courseId}/versions`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            course_id: courseId,
            version_number: selectedVersion.version_number,
            create_new_version: true,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: "Failed to revert version",
        }));
        throw new Error(errorData.error || errorData.details || "Failed to revert version");
      }

      setRevertDialogOpen(false);
      setSelectedVersion(null);
      loadVersions();
      onVersionRevert?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revert version");
    } finally {
      setReverting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const sortedVersions = [...versions].sort(
    (a, b) => b.version_number - a.version_number
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </CardTitle>
            <CardDescription>
              Published versions of {courseName}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadVersions}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : sortedVersions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <History className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No published versions yet</p>
            <p className="text-sm">Versions are created when you publish the course</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedVersions.map((version, index) => (
              <div
                key={version.id}
                className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-medium">
                    v{version.version_number}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">
                      Version {version.version_number}
                      {index === 0 && (
                        <Badge variant="default" className="ml-2">
                          Latest
                        </Badge>
                      )}
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(version.published_at)}
                    </div>
                    {version.published_by_name && (
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {version.published_by_name}
                      </div>
                    )}
                  </div>
                  {version.changes_summary && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 mt-0.5 text-gray-400" />
                        <p className="text-gray-700">{version.changes_summary}</p>
                      </div>
                    </div>
                  )}
                </div>
                {index > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedVersion(version);
                      setRevertDialogOpen(true);
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Revert
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Revert Confirmation Dialog */}
        <Dialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revert to Version {selectedVersion?.version_number}</DialogTitle>
              <DialogDescription>
                This will restore the course to the state it was in when version{" "}
                {selectedVersion?.version_number} was published. A new version will be created.
              </DialogDescription>
            </DialogHeader>

            {selectedVersion && (
              <div className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This action will create a new version based on version{" "}
                    {selectedVersion.version_number}. All current changes will be lost.
                  </AlertDescription>
                </Alert>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h5 className="font-medium mb-2">Version Details:</h5>
                  <div className="text-sm space-y-1 text-gray-600">
                    <div>
                      <strong>Published:</strong> {formatDate(selectedVersion.published_at)}
                    </div>
                    {selectedVersion.changes_summary && (
                      <div>
                        <strong>Summary:</strong> {selectedVersion.changes_summary}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRevertDialogOpen(false);
                  setSelectedVersion(null);
                }}
                disabled={reverting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleRevert}
                disabled={reverting}
              >
                {reverting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reverting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Revert to This Version
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}





















