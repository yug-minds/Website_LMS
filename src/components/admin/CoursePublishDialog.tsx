"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Eye,
  EyeOff
} from "lucide-react";
import { fetchWithCsrf } from "../../lib/csrf-client";

interface CoursePublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: {
    id: string;
    name: string;
    status: 'Draft' | 'Published' | 'Archived';
    is_published?: boolean;
    school_ids?: string[];
    grades?: string[];
  };
  onPublishChange: () => void;
}

export function CoursePublishDialog({
  open,
  onOpenChange,
  course,
  onPublishChange,
}: CoursePublishDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changesSummary, setChangesSummary] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const isPublished = course.status === 'Published' || course.is_published === true;
  const action = isPublished ? "unpublish" : "publish";
  const requiresConfirmation = isPublished; // Unpublishing requires confirmation

  const handlePublish = async () => {
    if (requiresConfirmation && confirmText.toLowerCase() !== "unpublish") {
      setError("Please type 'unpublish' to confirm");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('📤 Publishing course:', {
        courseId: course.id,
        courseName: course.name,
        publish: !isPublished,
        url: `/api/admin/courses/${course.id}/publish`,
      });

      const response = await fetchWithCsrf(
        `/api/admin/courses/${course.id}/publish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            course_id: course.id,
            publish: !isPublished,
            changes_summary: changesSummary.trim() || undefined,
          }),
        }
      );

      console.log('📥 Publish response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: "Failed to update publish status",
        }));
        
        console.error('❌ Publish error:', errorData);
        
        throw new Error(errorData.error || errorData.details || "Failed to update publish status");
      }

      onPublishChange();
      onOpenChange(false);
      setChangesSummary("");
      setConfirmText("");
      // Show success message
      alert(`✅ Course ${!isPublished ? 'published' : 'unpublished'} successfully!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update publish status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPublished ? (
              <>
                <EyeOff className="h-5 w-5 text-amber-600" />
                Unpublish Course
              </>
            ) : (
              <>
                <Eye className="h-5 w-5 text-green-600" />
                Publish Course
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isPublished
              ? "Unpublishing this course will make it unavailable to students. You can republish it later."
              : "Publishing this course will make it immediately available to assigned schools and grades."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Course Info */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">{course.name}</h4>
              <Badge variant={isPublished ? "default" : "secondary"}>
                {course.status}
              </Badge>
            </div>
            {course.school_ids && course.school_ids.length > 0 && (
              <p className="text-sm text-gray-600">
                Assigned to {course.school_ids.length} school{course.school_ids.length !== 1 ? "s" : ""}
              </p>
            )}
            {course.grades && course.grades.length > 0 && (
              <p className="text-sm text-gray-600">
                Grades: {course.grades.join(", ")}
              </p>
            )}
          </div>

          {/* Changes Summary (only when publishing) */}
          {!isPublished && (
            <div>
              <Label htmlFor="changes-summary">
                Changes Summary (optional)
              </Label>
              <Textarea
                id="changes-summary"
                value={changesSummary}
                onChange={(e) => setChangesSummary(e.target.value)}
                placeholder="Describe what's new in this version..."
                rows={3}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                This summary will be saved with the version history
              </p>
            </div>
          )}

          {/* Confirmation for unpublishing */}
          {isPublished && (
            <div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This action will make the course unavailable to students. Type{" "}
                  <strong>unpublish</strong> to confirm.
                </AlertDescription>
              </Alert>
              <div className="mt-4">
                <Label htmlFor="confirm-text">Type 'unpublish' to confirm</Label>
                <input
                  id="confirm-text"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="unpublish"
                  className="mt-1 w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          {/* Impact Preview */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h5 className="font-medium text-sm mb-2">What will happen:</h5>
            <ul className="text-sm text-gray-700 space-y-1">
              {isPublished ? (
                <>
                  <li>• Course will be marked as Draft</li>
                  <li>• Students will no longer see this course</li>
                  <li>• Existing enrollments will remain but course will be hidden</li>
                  <li>• You can republish at any time</li>
                </>
              ) : (
                <>
                  <li>• Course will be marked as Published</li>
                  <li>• A new version will be created in version history</li>
                  <li>• Course will be immediately visible to assigned students</li>
                  <li>• Students matching school and grade will be auto-enrolled</li>
                </>
              )}
            </ul>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setError(null);
              setChangesSummary("");
              setConfirmText("");
            }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handlePublish}
            disabled={loading || (requiresConfirmation && confirmText.toLowerCase() !== "unpublish")}
            variant={isPublished ? "destructive" : "default"}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isPublished ? "Unpublishing..." : "Publishing..."}
              </>
            ) : (
              <>
                {isPublished ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Unpublish
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Publish Course
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

