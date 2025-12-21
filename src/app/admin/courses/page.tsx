 
 
"use client"

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useSmartRefresh } from "../../../hooks/useSmartRefresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Textarea } from "../../../components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../../../components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../../../components/ui/table";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "../../../components/ui/tabs";
import { fetchWithCsrf } from '../../../lib/csrf-client';
import {
  saveCourseFormState,
  loadCourseFormState,
  clearCourseFormState,
  hasCourseFormState,
  showRecoveryDialog,
  useCourseFormAutoSave,
  type CourseFormState
} from '../../../lib/course-form-persistence';
import { CourseCreationWizard } from '../../../components/admin/CourseCreationWizard';
import { CourseEditor } from '../../../components/admin/CourseEditor';
import { CoursePublishDialog } from '../../../components/admin/CoursePublishDialog';
import { CourseVersionHistory } from '../../../components/admin/CourseVersionHistory';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  BookOpen,
  Search,
  Filter,
  School,
  Users,
  Calendar,
  Play,
  Pause,
  Archive,
  FileText,
  Video,
  FileImage,
  CheckSquare,
  ArrowRight,
  ArrowLeft,
  Save,
  Upload,
  Link,
  Clock,
  Target,
  PlusCircle,
  X,
  CheckCircle,
  AlertCircle,
  File,
  Download,
  Image,
  FileVideo,
   
  FileAudio,
  FolderOpen,
  Loader2,
  Trash2 as Trash2Icon,
  History
} from "lucide-react";

interface Course {
  id: string;
  name: string;
  course_name?: string; // For backward compatibility
  title?: string; // For backward compatibility
  description: string;
  created_by?: string;
  school_id?: string;
  grade?: string;
  status: 'Draft' | 'Published' | 'Archived';
  total_chapters: number;
  num_chapters?: number; // For backward compatibility
  total_videos: number;
  total_materials: number;
  total_assignments: number;
  release_type: 'Daily' | 'Weekly' | 'Bi-weekly';
   
   
  content_summary?: any;
  created_at: string;
  updated_at: string;
  course_access?: CourseAccess[];
  chapters?: Chapter[];
}

interface CourseAccess {
  id: string;
  course_id: string;
  school_id: string;
  grade: string;
  schools?: { name: string };
 
}

 
interface Chapter {
  id?: string;
  course_id?: string;
  name: string;
  description?: string;
  learning_outcomes: string[];
   
  order_number: number;
  release_date?: string;
  created_at?: string;
 
}

interface Video {
  id?: string;
  chapter_id: string;
  title: string;
  video_url: string;
  duration?: string;
  uploaded_by?: string;
   
  created_at?: string;
  storage_path?: string;
  content_id?: string;
  content_order?: number;
   
  content_metadata?: Record<string, any>;
}

 
interface Material {
  id?: string;
  chapter_id: string;
  title: string;
  file_url: string;
  file_type: string;
  uploaded_by?: string;
  created_at?: string;
  storage_path?: string;
   
  content_id?: string;
  content_order?: number;
   
  content_metadata?: Record<string, any>;
}

type ChapterContentType =
  | 'text'
  | 'video'
  | 'video_link'
  | 'pdf'
  | 'image'
  | 'file'
  | 'audio'
  | 'html'
  | 'link';

interface ChapterTextContent {
  id?: string;
  content_id?: string;
  chapter_id: string;
  title: string;
  content_text: string;
   
  order_index?: number;
   
  content_metadata?: Record<string, any>;
}

interface Assignment {
  id?: string;
  chapter_id: string;
  title: string;
  description?: string;
  auto_grading_enabled: boolean;
  max_score: number;
   
  created_by?: string;
  created_at?: string;
  questions?: AssignmentQuestion[];
 
}

interface AssignmentQuestion {
  id?: string;
  assignment_id: string;
  question_type: 'MCQ' | 'FillBlank';
  question_text: string;
  options?: string[];
  correct_answer: string;
  marks: number;
 
}

interface Resource {
  id?: string;
  name: string;
   
  type: string;
  url: string;
  size?: number;
  uploaded_at?: string;
}

interface CourseFormData {
  id?: string;
  name: string;
  description: string;
  school_ids: string[];
  grades: string[];
  total_chapters: number;
  total_videos: number;
  total_materials: number;
  total_assignments: number;
   
  release_type: 'Daily' | 'Weekly' | 'Bi-weekly';
  status: 'Draft' | 'Published';
}

export default function CoursesManagement() {
  const generateClientUuid = () => {
    try {
       
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (e) {
      console.warn('UUID generation via crypto.randomUUID failed, falling back to manual method.', e);
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };
  

  const [courses, setCourses] = useState<Course[]>([]);
   
   
  const [schools, setSchools] = useState<any[]>([]);
   
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
   
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<'All' | 'Draft' | 'Published' | 'Archived'>('All');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
   
  const [isChapterDialogOpen, setIsChapterDialogOpen] = useState(false);
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
   
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [publishCourse, setPublishCourse] = useState<Course | null>(null);
  const [versionHistoryCourse, setVersionHistoryCourse] = useState<Course | null>(null);
   
  const [viewingCourse, setViewingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
   
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  
  // NOTE: Old form state variables removed - CourseCreationWizard and CourseEditor manage their own state
  // Removed: currentStep, formData, chapters, chapterData, newOutcome, scheduling, videos, materials, assignments, chapterTextContents
  // These were only used by the old form implementation which has been replaced
  
  const [uploadingFile, setUploadingFile] = useState(false);
  const [resourceData, setResourceData] = useState<Resource>({
    name: "",
    type: "video",
    url: ""
  });
  
  // NOTE: selectedSchools and selectedGrades are still used for the old dialogs that may still be rendered
  // These can be removed once we confirm all old dialogs are no longer needed
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment>({
    chapter_id: '',
    title: '',
    description: '',
    auto_grading_enabled: true,
    max_score: 100,
    questions: []
  });
  const [isVideoUploadOpen, setIsVideoUploadOpen] = useState(false);
  const [isVideoLinkDialogOpen, setIsVideoLinkDialogOpen] = useState(false);
  const [isMaterialUploadOpen, setIsMaterialUploadOpen] = useState(false);
  const [isTextContentDialogOpen, setIsTextContentDialogOpen] = useState(false);
  const [isAssignmentBuilderOpen, setIsAssignmentBuilderOpen] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(-1);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);
  const [currentMaterialFile, setCurrentMaterialFile] = useState<File | null>(null);
  const [videoLinkData, setVideoLinkData] = useState({
    title: '',
    youtube_url: ''
   
  });
  const [textContentData, setTextContentData] = useState({
    title: '',
    content_text: ''
  });
  const [textContentChapterId, setTextContentChapterId] = useState<string | null>(null);
   
  const [editingTextContentId, setEditingTextContentId] = useState<string | null>(null);
  const [editingTextContentIndex, setEditingTextContentIndex] = useState<number | null>(null);
  const [assignmentBuilderData, setAssignmentBuilderData] = useState<{
    title: string;
    description: string;
    questions: AssignmentQuestion[];
    currentQuestion: {
      question_type: 'MCQ' | 'FillBlank';
      question_text: string;
      options: string[];
      correct_answer: string;
       
      marks: number;
    };
  }>({
    title: '',
    description: '',
    questions: [],
    currentQuestion: {
      question_type: 'MCQ',
      question_text: '',
      options: ['', '', '', ''],
      correct_answer: '',
      marks: 1
    }
  });

  // State for editing content
  const [editingVideoIndex, setEditingVideoIndex] = useState<number>(-1);
   
  const [editingAssignmentIndex, setEditingAssignmentIndex] = useState<number>(-1);
  const [editingMaterialIndex, setEditingMaterialIndex] = useState<number>(-1);

  const gradeOptions = [
    { value: "grade1", label: "Grade 1" },
    { value: "grade2", label: "Grade 2" },
    { value: "grade3", label: "Grade 3" },
    { value: "grade4", label: "Grade 4" },
    { value: "grade5", label: "Grade 5" },
    { value: "grade6", label: "Grade 6" },
    { value: "grade7", label: "Grade 7" },
    { value: "grade8", label: "Grade 8" },
    { value: "grade9", label: "Grade 9" },
    { value: "grade10", label: "Grade 10" },
    { value: "grade11", label: "Grade 11" },
    { value: "grade12", label: "Grade 12" }
  ];

  const resourceTypes = [
    { value: "video", label: "Video", icon: FileVideo },
    { value: "document", label: "Document", icon: FileText },
    { value: "image", label: "Image", icon: Image },
    { value: "audio", label: "Audio", icon: FileAudio },
    { value: "presentation", label: "Presentation", icon: FileImage },
    { value: "other", label: "Other", icon: File }
  ];

  // Helper function to normalize grade format (e.g., "Grade 4" -> "grade4")
  const normalizeGradeToValue = (grade: string): string | null => {
    if (!grade) return null;
    
    // Remove "Grade " prefix if present
    const normalized = grade.replace(/^Grade\s+/i, '').trim();
      
    

    const lower = normalized.toLowerCase();
    if (lower === 'pre-k' || lower === 'prek' || lower === 'pre-kg') {
      return 'pre-k';
    }
    if (lower === 'k' || lower === 'kindergarten' || lower === 'kg') {
      return 'kindergarten';
    }
    
    // Extract number from grade (e.g., "4" -> "grade4", "12" -> "grade12")
    const numMatch = normalized.match(/(\d{1,2})/);
    if (numMatch) {
      const num = numMatch[1];
      return `grade${num}`;
    }
    
    return null;
  };

  useEffect(() => {
    loadData();
  }, []);

  // NOTE: Old form persistence/recovery useEffect hooks removed
  // CourseCreationWizard manages its own state and auto-save functionality
  // Load schools when create dialog opens
  useEffect(() => {
    if (isCreateDialogOpen) {
      console.log('🔄 Create dialog opened, loading schools...');
      loadSchools();
    }
  }, [isCreateDialogOpen]);

  // When editing course and schools are loaded, set the selected schools/grades from the course data
  useEffect(() => {
    if (editingCourse && schools.length > 0 && isCreateDialogOpen) {
      // Get schools and grades from the course
       
      const course = editingCourse as any;
      let schoolIds: string[] = [];
      let gradesList: string[] = [];
      
      // Try course_access first - get ALL unique schools and grades
      if (course.course_access && course.course_access.length > 0) {
        // Get unique school IDs
        schoolIds = [...new Set(course.course_access.map((ca: { school_id?: string }) => ca.school_id).filter(Boolean))] as string[];
        // Get unique grades and normalize them
        const rawGrades = [...new Set(course.course_access.map((ca: { grade?: string }) => ca.grade).filter(Boolean))] as string[];
        gradesList = rawGrades.map((grade: string) => {
          const normalized = normalizeGradeToValue(grade);
          return normalized || grade;
        }).filter(Boolean) as string[];
        console.log('📋 useEffect: Extracted from course_access:', { 
          schoolIds, 
          rawGrades,
          gradesList, 
          entries: course.course_access.length,
           
          allGrades: course.course_access.map((ca: any) => ca.grade)
        });
      }
      
      // Fallback to direct school_id and grade
      if (schoolIds.length === 0 && course.school_id) {
         
        schoolIds = [course.school_id];
      }
      if (gradesList.length === 0 && course.grade) {
        const normalized = normalizeGradeToValue(course.grade);
        gradesList = normalized ? [normalized] : [course.grade];
      }
      
      if (schoolIds.length > 0 || gradesList.length > 0) {
        console.log('✅ Pre-selecting schools and grades from editingCourse:', { schoolIds, gradesList });
        setSelectedSchools(schoolIds);
        setSelectedGrades(gradesList);
        // NOTE: formData removed - CourseEditor manages its own state
      }
    }
  }, [editingCourse, schools, isCreateDialogOpen]);

  const loadSchools = async () => {
    setLoadingSchools(true);
    try {
      console.log('🔄 Fetching schools from API...');
      const schoolsResponse = await fetchWithCsrf('/api/admin/schools', {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('📡 Schools API response status:', schoolsResponse.status);
      
      if (!schoolsResponse.ok) {
        const errorText = await schoolsResponse.text();
        console.error('❌ Failed to fetch schools:', schoolsResponse.status, errorText);
        setSchools([]);
        setLoadingSchools(false);
        return;
      }
      
      const schoolsData = await schoolsResponse.json();
      console.log('📦 Schools API response:', schoolsData);
      
      if (schoolsData.schools && Array.isArray(schoolsData.schools)) {
        console.log('✅ Loaded schools:', schoolsData.schools.length);
         
         
        console.log('📋 School names:', schoolsData.schools.map((s: any) => s.name));
        setSchools(schoolsData.schools || []);
      } else {
        console.warn('⚠️ No schools array in response:', schoolsData);
        setSchools([]);
      }
    } catch (error) {
      console.error('❌ Error fetching schools:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
      setSchools([]);
    } finally {
      setLoadingSchools(false);
    }
   
  };

  const loadData = async () => {
    try {
      setLoadingCourses(true);
      // Load courses via API route (bypasses RLS)
      try {
        console.log('📡 [loadData] Fetching courses from API...');
        const response = await fetchWithCsrf('/api/admin/courses', {
          cache: 'no-store', // Ensure fresh data
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        console.log('📡 [loadData] API response status:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('❌ [loadData] Failed to fetch courses:', response.status, errorData);
          console.error('   Full error:', JSON.stringify(errorData, null, 2));
          
          // Handle empty courses list gracefully - not an error
          if (response.status === 404 || errorData.error?.includes('not found')) {
            console.log('ℹ️ [loadData] No courses found - this is normal for a new system');
            setCourses([]);
            setLoadingCourses(false);
            return;
          }
          
          // For authentication errors, show specific message
          if (response.status === 401 || response.status === 403) {
            console.error('❌ [loadData] Authentication error:', errorData);
            alert('Authentication required. Please log in again.');
            setCourses([]);
            setLoadingCourses(false);
            return;
          }
          
          // For other errors, show message but still set empty array
          console.warn('⚠️ [loadData] Error loading courses, but continuing with empty list');
          setCourses([]);
          setLoadingCourses(false);
          return;
        }

        const responseData = await response.json();
        console.log('📦 [loadData] API response data:', {
          hasCourses: !!responseData.courses,
          coursesCount: responseData.courses?.length || 0,
          hasError: !!responseData.error,
          error: responseData.error
        });
        
        const { courses: coursesData, error: apiError } = responseData;

        if (apiError) {
          console.error('❌ [loadData] API returned error:', apiError);
          setCourses([]);
        } else if (coursesData) {
          console.log('✅ [loadData] Loaded courses:', coursesData.length, 'courses');
          console.log('📋 [loadData] Courses data:', coursesData.map((c: any) => ({
            id: c.id,
            name: c.name || c.course_name || c.title,
            status: c.status
          })));
          setCourses(coursesData);
          
          // Force a re-render by updating state
          if (coursesData.length > 0) {
            console.log('✅ [loadData] Courses will be displayed:', coursesData.map((c: any) => c.name || c.course_name));
          } else {
            console.log('ℹ️ [loadData] No courses in database - this is normal for a new system');
          }
        } else {
          console.warn('⚠️ [loadData] No courses data in response:', responseData);
          setCourses([]);
        }
      } catch (error: any) {
        console.error('❌ [loadData] Exception fetching courses:', error);
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack);
        // Don't show error to user if it's just that no courses exist
        if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
          console.log('ℹ️ [loadData] No courses exist - initializing empty list');
        }
        setCourses([]);
      } finally {
        setLoadingCourses(false);
      }

      // Load schools via API route (bypasses RLS)
      await loadSchools();
    } catch (error) {
      console.log('Courses data not available');
      setCourses([]);
      setSchools([]);
      setLoadingCourses(false);
    }
  };

  // Use smart refresh for tab switching - increased interval to prevent refreshes during short tab switches
  useSmartRefresh({
    customRefresh: loadData,
    minRefreshInterval: 180000, // 3 minutes minimum between refreshes (prevents refresh during 1-minute tab switches)
    hasUnsavedData: () => {
      // Check if any dialog is open OR if there's saved form data
      return isCreateDialogOpen || isEditDialogOpen || hasCourseFormState();
    },
  });

  // NOTE: buildChapterContentsPayload, handleCreateCourse, and handleEditCourse removed
  // These functions are no longer used since we're using CourseCreationWizard and CourseEditor components
  // They managed the old form state which has been replaced

  const handleViewCourse = (course: Course) => {
    setViewingCourse(course);
    setIsViewDialogOpen(true);
  };

  // NOTE: handleEditCourse removed - replaced by CourseEditor component
  // The old edit function is no longer used
  // NOTE: handleEditCoursePlaceholder removed - it was unused and referenced removed state variables

  const handleDeleteCourse = (course: Course) => {
    setDeletingCourse(course);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteCourse = async () => {
    if (!deletingCourse) return;

    try {
      const response = await fetchWithCsrf(`/api/admin/courses/${deletingCourse.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete course');
      }

      setIsDeleteDialogOpen(false);
      setDeletingCourse(null);
      loadData();
      alert('✅ Course deleted successfully!');
     
    } catch (error: any) {
      console.error('Error deleting course:', error);
       
      alert(error.message || 'Failed to delete course. Please try again.');
    }
  };

  const handleUpdateCourseStatus = async (courseId: string, status: 'Draft' | 'Published') => {
    try {
      const response = await fetchWithCsrf(`/api/admin/courses/${courseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
           
          status: status,
          is_published: status === 'Published'
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update course status');
      }

      loadData();
      alert(`Course ${status === 'Published' ? 'published' : 'unpublished'} successfully!`);
     
    } catch (error: any) {
      console.error('Error updating course status:', error);
      alert(error.message || 'Failed to update course status. Please try again.');
    }
  };

  // NOTE: Auto-save useEffect removed - CourseCreationWizard manages its own auto-save functionality

  // Warn before leaving page with unsaved data
  useEffect(() => {
    if (!isCreateDialogOpen) return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasCourseFormState()) {
        e.preventDefault();
        e.returnValue = 'You have unsaved course data. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isCreateDialogOpen]);

  // NOTE: resetForm removed - CourseCreationWizard manages its own state
  // Simple helper to clear dialog state when opening create dialog
  const resetForm = () => {
    setSelectedSchools([]);
    setSelectedGrades([]);
    // CourseCreationWizard will handle its own state initialization
  };

  // NOTE: handleGradeToggle removed - not used with new CourseCreationWizard component

  // Get available grades based on selected schools
  const getAvailableGrades = () => {
    if (selectedSchools.length === 0) {
      return gradeOptions; // Show all grades if no schools selected
    }

    // Get all unique grades from selected schools
    const allGrades = new Set<string>();
    
    selectedSchools.forEach(schoolId => {
      const school = schools.find((s: any) => s.id === schoolId);
      if (school && school.grades_offered && Array.isArray(school.grades_offered)) {
        school.grades_offered.forEach((grade: string) => {
          // Normalize grade format: "Grade 4" -> "grade4", "4" -> "grade4"
          const normalized = normalizeGradeToValue(grade);
          if (normalized) {
            allGrades.add(normalized);
          }
        });
      }
    });

    // Filter gradeOptions to only include grades from selected schools
    return gradeOptions.filter((grade: any) => allGrades.has(grade.value));
  };

  // Helper to get available grade values for given school IDs
  const getAvailableGradesForSchools = (schoolIds: string[]): string[] => {
    if (schoolIds.length === 0) {
      return gradeOptions.map((g: any) => g.value);
    }

    const allGrades = new Set<string>();
    
    schoolIds.forEach(schoolId => {
      const school = schools.find((s: any) => s.id === schoolId);
      if (school && school.grades_offered && Array.isArray(school.grades_offered)) {
        school.grades_offered.forEach((grade: string) => {
          const normalized = normalizeGradeToValue(grade);
          if (normalized) {
            allGrades.add(normalized);
          }
        });
      }
     
    });

     
    return Array.from(allGrades);
  };

  // NOTE: handleSchoolToggle removed - not used with new CourseCreationWizard component

  // NOTE: addChapter, removeChapter, addLearningOutcome, removeLearningOutcome removed
  // These functions referenced removed state variables and are no longer used
  // Chapter management is now handled by CourseEditor component

  // NOTE: handleAddChapter removed - it referenced removed state variables and is no longer used
  // Chapter management is now handled by CourseEditor component

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      // Use API route for file uploads to ensure proper RLS handling
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'material');
      if (selectedCourse?.id) {
        formData.append('courseId', selectedCourse.id);
      }
      if (selectedChapter?.id) {
        formData.append('chapterId', selectedChapter.id);
      }

      const response = await fetchWithCsrf('/api/admin/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to upload file');
      }

      if (!result.file || !result.file.url) {
        throw new Error('Upload failed: No file URL returned');
      }

      setResourceData(prev => ({
        ...prev,
        url: result.file.url,
        name: file.name
      }));

      return result.file.url;
     
    } catch (error: any) {
      console.error('Error uploading file:', error);
      alert(`Error uploading file: ${error.message || 'Please try again.'}`);
      throw error;
    } finally {
      setUploadingFile(false);
    }
  };

  // Helper function to extract YouTube video ID from URL
  const extractYouTubeVideoId = (url: string): string | null => {
    try {
      if (!url) return null;
      
      // Handle youtu.be short URLs (with or without query parameters)
      // https://youtu.be/VIDEO_ID?si=...
      const youtuBeMatch = url.match(/(?:youtu\.be\/)([^?&#]+)/);
      if (youtuBeMatch && youtuBeMatch[1]) {
        return youtuBeMatch[1];
      }
      
      // Handle embed URLs
      // https://www.youtube.com/embed/VIDEO_ID
      const embedMatch = url.match(/(?:embed\/)([^?&#]+)/);
      if (embedMatch && embedMatch[1]) {
        return embedMatch[1];
      }
      
      // Handle watch URLs
       
      // https://www.youtube.com/watch?v=VIDEO_ID
      const watchMatch = url.match(/(?:watch\?v=)([^&?#]+)/);
       
      if (watchMatch && watchMatch[1]) {
        return watchMatch[1];
      }
      
      // Handle v/ URLs
      // https://www.youtube.com/v/VIDEO_ID
      const vMatch = url.match(/(?:youtube\.com\/v\/)([^?&#]+)/);
      if (vMatch && vMatch[1]) {
        return vMatch[1];
      }
      
      return null;
    } catch (e) {
      console.error('Error extracting YouTube video ID:', e);
      return null;
    }
  };

  // Helper function to validate YouTube URL
  const isValidYouTubeUrl = (url: string): boolean => {
    return extractYouTubeVideoId(url) !== null;
  };

  // Helper function to convert YouTube URL to embed URL (for storage)
  const getYouTubeEmbedUrl = (url: string): string => {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      // Store as embed URL for consistency with database schema
      // But preview button will convert it to youtu.be for viewing
      return `https://www.youtube.com/embed/${videoId}`;
    }
    console.warn('Could not extract video ID from URL:', url);
    return url;
  };

  // Helper function to convert any YouTube URL to watch URL
   
  const getYouTubeWatchUrl = (url: string): string => {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    console.warn('Could not extract video ID from URL:', url);
    return url;
  };

  // NOTE: handleAddVideoLink is deprecated - CourseEditor now handles video management
  // This function is kept for backward compatibility but should not be used
  const handleAddVideoLink = () => {
    console.warn('⚠️ handleAddVideoLink is deprecated. Please use CourseEditor to manage videos.');
    alert('This feature has been moved to the Course Editor. Please edit the course to add videos.');
    setIsVideoLinkDialogOpen(false);
    setVideoLinkData({ title: '', youtube_url: '' });
    setEditingVideoIndex(-1);
  };

  // NOTE: handleVideoUpload is deprecated - CourseEditor now handles video uploads
  const handleVideoUpload = async (file: File, chapterIndex: number) => {
    console.warn('⚠️ handleVideoUpload is deprecated. Please use CourseEditor to upload videos.');
    alert('This feature has been moved to the Course Editor. Please edit the course to upload videos.');
    setIsVideoUploadOpen(false);
    setCurrentVideoFile(null);
    setUploadingVideo(false);
  };

  // NOTE: handleMaterialUpload is deprecated - CourseEditor now handles material uploads
  const handleMaterialUpload = async (file: File, chapterIndex: number) => {
    console.warn('⚠️ handleMaterialUpload is deprecated. Please use CourseEditor to upload materials.');
    alert('This feature has been moved to the Course Editor. Please edit the course to upload materials.');
    setIsMaterialUploadOpen(false);
    setCurrentMaterialFile(null);
    setEditingMaterialIndex(-1);
    setUploadingMaterial(false);
  };

  // NOTE: getTextContentsForChapter removed - not used with new components

  const handleOpenTextContentDialog = (chapterId: string, content?: ChapterTextContent, index?: number) => {
    setTextContentChapterId(chapterId);
    if (content) {
      setTextContentData({
        title: content.title,
        content_text: content.content_text
      });
      setEditingTextContentId(content.content_id || content.id || null);
      setEditingTextContentIndex(typeof index === 'number' ? index : null);
    } else {
      setTextContentData({
        title: '',
        content_text: ''
      });
      setEditingTextContentId(null);
      setEditingTextContentIndex(null);
    }
    setIsTextContentDialogOpen(true);
  };

  // NOTE: handleSaveTextContentBlock is deprecated - CourseEditor now handles text content
  const handleSaveTextContentBlock = () => {
    console.warn('⚠️ handleSaveTextContentBlock is deprecated. Please use CourseEditor to manage text content.');
    alert('This feature has been moved to the Course Editor. Please edit the course to add text content.');
    setIsTextContentDialogOpen(false);
    setTextContentChapterId(null);
    setEditingTextContentId(null);
    setEditingTextContentIndex(null);
  };

  // NOTE: handleDeleteTextContent is deprecated - CourseEditor now handles text content
  const handleDeleteTextContent = (chapterId: string, index: number) => {
    console.warn('⚠️ handleDeleteTextContent is deprecated. Please use CourseEditor to manage text content.');
  };

  // Assignment question handlers
  const addQuestionToAssignment = () => {
    const { currentQuestion } = assignmentBuilderData;
    
    if (!currentQuestion.question_text.trim()) {
      alert('Please enter a question text');
      return;
    }

    if (currentQuestion.question_type === 'MCQ' && currentQuestion.options.filter((o: any) => o.trim()).length < 2) {
      alert('Please provide at least 2 options for MCQ');
      return;
    }

    if (!currentQuestion.correct_answer.trim()) {
      alert('Please specify the correct answer');
      return;
    }

    const newQuestion: AssignmentQuestion = {
      assignment_id: '',
      question_type: currentQuestion.question_type,
      question_text: currentQuestion.question_text,
      options: currentQuestion.question_type === 'MCQ' ? currentQuestion.options.filter((o: any) => o.trim()) : undefined,
      correct_answer: currentQuestion.correct_answer,
      marks: currentQuestion.marks || 1
    };

    setAssignmentBuilderData(prev => ({
      ...prev,
      questions: [...prev.questions, newQuestion],
      currentQuestion: {
        question_type: 'MCQ',
        question_text: '',
        options: ['', '', '', ''],
        correct_answer: '',
        marks: 1
      }
    }));
  };

  // NOTE: saveAssignment is deprecated - CourseEditor now handles assignments
  const saveAssignment = (chapterIndex: number) => {
    console.warn('⚠️ saveAssignment is deprecated. Please use CourseEditor to manage assignments.');
    alert('This feature has been moved to the Course Editor. Please edit the course to add assignments.');
    setIsAssignmentBuilderOpen(false);
    setEditingAssignmentIndex(-1);
    setAssignmentBuilderData({
      title: '',
      description: '',
      questions: [],
      currentQuestion: {
        question_type: 'MCQ',
        question_text: '',
        options: ['', '', '', ''],
        correct_answer: '',
        marks: 1
      }
    });
  };

  const filteredCourses = courses.filter((course: any) => {
    // Status filter
    if (statusFilter !== 'All' && course.status !== statusFilter) {
      return false;
    }
    
    // Search filter
    if (!searchTerm.trim()) return true; // Show all courses if no search term
    
    const courseName = course.name || course.course_name || '';
    const courseDescription = course.description || '';
    const matches = (
      courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      courseDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.course_access?.some((access: any) => 
        access.schools?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        access.grade?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
    return matches;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Published': return 'bg-green-100 text-green-800';
      case 'Draft': return 'bg-yellow-100 text-yellow-800';
      case 'Archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getResourceIcon = (type: string) => {
    const resourceType = resourceTypes.find((rt: any) => rt.value === type);
    return resourceType ? resourceType.icon : File;
  };

  // NOTE: renderStepContent() function removed - replaced by CourseCreationWizard component
  // The old 6-step form implementation is no longer used.
  // All the old form code (cases 1-6) has been removed since we now use CourseCreationWizard.

  return (
    <div className="p-8 bg-white min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Course Management</h1>
        <p className="text-gray-600 mt-2">Create and manage courses with comprehensive content</p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search courses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value: 'All' | 'Draft' | 'Published' | 'Archived') => setStatusFilter(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Courses</SelectItem>
            <SelectItem value="Published">Published</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button 
          className="bg-blue-600 hover:bg-blue-700"
          onClick={() => {
            resetForm();
            setEditingCourse(null);
            setIsCreateDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Course
        </Button>

        {/* YouTube Video Link Dialog */}
        <Dialog open={isVideoLinkDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setIsVideoLinkDialogOpen(false);
            setVideoLinkData({ title: '', youtube_url: '' });
            setEditingVideoIndex(-1);
          }
        }}>
          <DialogContent className="bg-white max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingVideoIndex >= 0 ? 'Edit YouTube Video' : 'Add YouTube Video'}</DialogTitle>
              <DialogDescription>
                {editingVideoIndex >= 0 ? 'Update the video details' : 'Enter the YouTube video link and title'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="video_title">Video Title <span className="text-red-500">*</span></Label>
                <Input
                  id="video_title"
                  value={videoLinkData.title}
                  onChange={(e) => setVideoLinkData({ ...videoLinkData, title: e.target.value })}
                  placeholder="e.g., Introduction to Robotics"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="youtube_url">YouTube Video URL <span className="text-red-500">*</span></Label>
                <Input
                  id="youtube_url"
                  value={videoLinkData.youtube_url}
                  onChange={(e) => setVideoLinkData({ ...videoLinkData, youtube_url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="mt-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Supports: youtube.com/watch?v=..., youtu.be/..., youtube.com/embed/...
                </p>
                
                {/* Important Instructions */}
                <div className="mt-3 p-3 border rounded-lg bg-yellow-50 border-yellow-200">
                  <p className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Important: Video Privacy Settings</p>
                  <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                    <li>Set video to <strong>Unlisted</strong> or <strong>Public</strong> (NOT Private)</li>
                    <li>Enable embedding in video settings</li>
                    <li>Go to YouTube Studio → Videos → Select video → Visibility → Unlisted</li>
                    <li>Under &quot;Advanced settings&quot;, ensure &quot;Allow embedding&quot; is checked</li>
                  </ul>
                </div>

                {videoLinkData.youtube_url && isValidYouTubeUrl(videoLinkData.youtube_url) && (
                  <div className="mt-3 p-3 border rounded-lg bg-green-50">
                    <p className="text-sm text-green-700 font-medium">✓ Valid YouTube URL</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Video ID: {extractYouTubeVideoId(videoLinkData.youtube_url)}
                    </p>
                  </div>
                )}
                {videoLinkData.youtube_url && !isValidYouTubeUrl(videoLinkData.youtube_url) && (
                  <div className="mt-3 p-3 border rounded-lg bg-red-50">
                    <p className="text-sm text-red-700 font-medium">✗ Invalid YouTube URL</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Please enter a valid YouTube link
                    </p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsVideoLinkDialogOpen(false);
                setVideoLinkData({ title: '', youtube_url: '' });
              }}>
                Cancel
              </Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleAddVideoLink}
                disabled={!videoLinkData.title.trim() || !videoLinkData.youtube_url.trim() || !isValidYouTubeUrl(videoLinkData.youtube_url)}
              >
                {editingVideoIndex >= 0 ? <Edit className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {editingVideoIndex >= 0 ? 'Update Video' : 'Add Video'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Video Upload Confirmation Dialog */}
        <Dialog open={isVideoUploadOpen && currentVideoFile !== null} onOpenChange={(open) => {
          if (!open) {
            setIsVideoUploadOpen(false);
            setCurrentVideoFile(null);
          }
        }}>
          <DialogContent className="bg-white">
            <DialogHeader>
              <DialogTitle>Upload Video</DialogTitle>
              <DialogDescription>
                Confirm upload of video file
              </DialogDescription>
            </DialogHeader>
            {currentVideoFile && (
              <div className="space-y-4">
                <div>
                  <Label>File Name</Label>
                  <p className="text-sm text-gray-700 mt-1">{currentVideoFile.name}</p>
                </div>
                <div>
                  <Label>File Size</Label>
                  <p className="text-sm text-gray-700 mt-1">{(currentVideoFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <div>
                  <Label>File Type</Label>
                  <p className="text-sm text-gray-700 mt-1">{currentVideoFile.type}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsVideoUploadOpen(false);
                setCurrentVideoFile(null);
              }}>
                Cancel
              </Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  if (currentVideoFile && currentChapterIndex >= 0) {
                    handleVideoUpload(currentVideoFile, currentChapterIndex);
                  }
                }}
                disabled={uploadingVideo}
              >
                {uploadingVideo ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Video
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Material Upload Confirmation Dialog */}
        <Dialog open={isMaterialUploadOpen && currentMaterialFile !== null} onOpenChange={(open) => {
          if (!open) {
            setIsMaterialUploadOpen(false);
            setCurrentMaterialFile(null);
            setEditingMaterialIndex(-1);
          }
        }}>
          <DialogContent className="bg-white">
            <DialogHeader>
              <DialogTitle>{editingMaterialIndex >= 0 ? 'Replace Material' : 'Upload Material'}</DialogTitle>
              <DialogDescription>
                {editingMaterialIndex >= 0 ? 'Confirm replacement of material file' : 'Confirm upload of material file'}
              </DialogDescription>
            </DialogHeader>
            {currentMaterialFile && (
              <div className="space-y-4">
                <div>
                  <Label>File Name</Label>
                  <p className="text-sm text-gray-700 mt-1">{currentMaterialFile.name}</p>
                </div>
                <div>
                  <Label>File Size</Label>
                  <p className="text-sm text-gray-700 mt-1">{(currentMaterialFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <div>
                  <Label>File Type</Label>
                  <p className="text-sm text-gray-700 mt-1">{currentMaterialFile.type}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsMaterialUploadOpen(false);
                setCurrentMaterialFile(null);
              }}>
                Cancel
              </Button>
              <Button 
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  if (currentMaterialFile && currentChapterIndex >= 0) {
                    handleMaterialUpload(currentMaterialFile, currentChapterIndex);
                  }
                }}
                disabled={uploadingMaterial}
              >
                {uploadingMaterial ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    {editingMaterialIndex >= 0 ? <Edit className="h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {editingMaterialIndex >= 0 ? 'Replace Material' : 'Upload Material'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assignment Builder Dialog */}
        <Dialog open={isAssignmentBuilderOpen} onOpenChange={(open) => {
          if (!open) {
            setIsAssignmentBuilderOpen(false);
            setEditingAssignmentIndex(-1);
            setAssignmentBuilderData({
              title: '',
              description: '',
              questions: [],
              currentQuestion: {
                question_type: 'MCQ',
                question_text: '',
                options: ['', '', '', ''],
                correct_answer: '',
                marks: 1
              }
            });
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white">
            <DialogHeader>
              <DialogTitle>{editingAssignmentIndex >= 0 ? 'Edit Assignment' : 'Assignment Builder'}</DialogTitle>
              <DialogDescription>
                {editingAssignmentIndex >= 0 ? 'Update assignment details and questions' : 'Create assignments with MCQs and Fill-in-the-blanks questions'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Assignment Details */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="assignment-title">Assignment Title <span className="text-red-500">*</span></Label>
                  <Input
                    id="assignment-title"
                    value={assignmentBuilderData.title}
                    onChange={(e) => setAssignmentBuilderData({...assignmentBuilderData, title: e.target.value})}
                    placeholder="e.g., Chapter 1 Quiz"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="assignment-description">Description</Label>
                  <Textarea
                    id="assignment-description"
                    value={assignmentBuilderData.description}
                    onChange={(e) => setAssignmentBuilderData({...assignmentBuilderData, description: e.target.value})}
                    placeholder="Assignment description..."
                    rows={3}
                    className="mt-2"
                  />
                </div>
              </div>

              {/* Question Builder */}
              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg font-semibold">Add Question</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={assignmentBuilderData.currentQuestion.question_type === 'MCQ' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAssignmentBuilderData({
                        ...assignmentBuilderData,
                        currentQuestion: {
                          ...assignmentBuilderData.currentQuestion,
                          question_type: 'MCQ',
                          options: ['', '', '', '']
                        }
                      })}
                    >
                      MCQ
                    </Button>
                    <Button
                      type="button"
                      variant={assignmentBuilderData.currentQuestion.question_type === 'FillBlank' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAssignmentBuilderData({
                        ...assignmentBuilderData,
                        currentQuestion: {
                          ...assignmentBuilderData.currentQuestion,
                          question_type: 'FillBlank',
                          options: []
                        }
                      })}
                    >
                      Fill in the Blanks
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                  <div>
                    <Label>Question Text <span className="text-red-500">*</span></Label>
                    <Textarea
                      value={assignmentBuilderData.currentQuestion.question_text}
                      onChange={(e) => setAssignmentBuilderData({
                        ...assignmentBuilderData,
                        currentQuestion: {
                          ...assignmentBuilderData.currentQuestion,
                          question_text: e.target.value
                        }
                      })}
                      placeholder={assignmentBuilderData.currentQuestion.question_type === 'FillBlank' 
                        ? "e.g., The capital of France is ___." 
                        : "Enter your question here..."}
                      rows={2}
                      className="mt-2"
                    />
                  </div>

                  {assignmentBuilderData.currentQuestion.question_type === 'MCQ' && (
                    <div>
                      <Label>Options <span className="text-red-500">*</span> (At least 2 required)</Label>
                      <div className="space-y-2 mt-2">
                        {assignmentBuilderData.currentQuestion.options.map((option, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              value={option}
                              onChange={(e) => {
                                const newOptions = [...assignmentBuilderData.currentQuestion.options];
                                newOptions[idx] = e.target.value;
                                setAssignmentBuilderData({
                                  ...assignmentBuilderData,
                                  currentQuestion: {
                                    ...assignmentBuilderData.currentQuestion,
                                    options: newOptions
                                  }
                                });
                              }}
                              placeholder={`Option ${idx + 1}`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newOptions = assignmentBuilderData.currentQuestion.options.filter((_, i) => i !== idx);
                                setAssignmentBuilderData({
                                  ...assignmentBuilderData,
                                  currentQuestion: {
                                    ...assignmentBuilderData.currentQuestion,
                                    options: newOptions.length > 0 ? newOptions : ['']
                                  }
                                });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAssignmentBuilderData({
                            ...assignmentBuilderData,
                            currentQuestion: {
                              ...assignmentBuilderData.currentQuestion,
                              options: [...assignmentBuilderData.currentQuestion.options, '']
                            }
                          })}
                        >
                          <PlusCircle className="h-4 w-4 mr-2" />
                          Add Option
                        </Button>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Correct Answer <span className="text-red-500">*</span></Label>
                    {assignmentBuilderData.currentQuestion.question_type === 'MCQ' ? (
                      <Select
                        value={assignmentBuilderData.currentQuestion.correct_answer}
                        onValueChange={(value) => setAssignmentBuilderData({
                          ...assignmentBuilderData,
                          currentQuestion: {
                            ...assignmentBuilderData.currentQuestion,
                            correct_answer: value
                          }
                        })}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select correct answer" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignmentBuilderData.currentQuestion.options
                            .filter((opt: any) => opt.trim())
                            .map((option, idx) => (
                              <SelectItem key={idx} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={assignmentBuilderData.currentQuestion.correct_answer}
                        onChange={(e) => setAssignmentBuilderData({
                          ...assignmentBuilderData,
                          currentQuestion: {
                            ...assignmentBuilderData.currentQuestion,
                            correct_answer: e.target.value
                          }
                        })}
                        placeholder="Enter the correct answer"
                        className="mt-2"
                      />
                    )}
                  </div>

                  <div>
                    <Label>Marks <span className="text-red-500">*</span></Label>
                    <Input
                      type="number"
                      value={assignmentBuilderData.currentQuestion.marks}
                      onChange={(e) => setAssignmentBuilderData({
                        ...assignmentBuilderData,
                        currentQuestion: {
                          ...assignmentBuilderData.currentQuestion,
                          marks: parseInt(e.target.value) || 1
                        }
                      })}
                      min="1"
                      className="mt-2"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={addQuestionToAssignment}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Question
                  </Button>
                </div>
              </div>

              {/* Questions List */}
              {assignmentBuilderData.questions.length > 0 && (
                <div className="border-t pt-6 space-y-4">
                  <Label className="text-lg font-semibold">Questions ({assignmentBuilderData.questions.length})</Label>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {assignmentBuilderData.questions.map((question, idx) => (
                      <div key={idx} className="p-4 border rounded-lg bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary">{question.question_type}</Badge>
                              <span className="text-sm text-gray-500">{question.marks} mark{question.marks !== 1 ? 's' : ''}</span>
                            </div>
                            <p className="text-sm font-medium text-gray-900 mb-2">{question.question_text}</p>
                            {question.question_type === 'MCQ' && question.options && (
                              <div className="space-y-1 mb-2">
                                {question.options.map((opt, optIdx) => (
                                  <div key={optIdx} className={`text-xs p-2 rounded ${
                                    opt === question.correct_answer ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {optIdx + 1}. {opt} {opt === question.correct_answer && '✓'}
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-xs text-gray-500">
                              Correct Answer: <span className="font-medium text-green-700">{question.correct_answer}</span>
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newQuestions = assignmentBuilderData.questions.filter((_, i) => i !== idx);
                              setAssignmentBuilderData({...assignmentBuilderData, questions: newQuestions});
                            }}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">
                      Total Score: {assignmentBuilderData.questions.reduce((sum: number, q: any) => sum + q.marks, 0)} marks
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAssignmentBuilderOpen(false);
                setAssignmentBuilderData({
                  title: '',
                  description: '',
                  questions: [],
                  currentQuestion: {
                    question_type: 'MCQ',
                    question_text: '',
                    options: ['', '', '', ''],
                    correct_answer: '',
                    marks: 1
                  }
                });
              }}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (currentChapterIndex >= 0) {
                    saveAssignment(currentChapterIndex);
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={assignmentBuilderData.questions.length === 0}
              >
                <Save className="h-4 w-4 mr-2" />
                {editingAssignmentIndex >= 0 ? 'Update Assignment' : 'Save Assignment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Courses Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Courses</CardTitle>
          <CardDescription>
            Manage your courses and their content
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCourses ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
              <span className="text-gray-600">Loading courses...</span>
            </div>
          ) : (
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course Name</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Grades</TableHead>
                <TableHead>Chapters</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCourses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    {courses.length === 0 ? (
                      <>No courses found. Click &quot;Create Course&quot; to add your first course.</>
                    ) : (
                      <>No courses match your search. Try a different search term.</>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCourses.map((course) => {
                  // Get school names from course_access
                  const schoolNames = course.course_access
                     
                    ?.map((access: any) => access.schools?.name)
                    .filter(Boolean) || [];
                  const uniqueSchoolNames = [...new Set(schoolNames)];
                  
                  // Get unique grades from course_access
                  const grades = course.course_access
                     
                    ?.map((access: any) => access.grade)
                    .filter(Boolean) || [];
                  const uniqueGrades = [...new Set(grades)];
                  
                  return (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium">
                      {course.name || course.course_name || 'Unnamed Course'}
                    </TableCell>
                    <TableCell className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                      {uniqueSchoolNames.length > 0 ? (
                        uniqueSchoolNames.join(', ')
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {uniqueGrades.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {uniqueGrades.map((grade: string, idx: number) => (
                            <Badge key={`${course.id}-${grade}-${idx}`} variant="secondary" className="text-xs">
                              {gradeOptions.find((go: any) => go.value === grade)?.label || grade}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">N/A</span>
                      )}
                    </TableCell>
                  <TableCell>{course.total_chapters || 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-4 text-sm">
                      <span className="flex items-center">
                        <Video className="h-4 w-4 mr-1 text-blue-500" />
                        {course.total_videos || 0}
                      </span>
                      <span className="flex items-center">
                        <FileText className="h-4 w-4 mr-1 text-green-500" />
                        {course.total_materials || 0}
                      </span>
                      <span className="flex items-center">
                        <CheckSquare className="h-4 w-4 mr-1 text-purple-500" />
                        {course.total_assignments || 0}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(course.status || 'Draft')}>
                      {course.status || 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleViewCourse(course)}
                        title="View course details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('🔘 Edit button clicked for course:', course.id, course.name);
                          try {
                            // Fetch full course data with chapters and contents before opening dialog
                            console.log('📡 Fetching full course data...');
                            const response = await fetchWithCsrf(`/api/admin/courses/${course.id}`, {
                              cache: 'no-store',
                            });
                            
                            if (!response.ok) {
                              const errorData = await response.json().catch(() => ({}));
                              
                              // Handle 404 specifically
                              if (response.status === 404) {
                                throw new Error(errorData.message || errorData.details || `Course with ID ${course.id} does not exist`);
                              }
                              
                              throw new Error(errorData.error || errorData.message || errorData.details || `Failed to load course data (${response.status})`);
                            }
                            
                            const data = await response.json();
                            if (!data.course) {
                              // Check if it's an error response
                              if (data.error) {
                                throw new Error(data.message || data.details || data.error);
                              }
                              throw new Error('Course data not found in response');
                            }
                            
                            const fullCourse = data.course;
                            console.log('✅ Course data fetched:', {
                              id: fullCourse.id,
                              name: fullCourse.name || fullCourse.course_name,
                              chapters: fullCourse.chapters?.length || 0,
                              chapter_contents: fullCourse.chapter_contents?.length || 0,
                              assignments: fullCourse.assignments?.length || 0,
                              chaptersWithContents: fullCourse.chapters?.map((ch: any) => ({
                                id: ch.id,
                                name: ch.name || ch.title,
                                contentsCount: ch.contents?.length || 0
                              })),
                              assignmentsDetails: fullCourse.assignments?.map((a: any) => ({
                                id: a.id,
                                title: a.title,
                                chapter_id: a.chapter_id,
                                hasConfig: !!a.config
                              })) || []
                            });
                            
                            // Log warning if assignments are missing
                            if (!fullCourse.assignments || fullCourse.assignments.length === 0) {
                              console.warn('⚠️ Course data fetched but no assignments found. This may indicate assignments are not being returned by the API.');
                            } else {
                              console.log(`✅ Course data includes ${fullCourse.assignments.length} assignment(s)`);
                            }
                            
                            // Set the full course data including chapters and contents
                            setEditingCourse({
                              ...course,
                              ...fullCourse,
                              name: fullCourse.name || fullCourse.course_name || course.name
                            } as Course);
                            setIsEditDialogOpen(true);
                          } catch (error: any) {
                            console.error('❌ Error opening edit dialog:', error);
                            const errorMessage = error.message || 'Failed to open edit dialog. Please try again.';
                            
                            // Show user-friendly error message
                            if (errorMessage.includes('does not exist') || errorMessage.includes('not found')) {
                              alert(`Course not found: ${errorMessage}\n\nThis course may have been deleted or the ID is invalid.`);
                            } else {
                              alert(errorMessage);
                            }
                          }
                        }}
                        title="Edit course"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteCourse(course)}
                        title="Delete course"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setPublishCourse(course);
                          setIsPublishDialogOpen(true);
                        }}
                        title={course.status === 'Published' ? 'Unpublish course' : 'Publish course'}
                        className={course.status === 'Published' 
                          ? "text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                          : "text-green-600 hover:text-green-700 hover:bg-green-50"
                        }
                      >
                        {course.status === 'Published' ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      {course.status === 'Published' && (
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setVersionHistoryCourse(course);
                            setIsVersionHistoryOpen(true);
                          }}
                          title="View version history"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* View Course Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>Course Details</DialogTitle>
            <DialogDescription>View complete course information</DialogDescription>
          </DialogHeader>
          {viewingCourse && (
            <div className="space-y-6">
              <div>
                <Label className="text-sm font-semibold text-gray-700">Course Name</Label>
                <p className="text-lg font-medium text-gray-900 mt-1">{viewingCourse.name}</p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Description</Label>
                <p className="text-gray-600 mt-1">{viewingCourse.description || 'No description provided'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(viewingCourse.status)}>{viewingCourse.status}</Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Release Type</Label>
                  <p className="text-gray-600 mt-1">{viewingCourse.release_type || 'Weekly'}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Schools & Grades</Label>
                <div className="mt-2 space-y-2">
                  {viewingCourse.course_access && viewingCourse.course_access.length > 0 ? (
                    viewingCourse.course_access.map((access, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Badge variant="secondary">{access.schools?.name || 'Unknown School'}</Badge>
                        <Badge variant="outline">{access.grade}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No schools/grades assigned</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Chapters</Label>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{viewingCourse.total_chapters || 0}</p>
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Videos</Label>
                  <p className="text-2xl font-bold text-purple-600 mt-1">{viewingCourse.total_videos || 0}</p>
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Materials</Label>
                  <p className="text-2xl font-bold text-green-600 mt-1">{viewingCourse.total_materials || 0}</p>
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Assignments</Label>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{viewingCourse.total_assignments || 0}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Created At</Label>
                <p className="text-gray-600 mt-1">
                  {new Date(viewingCourse.created_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Delete Course</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this course? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingCourse && (
            <div className="py-4">
              <p className="text-sm text-gray-600">
                Course: <span className="font-semibold">{deletingCourse.name}</span>
              </p>
              <p className="text-sm text-red-600 mt-2">
                All course data including chapters, videos, materials, and assignments will be permanently deleted.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteDialogOpen(false);
              setDeletingCourse(null);
            }}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDeleteCourse}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Course
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Course Creation Wizard */}
      {isCreateDialogOpen && !editingCourse && (
        <CourseCreationWizard
          onComplete={async (courseData) => {
            try {
              const response = await fetchWithCsrf('/api/admin/courses', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  ...courseData,
                  status: 'Draft',
                }),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to create course' }));
                throw new Error(errorData.error || errorData.details || 'Failed to create course');
              }

              setIsCreateDialogOpen(false);
              clearCourseFormState();
              setStatusFilter('Draft'); // Show Draft courses to see the new one
              loadData();
              alert('✅ Course created successfully!');
            } catch (error: any) {
              console.error('Error creating course:', error);
              alert(`❌ ${error.message || 'Failed to create course'}`);
            }
          }}
          onCancel={() => {
            setIsCreateDialogOpen(false);
            setEditingCourse(null);
          }}
        />
      )}

      {/* Course Editor */}
      {isEditDialogOpen && editingCourse && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <CourseEditor
              course={{
                id: editingCourse.id,
                name: editingCourse.name || editingCourse.course_name || '',
                description: editingCourse.description || '',
                duration_weeks: (editingCourse as any).duration_weeks,
                prerequisites_course_ids: (editingCourse as any).prerequisites_course_ids || [],
                prerequisites_text: (editingCourse as any).prerequisites_text || '',
                thumbnail_url: (editingCourse as any).thumbnail_url || '',
                difficulty_level: (editingCourse as any).difficulty_level || 'Beginner',
                school_ids: editingCourse.course_access?.map((ca: any) => ca.school_id).filter(Boolean) || [],
                grades: editingCourse.course_access?.map((ca: any) => ca.grade).filter(Boolean) || [],
                status: editingCourse.status || 'Draft',
                chapters: editingCourse.chapters || [],
                assignments: (editingCourse as any).assignments || [],
                // Include full course object for chapter_contents access
                ...(editingCourse as any),
              }}
              onSave={async (courseData) => {
                try {
                  console.log('💾 [PAGE] Saving course data to API:', {
                    courseId: editingCourse.id,
                    assignmentsCount: courseData.assignments?.length || 0,
                    chaptersCount: courseData.chapters?.length || 0,
                    hasAssignments: !!courseData.assignments,
                    assignmentsArray: courseData.assignments || [],
                    assignmentsDetails: courseData.assignments?.map((a: any) => ({
                      title: a.title,
                      chapter_id: a.chapter_id,
                      assignment_type: a.assignment_type,
                      questionsCount: a.questions?.length || 0,
                      hasId: !!a.id
                    })) || []
                  });
                  
                  // Validate assignments are being sent
                  if (courseData.assignments && courseData.assignments.length > 0) {
                    console.log('✅ [PAGE] Assignments are included in request:', courseData.assignments.length);
                  } else {
                    console.warn('⚠️ [PAGE] No assignments in courseData being sent to API');
                  }
                  
                  const requestBody = JSON.stringify(courseData);
                  console.log('📤 [PAGE] Request body size:', requestBody.length, 'bytes');
                  console.log('📤 [PAGE] Request body preview (assignments):', 
                    JSON.stringify({ assignments: courseData.assignments }, null, 2).substring(0, 500));
                  
                  const response = await fetchWithCsrf(`/api/admin/courses/${editingCourse.id}`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: requestBody,
                  });

                  if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Failed to update course' }));
                    throw new Error(errorData.error || errorData.details || 'Failed to update course');
                  }

                  // Fetch updated course data to ensure assignments are included
                  console.log('🔄 Fetching updated course data after save...');
                  const updatedResponse = await fetchWithCsrf(`/api/admin/courses/${editingCourse.id}`, {
                    cache: 'no-store',
                  });
                  
                  if (updatedResponse.ok) {
                    const updatedData = await updatedResponse.json();
                    const updatedCourse = updatedData.course;
                    
                    console.log('✅ Fetched updated course data:', {
                      courseId: updatedCourse.id,
                      assignmentsCount: updatedCourse.assignments?.length || 0,
                      chaptersCount: updatedCourse.chapters?.length || 0
                    });
                    
                    // Update the editingCourse state with fresh data before closing
                    setEditingCourse({
                      ...editingCourse,
                      ...updatedCourse,
                      name: updatedCourse.name || updatedCourse.course_name || editingCourse.name
                    });
                  } else {
                    console.warn('⚠️ Could not fetch updated course data, but save was successful');
                  }

                  // Refresh the course list
                  loadData();
                  
                  // Close dialog and show success
                  setIsEditDialogOpen(false);
                  setEditingCourse(null);
                  alert('✅ Course updated successfully!');
                } catch (error: any) {
                  console.error('❌ Error updating course:', error);
                  alert(`❌ ${error.message || 'Failed to update course'}`);
                }
              }}
              onCancel={() => {
                setIsEditDialogOpen(false);
                setEditingCourse(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Publish Dialog */}
      {publishCourse && (
        <CoursePublishDialog
          open={isPublishDialogOpen}
          onOpenChange={(open) => {
            setIsPublishDialogOpen(open);
            if (!open) setPublishCourse(null);
          }}
          course={{
            id: publishCourse.id,
            name: publishCourse.name || publishCourse.course_name || '',
            status: publishCourse.status || 'Draft',
            is_published: (publishCourse as any).is_published || false,
            school_ids: publishCourse.course_access?.map((ca: any) => ca.school_id).filter(Boolean) || [],
            grades: publishCourse.course_access?.map((ca: any) => ca.grade).filter(Boolean) || [],
          }}
          onPublishChange={() => {
            loadData();
            setPublishCourse(null);
          }}
        />
      )}

      {/* Version History Dialog */}
      {versionHistoryCourse && (
        <Dialog open={isVersionHistoryOpen} onOpenChange={(open) => {
          setIsVersionHistoryOpen(open);
          if (!open) setVersionHistoryCourse(null);
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Version History</DialogTitle>
              <DialogDescription>
                View and manage course versions
              </DialogDescription>
            </DialogHeader>
            <CourseVersionHistory
              courseId={versionHistoryCourse.id}
              courseName={versionHistoryCourse.name || versionHistoryCourse.course_name || 'Unnamed Course'}
              onVersionRevert={() => {
                loadData();
                setIsVersionHistoryOpen(false);
                setVersionHistoryCourse(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
