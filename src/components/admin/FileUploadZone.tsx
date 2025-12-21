"use client";

import { useState, useRef, useCallback } from "react";
import NextImage from "next/image";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Alert, AlertDescription } from "../ui/alert";
import { Upload, X, File, Image, FileVideo, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { fetchWithCsrf } from "../../lib/csrf-client";
import { cn } from "../../lib/utils";

interface FileUploadZoneProps {
  onUploadComplete: (fileUrl: string, filePath?: string) => void;
  onUploadError?: (error: string) => void;
  accept?: string;
  maxSize?: number; // in bytes
  type: "video" | "material" | "thumbnail";
  courseId?: string;
  chapterId?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

const FILE_TYPE_ICONS = {
  video: FileVideo,
  material: FileText,
  thumbnail: Image,
};

const MAX_FILE_SIZES = {
  video: 100 * 1024 * 1024, // 100MB
  material: 50 * 1024 * 1024, // 50MB
  thumbnail: 5 * 1024 * 1024, // 5MB
};

const ACCEPT_TYPES = {
  video: "video/*",
  material: ".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip",
  thumbnail: "image/*",
};

export function FileUploadZone({
  onUploadComplete,
  onUploadError,
  accept,
  maxSize,
  type,
  courseId,
  chapterId,
  disabled = false,
  className,
  label,
  description,
}: FileUploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const Icon = FILE_TYPE_ICONS[type];
  const maxFileSize = maxSize || MAX_FILE_SIZES[type];
  const acceptTypes = accept || ACCEPT_TYPES[type];

  // Validate file
  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
      return `File size exceeds maximum of ${maxSizeMB}MB`;
    }

    if (type === "thumbnail" && !file.type.startsWith("image/")) {
      return "Only image files are allowed for thumbnails";
    }

    if (type === "video" && !file.type.startsWith("video/")) {
      return "Only video files are allowed";
    }

    return null;
  };

  // Handle file selection
  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null);
      setProgress(0);

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        onUploadError?.(validationError);
        return;
      }

      // Set preview for images
      if (type === "thumbnail" && file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }

      setUploadedFile(file);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", type);
        if (courseId) formData.append("courseId", courseId);
        if (chapterId) formData.append("chapterId", chapterId);

        // Simulate progress (since we can't track actual upload progress easily)
        const progressInterval = setInterval(() => {
          setProgress((prev) => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return 90;
            }
            return prev + 10;
          });
        }, 200);

        const response = await fetchWithCsrf("/api/admin/upload", {
          method: "POST",
          body: formData,
        });

        clearInterval(progressInterval);
        setProgress(100);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: "Upload failed",
          }));
          throw new Error(errorData.error || errorData.details || "Upload failed");
        }

        const result = await response.json();
        if (!result.file || !result.file.url) {
          throw new Error("Upload failed: No file URL returned");
        }

        setUploadedFile(null);
        setProgress(0);
        onUploadComplete(result.file.url, result.file.path);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to upload file";
        setError(errorMessage);
        setUploadedFile(null);
        setProgress(0);
        onUploadError?.(errorMessage);
      } finally {
        setUploading(false);
      }
    },
    [validateFile, type, courseId, chapterId, maxFileSize, onUploadComplete, onUploadError]
  );

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (disabled || uploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Remove file
  const handleRemove = () => {
    setUploadedFile(null);
    setError(null);
    setProgress(0);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </label>
      )}
      {description && (
        <p className="text-sm text-gray-500">{description}</p>
      )}

      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 transition-colors",
          isDragging && "border-primary bg-primary/5",
          uploading && "border-blue-500 bg-blue-50",
          error && "border-red-500 bg-red-50",
          disabled && "opacity-50 cursor-not-allowed",
          !isDragging && !uploading && !error && "border-gray-300 hover:border-gray-400"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptTypes}
          onChange={handleFileInputChange}
          disabled={disabled || uploading}
          className="hidden"
          aria-label={label || `Upload ${type}`}
        />

        {uploading ? (
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
            <p className="text-sm text-gray-600">Uploading...</p>
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-gray-500">{progress}%</p>
          </div>
        ) : uploadedFile ? (
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <File className="h-8 w-8 text-green-500" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">{uploadedFile.name}</p>
                <p className="text-xs text-gray-500">
                  {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {previewUrl && (
              <div className="mt-2 relative h-32 w-full">
                <NextImage
                  src={previewUrl}
                  alt="Preview"
                  fill
                  className="object-contain rounded"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="text-center space-y-2">
            <Upload className="h-8 w-8 mx-auto text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">
                {isDragging ? "Drop file here" : "Drag and drop or click to upload"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Max size: {Math.round(maxFileSize / (1024 * 1024))}MB
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              Select File
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}





















