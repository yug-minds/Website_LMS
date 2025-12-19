"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Circle,
  BookOpen,
  School,
  FileText,
  Eye,
  AlertCircle,
  Loader2
} from "lucide-react";
import { SchoolGradeSelector } from "./SchoolGradeSelector";
import { FileUploadZone } from "./FileUploadZone";
import { ChapterContentManager, ChapterContent } from "./ChapterContentManager";
import { AssignmentBuilder, Assignment } from "./AssignmentBuilder";
import { fetchWithCsrf } from "../../lib/csrf-client";
import { 
  saveCourseFormState, 
  loadCourseFormState, 
  clearCourseFormState,
  type CourseFormState 
} from "../../lib/course-form-persistence";

export interface Chapter {
  id?: string;
  course_id?: string;
  name: string;
  description?: string;
  learning_outcomes: string[];
  order_number: number;
}

interface CourseCreationWizardProps {
  courseId?: string; // If provided, we're editing
  initialData?: {
    name?: string;
    description?: string;
    duration_weeks?: number;
    prerequisites_course_ids?: string[];
    prerequisites_text?: string;
    thumbnail_url?: string;
    school_ids?: string[];
    grades?: string[];
    chapters?: Chapter[];
  };
  onComplete: (courseData: any) => void;
  onCancel: () => void;
}

const STEPS = [
  { id: 1, title: "Basic Information", icon: BookOpen },
  { id: 2, title: "School & Grade", icon: School },
  { id: 3, title: "Chapters & Content", icon: FileText },
  { id: 4, title: "Review & Publish", icon: Eye },
];

export function CourseCreationWizard({
  courseId,
  initialData,
  onComplete,
  onCancel,
}: CourseCreationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step 1: Basic Information
  const [basicInfo, setBasicInfo] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    duration_weeks: initialData?.duration_weeks?.toString() || "",
    prerequisites_text: initialData?.prerequisites_text || "",
    prerequisites_course_ids: initialData?.prerequisites_course_ids || [] as string[],
    thumbnail_url: initialData?.thumbnail_url || "",
    difficulty_level: (initialData as any)?.difficulty_level || "Beginner",
  });

  // Step 2: School & Grade
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>(
    initialData?.school_ids || []
  );
  const [selectedGrades, setSelectedGrades] = useState<string[]>(
    initialData?.grades || []
  );

  // Step 3: Chapters
  const [chapters, setChapters] = useState<Chapter[]>(
    initialData?.chapters || []
  );
  const [chapterContents, setChapterContents] = useState<Record<string, ChapterContent[]>>({});
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [availableCourses, setAvailableCourses] = useState<Array<{ id: string; name: string }>>([]);

  // Load available courses for prerequisites
  useEffect(() => {
    if (currentStep === 1) {
      loadAvailableCourses();
    }
  }, [currentStep]);

  // Auto-save form state
  useEffect(() => {
    const formState: Partial<CourseFormState> = {
      formData: {
        name: basicInfo.name,
        description: basicInfo.description,
        school_ids: selectedSchoolIds,
        grades: selectedGrades,
        total_chapters: chapters.length,
        total_videos: 0,
        total_materials: 0,
        total_assignments: Object.keys(assignments).length,
        release_type: 'Weekly',
        status: 'Draft',
      },
      chapters: chapters,
      uiState: {
        currentStep,
        selectedSchools: selectedSchoolIds,
        selectedGrades: selectedGrades,
        currentChapterIndex: -1,
      },
    };
    saveCourseFormState(formState);
  }, [basicInfo, selectedSchoolIds, selectedGrades, chapters, currentStep, assignments]);

  const loadAvailableCourses = async () => {
    try {
      const response = await fetchWithCsrf("/api/admin/courses", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        const courses = (data.courses || []).filter((c: any) => 
          !courseId || c.id !== courseId
        ).map((c: any) => ({
          id: c.id,
          name: c.name || c.course_name || c.title || "Untitled Course",
        }));
        setAvailableCourses(courses);
      }
    } catch (error) {
      console.error("Error loading courses:", error);
    }
  };

  const validateStep = (step: number): boolean => {
    setError(null);
    
    switch (step) {
      case 1:
        if (!basicInfo.name.trim()) {
          setError("Course name is required");
          return false;
        }
        return true;
      
      case 2:
        if (selectedSchoolIds.length === 0) {
          setError("Please select at least one school");
          return false;
        }
        if (selectedGrades.length === 0) {
          setError("Please select at least one grade");
          return false;
        }
        return true;
      
      case 3:
        if (chapters.length === 0) {
          setError("Please add at least one chapter");
          return false;
        }
        // Validate each chapter has a name
        for (const chapter of chapters) {
          if (!chapter.name.trim()) {
            setError("All chapters must have a name");
            return false;
          }
        }
        return true;
      
      case 4:
        return true; // Review step is always valid
      
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleThumbnailUpload = (fileUrl: string) => {
    setBasicInfo({ ...basicInfo, thumbnail_url: fileUrl });
  };

  // Generate UUID for new chapters
  const generateChapterId = () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `chapter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  const addChapter = () => {
    const newChapter: Chapter = {
      id: generateChapterId(), // Generate UUID for new chapter
      name: "",
      description: "",
      learning_outcomes: [],
      order_number: chapters.length + 1,
    };
    setChapters([...chapters, newChapter]);
  };

  const updateChapter = (index: number, updates: Partial<Chapter>) => {
    const updated = [...chapters];
    updated[index] = { ...updated[index], ...updates };
    setChapters(updated);
  };

  const deleteChapter = (index: number) => {
    if (confirm("Are you sure you want to delete this chapter?")) {
      const updated = chapters.filter((_, i) => i !== index);
      // Reorder remaining chapters
      updated.forEach((ch, i) => {
        ch.order_number = i + 1;
      });
      setChapters(updated);
      
      // Clean up associated data
      const chapterId = chapters[index].id;
      if (chapterId) {
        delete chapterContents[chapterId];
        delete assignments[chapterId];
      }
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      setCurrentStep(1);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const courseData = {
        id: courseId,
        name: basicInfo.name,
        description: basicInfo.description || undefined,
        duration_weeks: basicInfo.duration_weeks ? parseInt(basicInfo.duration_weeks) : undefined,
        prerequisites_course_ids: basicInfo.prerequisites_course_ids.length > 0 
          ? basicInfo.prerequisites_course_ids 
          : undefined,
        prerequisites_text: basicInfo.prerequisites_text || undefined,
        thumbnail_url: basicInfo.thumbnail_url || undefined,
        difficulty_level: basicInfo.difficulty_level || "Beginner",
        school_ids: selectedSchoolIds,
        grades: selectedGrades,
        chapters: chapters.map((ch: any) => ({
          ...ch,
          name: ch.name.trim(),
        })),
        chapter_contents: Object.entries(chapterContents).flatMap(([chapterId, contents]) =>
          contents.map((content, idx) => ({
            ...content,
            chapter_id: chapterId, // This should be the chapter UUID or temp ID
            order_index: content.order_index || idx + 1, // Ensure order_index is set
          }))
        ),
        assignments: Object.entries(assignments).map(([chapterId, assignment]) => ({
          ...assignment,
          chapter_id: chapterId,
        })),
        status: 'Draft',
      };

      clearCourseFormState();
      onComplete(courseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save course");
    } finally {
      setLoading(false);
    }
  };

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {courseId ? "Edit Course" : "Create New Course"}
          </DialogTitle>
          <DialogDescription>
            Follow the steps to create a comprehensive course
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              const Icon = isCompleted ? CheckCircle2 : isActive ? StepIcon : Circle;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      isActive 
                        ? "border-blue-500 bg-blue-50 text-blue-600" 
                        : isCompleted
                        ? "border-green-500 bg-green-50 text-green-600"
                        : "border-gray-300 bg-white text-gray-400"
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className={`text-xs mt-1 ${isActive ? "font-medium text-blue-600" : "text-gray-500"}`}>
                      {step.title}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${
                      isCompleted ? "bg-green-500" : "bg-gray-300"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-sm text-red-600">{error}</span>
          </div>
        )}

        {/* Step Content */}
        <div className="min-h-[400px]">
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="course-name">
                  Course Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="course-name"
                  value={basicInfo.name}
                  onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
                  placeholder="Enter course name"
                />
              </div>

              <div>
                <Label htmlFor="course-description">Description</Label>
                <Textarea
                  id="course-description"
                  value={basicInfo.description}
                  onChange={(e) => setBasicInfo({ ...basicInfo, description: e.target.value })}
                  placeholder="Enter course description"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="duration">Duration (weeks)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    value={basicInfo.duration_weeks}
                    onChange={(e) => setBasicInfo({ ...basicInfo, duration_weeks: e.target.value })}
                    placeholder="e.g., 8"
                  />
                </div>
                <div>
                  <Label htmlFor="difficulty">Difficulty Level</Label>
                  <Select
                    value={basicInfo.difficulty_level}
                    onValueChange={(value) => setBasicInfo({ ...basicInfo, difficulty_level: value })}
                  >
                    <SelectTrigger id="difficulty">
                      <SelectValue placeholder="Select difficulty level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Beginner">Beginner</SelectItem>
                      <SelectItem value="Intermediate">Intermediate</SelectItem>
                      <SelectItem value="Advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Prerequisites</Label>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="prerequisites-text" className="text-sm font-normal">
                      Prerequisites Description
                    </Label>
                    <Textarea
                      id="prerequisites-text"
                      value={basicInfo.prerequisites_text}
                      onChange={(e) => setBasicInfo({ ...basicInfo, prerequisites_text: e.target.value })}
                      placeholder="e.g., Basic programming knowledge recommended"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-normal">Prerequisite Courses</Label>
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (value && !basicInfo.prerequisites_course_ids.includes(value)) {
                          setBasicInfo({
                            ...basicInfo,
                            prerequisites_course_ids: [...basicInfo.prerequisites_course_ids, value],
                          });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select prerequisite course" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCourses.map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {basicInfo.prerequisites_course_ids.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {basicInfo.prerequisites_course_ids.map((courseId) => {
                          const course = availableCourses.find((c: any) => c.id === courseId);
                          return (
                            <Badge key={courseId} variant="secondary" className="flex items-center gap-1">
                              {course?.name || courseId}
                              <button
                                type="button"
                                onClick={() => {
                                  setBasicInfo({
                                    ...basicInfo,
                                    prerequisites_course_ids: basicInfo.prerequisites_course_ids.filter((id: any) => id !== courseId),
                                  });
                                }}
                                className="ml-1"
                              >
                                <span className="sr-only">Remove</span>
                                ×
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label>Course Thumbnail</Label>
                <FileUploadZone
                  type="thumbnail"
                  courseId={courseId}
                  onUploadComplete={handleThumbnailUpload}
                  label="Upload thumbnail image"
                  description="Recommended: 800x600px, max 5MB"
                />
                {basicInfo.thumbnail_url && (
                  <div className="mt-2 relative h-32 w-48">
                    <Image
                      src={basicInfo.thumbnail_url}
                      alt="Course thumbnail"
                      fill
                      className="object-contain rounded border"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <SchoolGradeSelector
              selectedSchoolIds={selectedSchoolIds}
              selectedGrades={selectedGrades}
              onSchoolChange={setSelectedSchoolIds}
              onGradeChange={setSelectedGrades}
              required
              error={error || undefined}
            />
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Chapters</h3>
                  <p className="text-sm text-gray-500">
                    Add chapters and organize course content
                  </p>
                </div>
                <Button type="button" onClick={addChapter}>
                  <span className="mr-1">+</span> Add Chapter
                </Button>
              </div>

              {chapters.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-gray-500">No chapters added yet</p>
                    <Button type="button" onClick={addChapter} className="mt-4">
                      Add First Chapter
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {chapters.map((chapter, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <Input
                              value={chapter.name}
                              onChange={(e) => updateChapter(index, { name: e.target.value })}
                              placeholder="Chapter name"
                              className="font-medium"
                            />
                            <Textarea
                              value={chapter.description || ""}
                              onChange={(e) => updateChapter(index, { description: e.target.value })}
                              placeholder="Chapter description"
                              rows={2}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              deleteChapter(index);
                            }}
                            title="Delete chapter"
                          >
                            Delete
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <ChapterContentManager
                          chapterId={chapter.id || generateChapterId()}
                          chapterName={chapter.name || `Chapter ${index + 1}`}
                          contents={chapterContents[chapter.id || `temp-${index}`] || []}
                          onContentsChange={(contents) => {
                            const chapterKey = chapter.id || `temp-${index}`;
                            setChapterContents({
                              ...chapterContents,
                              [chapterKey]: contents,
                            });
                          }}
                          courseId={courseId}
                        />
                        <AssignmentBuilder
                          chapterId={chapter.id || generateChapterId()}
                          chapterName={chapter.name || `Chapter ${index + 1}`}
                          assignment={assignments[chapter.id || `temp-${index}`] || null}
                          onAssignmentChange={(assignment) => {
                            const chapterKey = chapter.id || `temp-${index}`;
                            if (assignment) {
                              setAssignments({
                                ...assignments,
                                [chapterKey]: assignment,
                              });
                            } else {
                              const updated = { ...assignments };
                              delete updated[chapterKey];
                              setAssignments(updated);
                            }
                          }}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Review Course Details</h3>
              
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="font-medium">Name:</span> {basicInfo.name}
                  </div>
                  {basicInfo.description && (
                    <div>
                      <span className="font-medium">Description:</span> {basicInfo.description}
                    </div>
                  )}
                  {basicInfo.duration_weeks && (
                    <div>
                      <span className="font-medium">Duration:</span> {basicInfo.duration_weeks} weeks
                    </div>
                  )}
                  {basicInfo.difficulty_level && (
                    <div>
                      <span className="font-medium">Difficulty Level:</span> {basicInfo.difficulty_level}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>School & Grade Assignment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <span className="font-medium">Schools:</span> {selectedSchoolIds.length} selected
                  </div>
                  <div>
                    <span className="font-medium">Grades:</span> {selectedGrades.join(", ")}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Chapters</CardTitle>
                </CardHeader>
                <CardContent>
                  <div>
                    <span className="font-medium">Total Chapters:</span> {chapters.length}
                  </div>
                  <div>
                    <span className="font-medium">Total Assignments:</span> {Object.keys(assignments).length}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Navigation */}
        <DialogFooter className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={currentStep === 1 ? onCancel : handlePrevious}
            disabled={loading}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {currentStep === 1 ? "Cancel" : "Previous"}
          </Button>
          
          <div className="flex gap-2">
            {currentStep < STEPS.length ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={loading}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Save Course
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

