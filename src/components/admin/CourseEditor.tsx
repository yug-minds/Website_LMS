"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { 
  Save, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  BookOpen,
  School,
  FileText,
  Link2
} from "lucide-react";
import { SchoolGradeSelector } from "./SchoolGradeSelector";
import { FileUploadZone } from "./FileUploadZone";
import { ChapterContentManager, ChapterContent } from "./ChapterContentManager";
import { AssignmentBuilder, Assignment } from "./AssignmentBuilder";
import { fetchWithCsrf } from "../../lib/csrf-client";
import { generateUUID } from "../../lib/uuid-utils";

export interface Chapter {
  id?: string;
  course_id?: string;
  name: string;
  description?: string;
  learning_outcomes: string[];
  order_number: number;
}

interface CourseEditorProps {
  course: {
    id: string;
    name: string;
    description?: string;
    duration_weeks?: number;
    prerequisites_course_ids?: string[];
    prerequisites_text?: string;
    thumbnail_url?: string;
    school_ids?: string[];
    grades?: string[];
    status: 'Draft' | 'Published' | 'Archived';
    chapters?: Chapter[];
    assignments?: any[]; // Assignments from API
    chapter_contents?: any[]; // Top-level chapter_contents array from API
    [key: string]: any; // Allow additional properties from API response
  };
  onSave: (courseData: any) => void;
  onCancel?: () => void;
}

export function CourseEditor({
  course,
  onSave,
  onCancel,
}: CourseEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  // Basic Information
  const [basicInfo, setBasicInfo] = useState({
    name: course.name || "",
    description: course.description || "",
    duration_weeks: course.duration_weeks?.toString() || "",
    prerequisites_text: course.prerequisites_text || "",
    prerequisites_course_ids: course.prerequisites_course_ids || [] as string[],
    thumbnail_url: course.thumbnail_url || "",
    difficulty_level: (course as any).difficulty_level || "Beginner",
  });

  // School & Grade
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>(
    course.school_ids || []
  );
  const [selectedGrades, setSelectedGrades] = useState<string[]>(
    course.grades || []
  );

  // Chapters
  const [chapters, setChapters] = useState<Chapter[]>(
    course.chapters || []
  );
  const [chapterContents, setChapterContents] = useState<Record<string, ChapterContent[]>>({});
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});

  // Extract complex expressions for dependency arrays
  const courseChapterContents = (course as any).chapter_contents;
  const courseAssignments = (course as any).assignments;
  const courseVideos = (course as any).videos;
  const [videos, setVideos] = useState<Array<{ chapter_id: string; title: string; video_url: string; duration?: number }>>([]);
  const [availableCourses, setAvailableCourses] = useState<Array<{ id: string; name: string }>>([]);
  
  // Ref to track latest assignments state to prevent stale closures
  const assignmentsRef = useRef<Record<string, Assignment>>({});
  
  // Ref to track when the last local assignment change occurred
  // This helps prevent loadAssignments from overwriting newly created assignments
  const lastAssignmentChangeRef = useRef<number>(0);
  
  // Ref to track if loadAssignments is currently running
  const isLoadingAssignmentsRef = useRef<boolean>(false);
  
  // Ref to track if this is the initial load (to allow first loadAssignments)
  const hasInitialLoadCompletedRef = useRef<boolean>(false);
  
  // Update ref whenever assignments state changes
  useEffect(() => {
    const prevCount = Object.keys(assignmentsRef.current).length;
    const newCount = Object.keys(assignments).length;
    const prevKeys = Object.keys(assignmentsRef.current);
    const newKeys = Object.keys(assignments);
    
    assignmentsRef.current = assignments;
    
    console.log('📊 [CourseEditor] assignments state updated:', {
      prevCount: prevCount,
      newCount: newCount,
      count: Object.keys(assignments).length,
      keys: Object.keys(assignments),
      hasLocalAssignments: Object.values(assignments).some((a: any) => !a.id),
      assignments: Object.entries(assignments).map(([key, ass]) => ({
        key: key,
        title: ass.title,
        hasId: !!ass.id,
        chapter_id: ass.chapter_id
      })),
      prevKeys: prevKeys,
      newKeys: newKeys,
      keysAdded: newKeys.filter((k: any) => !prevKeys.includes(k)),
      keysRemoved: prevKeys.filter((k: any) => !newKeys.includes(k)),
      stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n')
    });
    
    // Alert if assignments were lost
    if (prevCount > 0 && newCount === 0) {
      console.error('❌ [CourseEditor] CRITICAL: Assignments were cleared!', {
        prevCount: prevCount,
        prevKeys: prevKeys,
        newCount: newCount,
        timestamp: Date.now()
      });
    }
    
    // Alert if specific assignment was removed
    const removedKeys = prevKeys.filter((k: any) => !newKeys.includes(k));
    if (removedKeys.length > 0) {
      console.warn('⚠️ [CourseEditor] Assignments were removed:', {
        removedKeys: removedKeys,
        prevCount: prevCount,
        newCount: newCount
      });
    }
  }, [assignments]);
  
  // Additional useEffect to track when assignments prop changes (from parent)
  useEffect(() => {
    if ((course as any).assignments && Array.isArray((course as any).assignments)) {
      console.log('📥 [CourseEditor] Course prop assignments changed:', {
        count: (course as any).assignments.length,
        assignments: (course as any).assignments.map((a: any) => ({
          id: a.id,
          title: a.title,
          chapter_id: a.chapter_id
        }))
      });
    }
  }, [course]);

  // Helper function to consistently generate chapter keys
  const getChapterKey = (chapter: Chapter, index: number): string => {
    // Always return permanent ID - chapters should always have an ID
    if (!chapter.id) {
      // If chapter doesn't have ID, generate one (shouldn't happen for new chapters, but handle existing data)
      console.warn('⚠️ Chapter at index', index, 'missing ID, generating one');
      const generatedId = generateUUID();
      // Update the chapter in state to have the ID
      const updatedChapters = [...chapters];
      updatedChapters[index] = { ...updatedChapters[index], id: generatedId };
      setChapters(updatedChapters);
      return generatedId;
    }
    return chapter.id;
  };

  const loadAvailableCourses = async () => {
    try {
      const response = await fetchWithCsrf("/api/admin/courses", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        const courses = (data.courses || []).filter((c: any) => c.id !== course.id).map((c: any) => ({
          id: c.id,
          name: c.name || c.course_name || c.title || "Untitled Course",
        }));
        setAvailableCourses(courses);
      }
    } catch (error) {
      console.error("Error loading courses:", error);
    }
  };

  useEffect(() => {
    loadAvailableCourses();
  }, [course.id, loadAvailableCourses]);

  useEffect(() => {
    // Update chapters state when course.chapters changes
    if (course.chapters && course.chapters.length > 0) {
      // Ensure all chapters have permanent IDs
      const chaptersWithIds = course.chapters.map((ch: any) => {
        if (!ch.id) {
          // Generate ID for chapters that don't have one (shouldn't happen, but handle gracefully)
          console.warn('⚠️ Chapter missing ID, generating one:', ch.name || ch.title);
          return { ...ch, id: generateUUID() };
        }
        return ch;
      });
      
      console.log('📚 Updating chapters state:', {
        chaptersCount: chaptersWithIds.length,
        chaptersWithContents: chaptersWithIds.map((ch: any) => ({
          id: ch.id,
          name: ch.name || ch.title,
          contentsCount: ch.contents?.length || 0
        }))
      });
      setChapters(chaptersWithIds);
    } else if (course.chapters && course.chapters.length === 0) {
      console.log('📚 Course has no chapters');
      setChapters([]);
    }
  }, [course.chapters]);

  useEffect(() => {
    const timeSinceLastChange = Date.now() - lastAssignmentChangeRef.current;
    const hasRecentAssignment = timeSinceLastChange < 10000 && Object.keys(assignmentsRef.current).length > 0;
    
    // CRITICAL: Immediately check if questions are in course prop assignments
    const courseAssignments = (course as any).assignments || [];
    const assignmentA4 = courseAssignments.find((a: any) => a.title === 'a4' || a.id === 'ed84fe55-9c57-4a32-864b-105d44116428');
    if (assignmentA4) {
      console.group('🔍 [useEffect] IMMEDIATE CHECK - Assignment a4 in course prop');
      console.log('Assignment ID:', assignmentA4.id);
      console.log('Assignment Title:', assignmentA4.title);
      const questionsArray = Array.isArray(assignmentA4.questions) ? assignmentA4.questions : [];
      console.log('Questions Count:', questionsArray.length);
      console.log('Questions Is Array:', Array.isArray(assignmentA4.questions));
      console.log('Questions Type:', typeof assignmentA4.questions);
      console.log('Has Questions Property:', 'questions' in assignmentA4);
      console.log('Questions Value:', assignmentA4.questions);
      if (questionsArray.length > 0) {
        console.log('✅ QUESTIONS FOUND:', questionsArray.length);
        questionsArray.forEach((q: any, idx: number) => {
          console.log(`  Question ${idx + 1}:`, { id: q.id, type: q.question_type, text: q.question_text?.substring(0, 50) });
        });
      } else {
        console.error('❌ NO QUESTIONS in course prop!');
        console.error('Full Assignment:', JSON.parse(JSON.stringify(assignmentA4)));
        
        // CRITICAL: If no questions in course prop, fetch directly from API to verify
        console.log('🔍 Fetching course directly from API to verify questions...');
        fetchWithCsrf(`/api/admin/courses/${course.id}`, { cache: 'no-store' })
          .then(async (response) => {
            if (response.ok) {
              const data = await response.json();
              const apiAssignmentA4 = data.course?.assignments?.find((a: any) => a.title === 'a4' || a.id === 'ed84fe55-9c57-4a32-864b-105d44116428');
              if (apiAssignmentA4) {
                console.group('📡 [API Direct Fetch] Assignment a4 from API');
                const apiQuestions = Array.isArray(apiAssignmentA4.questions) ? apiAssignmentA4.questions : [];
                console.log('Questions Count:', apiQuestions.length);
                console.log('Questions:', apiQuestions);
                if (apiQuestions.length > 0) {
                  console.log('✅ QUESTIONS FOUND in API response!');
                  apiQuestions.forEach((q: any, idx: number) => {
                    console.log(`  Question ${idx + 1}:`, { id: q.id, type: q.question_type, text: q.question_text?.substring(0, 50) });
                  });
                } else {
                  console.error('❌ NO QUESTIONS in API response either!');
                  console.error('Full API Assignment:', JSON.parse(JSON.stringify(apiAssignmentA4)));
                }
                console.groupEnd();
              } else {
                console.error('❌ Assignment a4 not found in API response!');
              }
            } else {
              console.error('❌ API fetch failed:', response.status, response.statusText);
            }
          })
          .catch((error) => {
            console.error('❌ Error fetching from API:', error);
          });
      }
      console.groupEnd();
    }
    
    console.log('🔄 CourseEditor useEffect triggered:', {
      courseId: course.id,
      chaptersCount: course.chapters?.length || 0,
      localChaptersCount: chapters.length,
      hasChapterContents: !!(course as any).chapter_contents,
      chapterContentsCount: (course as any).chapter_contents?.length || 0,
      hasAssignments: !!(courseAssignments && courseAssignments.length > 0),
      assignmentsCount: courseAssignments.length,
      currentAssignmentsInState: Object.keys(assignments).length,
      currentAssignmentsInRef: Object.keys(assignmentsRef.current).length,
      timeSinceLastAssignmentChange: timeSinceLastChange,
      hasRecentAssignment: hasRecentAssignment,
      assignmentA4HasQuestions: assignmentA4 ? (Array.isArray(assignmentA4.questions) ? assignmentA4.questions.length : 0) : 'not found',
      timestamp: Date.now()
    });
    
    loadChapterContents();
    
    // Load videos from API if available
    if ((course as any).videos && Array.isArray((course as any).videos)) {
      const courseVideos = (course as any).videos.map((v: any) => ({
        chapter_id: v.chapter_id || '',
        title: v.title || '',
        video_url: v.video_url || '',
        duration: v.duration || undefined,
      }));
      setVideos(courseVideos);
      console.log('📹 Loaded videos from course prop:', courseVideos.length);
    }
    
    // Load assignments after chapters are available
    // NOTE: Removed course.assignments from dependencies to prevent overwriting local unsaved assignments
    // CRITICAL: Skip loadAssignments if assignment was just created
    if (hasRecentAssignment) {
      console.log('⏸️ [useEffect] Skipping loadAssignments - assignment was recently created', {
        timeSinceLastChange: timeSinceLastChange,
        assignmentsCount: Object.keys(assignmentsRef.current).length
      });
    } else if (chapters.length > 0 || (course.chapters && course.chapters.length > 0)) {
      console.log('📋 [useEffect] Calling loadAssignments...');
      loadAssignments();
    } else {
      console.log('⏸️ [useEffect] Skipping loadAssignments - no chapters available');
    }
  }, [chapters, course.chapters, course.id, courseChapterContents, courseAssignments, courseVideos]);
  
  // Watch for assignments in course prop and force load if they appear
  useEffect(() => {
    const courseAssignments = (course as any).assignments;
    if (courseAssignments && Array.isArray(courseAssignments) && courseAssignments.length > 0) {
      console.log('📥 [useEffect] Course prop assignments detected, checking if load is needed...', {
        assignmentsCount: courseAssignments.length,
        currentStateCount: Object.keys(assignments).length,
        currentRefCount: Object.keys(assignmentsRef.current).length,
        hasInitialLoadCompleted: hasInitialLoadCompletedRef.current
      });
      
      // If we have assignments in course prop but none in state, force reload
      if (Object.keys(assignmentsRef.current).length === 0) {
        console.log('📥 [useEffect] No assignments in state but course prop has assignments, forcing loadAssignments...');
        // Reset initial load flag to allow reload
        hasInitialLoadCompletedRef.current = false;
        loadAssignments();
      } else {
        // Check if assignments from course prop match what we have in state
        const courseAssignmentIds = new Set(courseAssignments.map((a: any) => a.id).filter(Boolean));
        const stateAssignmentIds = new Set(Object.values(assignmentsRef.current).map((a: any) => a.id).filter(Boolean));
        
        // If there are new assignments in course prop that aren't in state, reload
        const hasNewAssignments = Array.from(courseAssignmentIds).some((id: any) => !stateAssignmentIds.has(id));
        if (hasNewAssignments) {
          console.log('📥 [useEffect] New assignments detected in course prop, forcing reload...');
          hasInitialLoadCompletedRef.current = false;
          loadAssignments();
        }
      }
    }
  }, [courseAssignments, assignments, course]);
  
  // Track component re-renders
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  useEffect(() => {
    console.log('🎨 [CourseEditor] Component rendered:', {
      renderCount: renderCountRef.current,
      assignmentsCount: Object.keys(assignments).length,
      refCount: Object.keys(assignmentsRef.current).length
    });
  });

  const loadChapterContents = async () => {
    // Load chapter contents from the chapters prop (which includes contents from API)
    const contents: Record<string, ChapterContent[]> = {};
    
    // Use course.chapters if available (from API), otherwise use local chapters state
    const chaptersToUse = course.chapters || chapters;
    
    // First, try to load from chapters.contents (nested structure)
    chaptersToUse.forEach((ch: any) => {
      if (ch.id) {
        // Check if chapter has contents array (from API response structure)
        const chapterContents = ch.contents || [];
        if (chapterContents.length > 0) {
          contents[ch.id] = chapterContents.map((content: any) => ({
            id: content.id || content.content_id,
            content_id: content.content_id || content.id,
            chapter_id: content.chapter_id || ch.id,
            content_type: content.content_type || 'text',
            title: content.title || '',
            content_url: content.content_url || null,
            content_text: content.content_text || null,
            duration_minutes: content.duration_minutes || null,
            storage_path: content.storage_path || null,
            order_index: content.order_index || 0,
          }));
        } else {
          // Initialize empty array if no contents
          contents[ch.id] = [];
        }
      }
    });
    
    // Fallback: If no contents found in chapters, check top-level chapter_contents array
    const totalContentsFromChapters = Object.values(contents).reduce((sum: number, arr: any) => sum + arr.length, 0);
    if (totalContentsFromChapters === 0 && (course as any).chapter_contents) {
      console.log('📦 No contents in chapters, checking top-level chapter_contents array...');
      const topLevelContents = (course as any).chapter_contents || [];
      
      // Group by chapter_id
      topLevelContents.forEach((content: any) => {
        const chapterId = content.chapter_id;
        if (chapterId) {
          if (!contents[chapterId]) {
            contents[chapterId] = [];
          }
          contents[chapterId].push({
            id: content.id || content.content_id,
            content_id: content.content_id || content.id,
            chapter_id: content.chapter_id,
            content_type: content.content_type || 'text',
            title: content.title || '',
            content_url: content.content_url || null,
            content_text: content.content_text || null,
            duration_minutes: content.duration_minutes || null,
            storage_path: content.storage_path || null,
            order_index: content.order_index || 0,
          });
        }
      });
    }
    
    // If still no contents, try fetching directly from API
    if (Object.values(contents).reduce((sum: number, arr: any) => sum + arr.length, 0) === 0 && chaptersToUse.length > 0) {
      console.log('📦 No contents found in course data, fetching from API...');
      try {
        const response = await fetchWithCsrf(`/api/admin/courses/${course.id}`, {
          cache: 'no-store',
        });
        if (response.ok) {
          const data = await response.json();
          
          // Check if response contains an error
          if (data.error) {
            console.error('❌ API returned error:', data.error, data.details);
            throw new Error(data.message || data.details || data.error);
          }
          
          if (!data.course) {
            throw new Error('Course data not found in API response');
          }
          
          const fetchedCourse = data.course;
          
          // Try chapters.contents first
          if (fetchedCourse.chapters) {
            fetchedCourse.chapters.forEach((ch: any) => {
              if (ch.id && ch.contents && ch.contents.length > 0) {
                if (!contents[ch.id]) {
                  contents[ch.id] = [];
                }
                contents[ch.id] = ch.contents.map((content: any) => ({
                  id: content.id || content.content_id,
                  content_id: content.content_id || content.id,
                  chapter_id: content.chapter_id || ch.id,
                  content_type: content.content_type || 'text',
                  title: content.title || '',
                  content_url: content.content_url || null,
                  content_text: content.content_text || null,
                  duration_minutes: content.duration_minutes || null,
                  storage_path: content.storage_path || null,
                  order_index: content.order_index || 0,
                }));
              }
            });
          }
          
          // Try top-level chapter_contents
          if (fetchedCourse.chapter_contents && fetchedCourse.chapter_contents.length > 0) {
            fetchedCourse.chapter_contents.forEach((content: any) => {
              const chapterId = content.chapter_id;
              if (chapterId) {
                if (!contents[chapterId]) {
                  contents[chapterId] = [];
                }
                contents[chapterId].push({
                  id: content.id || content.content_id,
                  content_id: content.content_id || content.id,
                  chapter_id: content.chapter_id,
                  content_type: content.content_type || 'text',
                  title: content.title || '',
                  content_url: content.content_url || null,
                  content_text: content.content_text || null,
                  duration_minutes: content.duration_minutes || null,
                  storage_path: content.storage_path || null,
                  order_index: content.order_index || 0,
                });
              }
            });
          }
        }
      } catch (error) {
        console.error('Error fetching chapter contents:', error);
      }
    }
    
    const totalContents = Object.values(contents).reduce((sum: number, arr: any) => sum + arr.length, 0);
    console.log('📦 Loaded chapter contents:', {
      chaptersCount: chaptersToUse.length,
      contentsKeys: Object.keys(contents),
      contentsCount: totalContents,
      contentsByChapter: Object.entries(contents).map(([id, arr]) => ({ 
        chapterId: id, 
        count: arr.length,
        chapterName: chaptersToUse.find((ch: any) => ch.id === id)?.name || 'Unknown'
      })),
      courseId: course.id,
      hasNestedContents: chaptersToUse.some((ch: any) => ch.contents && ch.contents.length > 0),
      hasTopLevelContents: !!(course as any).chapter_contents && (course as any).chapter_contents.length > 0
    });
    
    if (totalContents === 0 && chaptersToUse.length > 0) {
      console.warn('⚠️ No chapter contents found for course:', {
        courseId: course.id,
        courseName: course.name,
        chaptersCount: chaptersToUse.length,
        chapterIds: chaptersToUse.map((ch: any) => ch.id),
        courseDataKeys: Object.keys(course)
      });
    }
    
    setChapterContents(contents);
  };

  const loadAssignments = useCallback(async () => {
    const isInitialLoad = !hasInitialLoadCompletedRef.current;
    
    // CRITICAL: Always allow initial load to proceed - this is the most important fix
    // Initial load should never be blocked by safeguards
    if (isInitialLoad) {
      console.log('🔄 [loadAssignments] Initial load - proceeding without safeguards');
    } else {
      // SAFEGUARD: Only apply safeguards after initial load
      // Skip if an assignment was just created (within last 2 seconds)
      const timeSinceLastChange = Date.now() - lastAssignmentChangeRef.current;
      const hasLocalAssignments = Object.keys(assignmentsRef.current).length > 0;
      const hasUnsavedAssignments = Object.values(assignmentsRef.current).some((a: any) => !a.id);
      const hasAnyAssignments = Object.keys(assignmentsRef.current).length > 0;
      
      // After initial load, apply safeguards
      if (hasAnyAssignments && timeSinceLastChange < 10000) {
        console.log('⏳ Skipping loadAssignments - assignments exist and were recently created', {
          timeSinceLastChange: timeSinceLastChange,
          assignmentsCount: Object.keys(assignmentsRef.current).length,
          hasUnsavedAssignments: hasUnsavedAssignments,
          hasAnyAssignments: hasAnyAssignments,
          assignments: Object.entries(assignmentsRef.current).map(([k, a]) => ({
            key: k,
            title: a.title,
            hasId: !!a.id
          }))
        });
        return;
      }
      
      // Additional safeguard: if there are unsaved assignments, skip (but allow initial load)
      if (hasUnsavedAssignments) {
        console.log('⏳ Skipping loadAssignments - unsaved assignments exist', {
          assignmentsCount: Object.keys(assignmentsRef.current).length,
          unsavedAssignments: Object.entries(assignmentsRef.current)
            .filter(([k, a]) => !a.id)
            .map(([k, a]) => ({ key: k, title: a.title }))
        });
        return;
      }
    }
    
    // SAFEGUARD: Skip if already loading to prevent concurrent loads
    if (isLoadingAssignmentsRef.current) {
      console.log('⏳ Skipping loadAssignments - already loading');
      return;
    }
    
    isLoadingAssignmentsRef.current = true;
    console.log('🔄 [loadAssignments] Starting...', {
      isInitialLoad: isInitialLoad,
      currentAssignmentsCount: Object.keys(assignmentsRef.current).length,
      willProceed: true
    });
    
    try {
      // CRITICAL: Use ref to get the latest assignments state
      // This prevents race conditions where assignments might be cleared due to stale closures
      const currentAssignments = assignmentsRef.current;
      
      // Store isInitialLoad in a variable accessible to the matching logic
      const isInitialLoadFlag = isInitialLoad;
      
      // Start with existing local assignments to preserve unsaved ones
      // CRITICAL: Preserve ALL local assignments (both saved and unsaved) to prevent data loss
      // Only overwrite with API data if we have a saved version (with ID)
      const assignmentsData: Record<string, Assignment> = {};
    
    // Preserve ALL local assignments first - this ensures newly created assignments aren't lost
    Object.entries(currentAssignments).forEach(([chapterKey, assignment]) => {
      assignmentsData[chapterKey] = { ...assignment };
      console.log('💾 Preserving local assignment:', {
        chapterKey: chapterKey,
        assignmentTitle: assignment.title,
        hasId: !!assignment.id,
        isNew: !assignment.id
      });
    });
    
    // Get assignments from course prop (API returns assignments array)
    let courseAssignments = (course as any).assignments || [];
    
    // CRITICAL: Explicitly check if questions are in course prop assignments
    console.log('📥 [loadAssignments] Course prop assignments check:', {
      totalAssignments: courseAssignments.length,
      assignments: courseAssignments.map((a: any) => ({
        id: a.id,
        title: a.title,
        questionsCount: Array.isArray(a.questions) ? a.questions.length : 0,
        hasQuestions: Array.isArray(a.questions) && a.questions.length > 0,
        questionsIsArray: Array.isArray(a.questions),
        questionsType: typeof a.questions,
        hasQuestionsProperty: 'questions' in a
      }))
    });
    
    // #region agent log
    const assignmentA4FromProp = courseAssignments.find((a: any) => a.title === 'a4' || a.id === 'ed84fe55-9c57-4a32-864b-105d44116428');
    if (assignmentA4FromProp) {
      const questionsArray = Array.isArray(assignmentA4FromProp.questions) ? assignmentA4FromProp.questions : [];
      console.group('📋 [loadAssignments] Assignment a4 from course prop');
      console.log('Assignment ID:', assignmentA4FromProp.id);
      console.log('Assignment Title:', assignmentA4FromProp.title);
      console.log('Questions Count:', questionsArray.length);
      console.log('Has Questions:', questionsArray.length > 0);
      console.log('Questions Is Array:', Array.isArray(assignmentA4FromProp.questions));
      console.log('Questions Type:', typeof assignmentA4FromProp.questions);
      console.log('Has Questions Property:', 'questions' in assignmentA4FromProp);
      
      if (questionsArray.length > 0) {
        console.log('✅ QUESTIONS FOUND:', questionsArray.length);
        questionsArray.forEach((q: any, idx: number) => {
          console.log(`  Question ${idx + 1}:`, {
            id: q.id,
            type: q.question_type,
            text: q.question_text?.substring(0, 50)
          });
        });
      } else {
        console.error('❌ NO QUESTIONS in course prop for a4!');
        console.error('All Properties:', Object.keys(assignmentA4FromProp));
        console.error('Questions Property:', assignmentA4FromProp.questions);
        console.error('Full Assignment:', JSON.parse(JSON.stringify(assignmentA4FromProp)));
      }
      console.groupEnd();
    } else {
      console.warn('⚠️ [loadAssignments] Assignment a4 NOT FOUND in course prop!', {
        totalAssignments: courseAssignments.length,
        assignmentTitles: courseAssignments.map((a: any) => a.title)
      });
    }
    fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:567',message:'BEFORE loadAssignments - checking course prop',data:{totalAssignmentsInProp:courseAssignments.length,assignmentA4Exists:!!assignmentA4FromProp,assignmentA4Questions:assignmentA4FromProp?.questions?.length||0,assignmentA4HasQuestionsProp:'questions' in (assignmentA4FromProp||{}),assignmentA4Keys:Object.keys(assignmentA4FromProp||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // If no assignments in course prop, try fetching directly from API
    if (courseAssignments.length === 0) {
      console.log('⚠️ No assignments in course prop, fetching directly from API...');
      console.log('   Course ID:', course.id);
      try {
        const response = await fetchWithCsrf(`/api/admin/courses/${course.id}`, {
          cache: 'no-store',
        });
        
        console.log('   API Response status:', response.status, response.statusText);
        
        if (response.ok) {
          const data = await response.json();
          console.log('   API Response data keys:', Object.keys(data));
          console.log('   Course data keys:', data.course ? Object.keys(data.course) : 'No course data');
          
          courseAssignments = data.course?.assignments || [];
          console.log(`✅ Fetched ${courseAssignments.length} assignment(s) directly from API`);
          
          if (courseAssignments.length > 0) {
            console.log('   Assignments from API:', courseAssignments.map((a: any) => ({
              id: a.id,
              title: a.title,
              chapter_id: a.chapter_id,
              hasConfig: !!a.config
            })));
          } else {
            console.warn('   ⚠️ API returned 0 assignments. Checking if assignments exist in database...');
          }
        } else {
          const errorText = await response.text();
          console.error('   ❌ API Error:', response.status, errorText);
        }
      } catch (error) {
        console.error('❌ Error fetching assignments directly:', error);
      }
    } else {
      console.log(`✅ Found ${courseAssignments.length} assignment(s) in course prop`);
    }
    
    // Get chapters to build a mapping
    const chaptersToUse = course.chapters || chapters;
    
    console.log('📋 Loading assignments:', {
      preservedLocalCount: Object.keys(assignmentsData).length,
      apiAssignmentsCount: courseAssignments.length,
      chaptersCount: chaptersToUse.length,
      chapterIds: chaptersToUse.map((ch: any) => ch.id),
      assignments: courseAssignments.map((a: any) => ({
        id: a.id,
        title: a.title,
        chapter_id: a.chapter_id,
        hasConfig: !!a.config
      }))
    });
    
    // Group assignments by chapter_id using permanent IDs
    courseAssignments.forEach((assignment: any) => {
      // Extract chapter_id - should always be present with permanent ID system
      let chapterId: string | null = null;
      if (assignment.chapter_id) {
        chapterId = assignment.chapter_id;
      } else if (assignment.config) {
        // Fallback: try to extract from config (for backward compatibility)
        try {
          const config = typeof assignment.config === 'string' 
            ? JSON.parse(assignment.config) 
            : assignment.config;
          chapterId = config.chapter_id || null;
        } catch (e) {
          console.warn('Error parsing assignment config:', e);
        }
      }
      
      if (chapterId) {
        // Find matching chapter by permanent ID
        // Try multiple matching strategies for robustness
        let matchingChapter = chaptersToUse.find((ch: any) => {
          if (!ch.id) return false;
          // Direct match
          if (ch.id === chapterId) return true;
          // Case-insensitive match
          const chId = String(ch.id).trim().toLowerCase();
          const assignId = String(chapterId).trim().toLowerCase();
          return chId === assignId;
        });
        
        // If no match found, try UUID comparison (handle different UUID formats)
        if (!matchingChapter && chapterId) {
          matchingChapter = chaptersToUse.find((ch: any) => {
            if (!ch.id) return false;
            // Remove dashes and compare (handles UUID format differences)
            const chIdNormalized = String(ch.id).replace(/-/g, '').toLowerCase();
            const assignIdNormalized = String(chapterId).replace(/-/g, '').toLowerCase();
            return chIdNormalized === assignIdNormalized;
          });
        }
        
        if (matchingChapter && matchingChapter.id) {
          // Use chapter's permanent ID as key
          const chapterKey = matchingChapter.id;
          
          // Merge with existing assignment if one exists for this chapter
          const existingAssignment = assignmentsData[chapterKey];
          if (existingAssignment && !existingAssignment.id) {
            // There's an unsaved local assignment, but we have a saved one from API
            console.log('🔄 Replacing local unsaved assignment with saved one from API:', {
              chapterId: chapterKey,
              savedTitle: assignment.title,
              localTitle: existingAssignment.title
            });
          } else if (existingAssignment && existingAssignment.id) {
            // Both have IDs - use the API version (it's more up-to-date)
            console.log('🔄 Updating existing saved assignment with API data:', {
              chapterId: chapterKey,
              apiTitle: assignment.title,
              existingTitle: existingAssignment.title
            });
          }
          
          console.log('✅ Adding assignment to state:', {
            chapterId: chapterKey,
            assignmentTitle: assignment.title,
            assignmentId: assignment.id,
            assignmentChapterId: chapterId,
            matchingChapterId: matchingChapter.id,
            matchingChapterName: matchingChapter.name,
            rawQuestionsFromAPI: assignment.questions,
            questionsCount: assignment.questions?.length || 0,
            hasQuestionsProperty: 'questions' in assignment,
            allAssignmentKeys: Object.keys(assignment)
          });
          
          // Store assignment using chapter's permanent ID as key
          // CRITICAL: Ensure questions are included - check both assignment.questions and assignment.questions array
          const questionsFromAPI = assignment.questions || [];
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:715',message:'BEFORE storing assignment in state',data:{assignmentId:assignment.id,assignmentTitle:assignment.title,chapterKey,questionsFromAPICount:questionsFromAPI.length,questionsFromAPI:questionsFromAPI.map((q:any)=>({id:q.id,type:q.question_type})),rawQuestionsFromAssignment:assignment.questions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          assignmentsData[chapterKey] = {
            id: assignment.id,
            chapter_id: chapterKey, // Use the matched chapter's ID (not the original chapterId which might have format differences)
            title: assignment.title || '',
            description: assignment.description || '',
            max_score: assignment.max_score || assignment.max_marks || 100,
            auto_grading_enabled: assignment.auto_grading_enabled || false,
            questions: questionsFromAPI, // Use the questions from API directly
          };
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:725',message:'AFTER storing assignment in state',data:{chapterKey,assignmentId:assignmentsData[chapterKey].id,questionsInState:assignmentsData[chapterKey].questions?.length||0,questionsInStateArray:assignmentsData[chapterKey].questions?.map((q:any)=>({id:q.id,type:q.question_type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          // Debug: Log questions for this assignment
          if (assignmentsData[chapterKey].questions && assignmentsData[chapterKey].questions.length > 0) {
            console.log(`✅ [loadAssignments] Assignment "${assignment.title}" has ${assignmentsData[chapterKey].questions.length} question(s):`, 
              assignmentsData[chapterKey].questions.map((q: any) => ({
                id: q.id,
                question_type: q.question_type,
                question_text: q.question_text?.substring(0, 50) + '...'
              }))
            );
          } else {
            // CRITICAL: Check if questions were in API but lost during state storage
            const hadQuestionsInAPI = assignment.questions && assignment.questions.length > 0;
            const hasQuestionsInState = assignmentsData[chapterKey].questions && assignmentsData[chapterKey].questions.length > 0;
            
            if (hadQuestionsInAPI && !hasQuestionsInState) {
              console.error(`❌ [loadAssignments] CRITICAL: Questions LOST during state storage!`, {
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
                questionsInAPI: assignment.questions.length,
                questionsInState: assignmentsData[chapterKey].questions?.length || 0,
                questionsFromAPIVar: questionsFromAPI.length,
                storedAssignment: JSON.stringify(assignmentsData[chapterKey], null, 2).substring(0, 1000)
              });
            } else {
              console.log(`⚠️ [loadAssignments] Assignment "${assignment.title}" has NO questions.`, {
                rawAssignmentQuestions: assignment.questions,
                questionsType: typeof assignment.questions,
                questionsIsArray: Array.isArray(assignment.questions),
                questionsLength: assignment.questions?.length,
                hadQuestionsInAPI: hadQuestionsInAPI,
                hasQuestionsInState: hasQuestionsInState,
                fullAssignmentObject: JSON.stringify(assignment, null, 2).substring(0, 500)
              });
            }
          }
        } else {
          // Chapter not found - log detailed warning
          console.warn('⚠️ Assignment chapter_id does not match any chapter:', {
            assignmentId: assignment.id,
            assignmentTitle: assignment.title,
            assignmentChapterId: chapterId,
            assignmentChapterIdType: typeof chapterId,
            assignmentChapterIdLength: chapterId?.length,
            availableChapterIds: chaptersToUse.map((ch: any) => ({
              id: ch.id,
              idType: typeof ch.id,
              idLength: ch.id?.length,
              name: ch.name || ch.title
            })),
            chaptersCount: chaptersToUse.length
          });
          
          // On initial load, try to use first chapter as fallback to ensure assignment is loaded
          if (isInitialLoadFlag && chaptersToUse.length > 0) {
            const fallbackChapter = chaptersToUse[0];
            const fallbackKey = fallbackChapter.id;
            if (fallbackKey) {
              console.warn(`   Using first chapter as fallback: ${fallbackKey} (${fallbackChapter.name || (fallbackChapter as any).title || 'Unknown'})`);
              
              assignmentsData[fallbackKey] = {
                id: assignment.id,
                chapter_id: fallbackKey,
                title: assignment.title || '',
                description: assignment.description || '',
                max_score: assignment.max_score || assignment.max_marks || 100,
                auto_grading_enabled: assignment.auto_grading_enabled || false,
                questions: assignment.questions || [],
              };
            }
          }
        }
      } else {
        // No chapter_id found - try to assign to first chapter as fallback
        console.warn('⚠️ Assignment has no chapter_id, attempting fallback:', {
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          assignmentConfig: assignment.config,
          chaptersAvailable: chaptersToUse.length
        });
        
        // If we have chapters, assign to first one
        if (chaptersToUse.length > 0 && chaptersToUse[0].id) {
          const fallbackChapter = chaptersToUse[0];
          const fallbackKey = fallbackChapter.id;
          if (fallbackKey) {
            console.warn(`   Using first chapter as fallback: ${fallbackKey} (${fallbackChapter.name || (fallbackChapter as any).title || 'Unknown'})`);
            
            assignmentsData[fallbackKey] = {
              id: assignment.id,
              chapter_id: fallbackKey,
              title: assignment.title || '',
              description: assignment.description || '',
              max_score: assignment.max_score || assignment.max_marks || 100,
              auto_grading_enabled: assignment.auto_grading_enabled || false,
              questions: assignment.questions || [],
            };
          }
        } else {
          console.error('❌ Cannot assign assignment - no chapters available:', {
            assignmentId: assignment.id,
            assignmentTitle: assignment.title
          });
        }
      }
    });
    
    // Note: Removed emergency fallback - with permanent IDs, assignments should always map correctly
    
    console.log('📋 Loaded assignments (merged):', {
      preservedLocalCount: Object.keys(assignmentsData).filter((key: any) => !assignmentsData[key].id).length,
      loadedFromApiCount: Object.keys(assignmentsData).filter((key: any) => assignmentsData[key].id).length,
      totalAssignmentsCount: Object.keys(assignmentsData).length,
      assignmentsByChapter: Object.keys(assignmentsData),
      assignmentKeys: Object.keys(assignmentsData),
      chapterIds: chaptersToUse.map((ch: any) => ch.id),
      assignments: Object.entries(assignmentsData).map(([chapterId, assignment]) => ({
        chapterId: chapterId,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        assignmentChapterId: assignment.chapter_id,
        isSaved: !!assignment.id
      })),
      rawCourseAssignmentsCount: courseAssignments.length,
      chaptersCount: chaptersToUse.length
    });
    
    if (Object.keys(assignmentsData).length === 0 && courseAssignments.length > 0) {
      console.error('❌ FINAL CHECK: Still 0 assignments in state after all processing!');
      console.error('   This indicates a critical bug in the assignment loading logic.');
      console.error('   Course assignments that failed to load:', courseAssignments.map((a: any) => ({
        id: a.id,
        title: a.title,
        chapter_id: a.chapter_id,
        config: a.config
      })));
      console.error('   Available chapters:', chaptersToUse.map((ch: any) => ({
        id: ch.id,
        name: ch.name || ch.title
      })));
      
      // EMERGENCY FALLBACK: If we have assignments but they didn't match, assign them all to first chapter
      if (chaptersToUse.length > 0 && chaptersToUse[0].id) {
        const emergencyChapter = chaptersToUse[0];
        const emergencyKey = emergencyChapter.id;
        if (emergencyKey) {
          console.warn('🚨 EMERGENCY FALLBACK: Assigning all unmatched assignments to first chapter:', emergencyKey);
          courseAssignments.forEach((assignment: any, idx: number) => {
            if (!assignmentsData[emergencyKey] || idx === 0) {
              assignmentsData[emergencyKey] = {
              id: assignment.id,
              chapter_id: emergencyKey,
              title: assignment.title || `Assignment ${idx + 1}`,
              description: assignment.description || '',
              max_score: assignment.max_score || assignment.max_marks || 100,
              auto_grading_enabled: assignment.auto_grading_enabled || false,
              questions: assignment.questions || [],
            };
            }
          });
          console.warn('🚨 Emergency fallback added assignments:', Object.keys(assignmentsData));
        }
      }
    }
    
    // CRITICAL FIX: Use functional update to merge with latest state
    // This prevents race conditions where assignments created while we were loading get overwritten
    setAssignments(prevAssignments => {
      // Start with whatever is currently in state (might have new assignments created while we were loading)
      const merged: Record<string, Assignment> = {};
      
      // First, copy all assignments from API/assignmentsData
      Object.entries(assignmentsData).forEach(([key, assignment]) => {
        // #region agent log
        if (assignment.title === 'a4' || assignment.id === 'ed84fe55-9c57-4a32-864b-105d44116428') {
          fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:892',message:'Merging assignment a4 into state',data:{chapterKey:key,assignmentId:assignment.id,questionsInAssignmentData:assignment.questions?.length||0,questions:assignment.questions?.map((q:any)=>({id:q.id,type:q.question_type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        }
        // #endregion
        merged[key] = assignment;
      });
      
      // Then, preserve any LOCAL assignments (no ID) from current state that aren't in assignmentsData
      // This ensures newly created assignments aren't lost
      Object.entries(prevAssignments).forEach(([key, assignment]) => {
        if (!assignment.id) {
          // This is a newly created, unsaved assignment - always preserve it
          console.log('🔒 Preserving newly created assignment (no ID):', {
            chapterKey: key,
            title: assignment.title
          });
          merged[key] = assignment;
        } else if (!merged[key]) {
          // This is a saved assignment not in API response - keep it
          console.log('🔒 Preserving saved assignment not in API:', {
            chapterKey: key,
            title: assignment.title,
            id: assignment.id
          });
          merged[key] = assignment;
        }
      });
      
      // Also update the ref to stay in sync
      assignmentsRef.current = merged;
      
      // CRITICAL: Verify questions are preserved in merged state
      const assignmentA4InMerged = Object.values(merged).find((a: any) => a.title === 'a4' || a.id === 'ed84fe55-9c57-4a32-864b-105d44116428');
      if (assignmentA4InMerged) {
        const questionsInMerged = Array.isArray(assignmentA4InMerged.questions) ? assignmentA4InMerged.questions : [];
        const questionsCount = questionsInMerged.length;
        
        console.log('🔍 [Merge] Assignment a4 in merged state:', {
          assignmentId: assignmentA4InMerged.id,
          questionsCount: questionsCount,
          hasQuestions: questionsCount > 0,
          questionsIsArray: Array.isArray(assignmentA4InMerged.questions),
          questionsType: typeof assignmentA4InMerged.questions,
          hasQuestionsProperty: 'questions' in assignmentA4InMerged,
          questions: questionsInMerged.map((q: any) => ({ id: q.id, type: q.question_type }))
        });
        
        // Explicitly log questions so they're visible
        if (questionsCount > 0) {
          console.log('✅ [Merge] QUESTIONS FOUND in merged state:', questionsInMerged.map((q: any) => ({
            id: q.id,
            type: q.question_type,
            text: q.question_text?.substring(0, 50)
          })));
        } else {
          console.error('❌ [Merge] CRITICAL: Assignment a4 in merged state but NO QUESTIONS!', {
            assignmentId: assignmentA4InMerged.id,
            allProperties: Object.keys(assignmentA4InMerged),
            questionsProperty: assignmentA4InMerged.questions,
            questionsType: typeof assignmentA4InMerged.questions,
            questionsIsArray: Array.isArray(assignmentA4InMerged.questions),
            fullAssignment: JSON.parse(JSON.stringify(assignmentA4InMerged))
          });
        }
      }
      
      // Also check ALL assignments in merged state
      console.log('📋 [Merge] ALL assignments questions check:', 
        Object.entries(merged).map(([key, a]: [string, any]) => ({
          key: key,
          title: a.title,
          id: a.id,
          questionsCount: Array.isArray(a.questions) ? a.questions.length : 0,
          hasQuestions: Array.isArray(a.questions) && a.questions.length > 0,
          questionsIsArray: Array.isArray(a.questions),
          questionsType: typeof a.questions
        }))
      );
      
      console.log('📋 Final merged assignments:', {
        count: Object.keys(merged).length,
        keys: Object.keys(merged),
        assignments: Object.entries(merged).map(([k, a]) => ({ 
          key: k, 
          title: a.title, 
          hasId: !!a.id,
          questionsCount: a.questions?.length || 0
        }))
      });
      
      // CRITICAL: Verify assignments were actually set
      if (Object.keys(merged).length === 0 && courseAssignments.length > 0) {
        console.error('❌ CRITICAL: Merged assignments is empty but courseAssignments had data!');
        console.error('   This means assignments were lost during merge. Adding emergency fallback...');
        
        // Emergency fallback: add all course assignments to first chapter
        if (chaptersToUse.length > 0 && chaptersToUse[0].id) {
          const emergencyChapter = chaptersToUse[0];
          const emergencyKey = emergencyChapter.id;
          if (emergencyKey) {
            console.warn('🚨 EMERGENCY: Adding all assignments to first chapter:', emergencyKey);
            
            courseAssignments.forEach((assignment: any, idx: number) => {
              if (!merged[emergencyKey] || idx === 0) {
                merged[emergencyKey] = {
                id: assignment.id,
                chapter_id: emergencyKey,
                title: assignment.title || `Assignment ${idx + 1}`,
                description: assignment.description || '',
                max_score: assignment.max_score || assignment.max_marks || 100,
                auto_grading_enabled: assignment.auto_grading_enabled || false,
                questions: assignment.questions || [],
              };
              }
            });
            
            // Update ref with emergency data
            assignmentsRef.current = merged;
            console.warn('🚨 Emergency fallback completed. Merged count:', Object.keys(merged).length);
          }
        }
      }
      
      // Always return merged (never undefined)
      return merged;
    });
    
    // Mark initial load as completed
    hasInitialLoadCompletedRef.current = true;
    console.log('✅ [loadAssignments] Completed, initial load marked as done');
    
    // Final verification: check if assignments are actually in state after a short delay
    setTimeout(() => {
      const finalStateCount = Object.keys(assignmentsRef.current).length;
      if (finalStateCount === 0 && courseAssignments.length > 0) {
        console.error('❌ POST-LOAD CHECK: Assignments still not in state after loadAssignments completed!');
        console.error('   This suggests the state update failed or was overwritten.');
      } else if (finalStateCount > 0) {
        console.log(`✅ POST-LOAD CHECK: ${finalStateCount} assignment(s) confirmed in state`);
      }
    }, 500);
    
    } catch (error: any) {
      console.error('❌ Error in loadAssignments:', error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:917',message:'ERROR in loadAssignments',data:{errorMessage:error?.message,errorStack:error?.stack,courseId:course.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'N'})}).catch(()=>{});
      // #endregion
    } finally {
      isLoadingAssignmentsRef.current = false;
    }
  }, [course, chapters]);

  const handleThumbnailUpload = (fileUrl: string) => {
    setBasicInfo({ ...basicInfo, thumbnail_url: fileUrl });
  };

  const addChapter = () => {
    const newChapter: Chapter = {
      id: generateUUID(), // Generate permanent ID immediately
      name: "",
      description: "",
      learning_outcomes: [],
      order_number: chapters.length + 1,
    };
    console.log('📝 Created new chapter with permanent ID:', newChapter.id);
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
      updated.forEach((ch, i) => {
        ch.order_number = i + 1;
      });
      setChapters(updated);
      
      const chapterKey = getChapterKey(chapters[index], index);
      if (chapterKey) {
        delete chapterContents[chapterKey];
        delete assignments[chapterKey];
        console.log('🗑️ Deleted chapter and associated data:', {
          chapterKey: chapterKey,
          chapterIndex: index
        });
      }
    }
  };

  const handleSave = async () => {
    // Validate
    if (!basicInfo.name.trim()) {
      setError("Course name is required");
      setActiveTab("basic");
      return;
    }

    if (selectedSchoolIds.length === 0) {
      setError("Please select at least one school");
      setActiveTab("schools");
      return;
    }

    if (selectedGrades.length === 0) {
      setError("Please select at least one grade");
      setActiveTab("schools");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // CRITICAL: Use ref to get the absolute latest assignments state
      // This ensures newly created assignments are included even if state hasn't fully updated
      const assignmentsToSave = assignmentsRef.current;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:997',message:'handleSave: assignmentsRef.current snapshot',data:{refCount:Object.keys(assignmentsToSave).length,stateCount:Object.keys(assignments).length,refKeys:Object.keys(assignmentsToSave),refEntries:Object.entries(assignmentsToSave).map(([k,v])=>({key:k,title:v.title,id:v.id,chapter_id:v.chapter_id}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      console.log('🔐 Using assignmentsRef for save:', {
        refAssignmentCount: Object.keys(assignmentsToSave).length,
        stateAssignmentCount: Object.keys(assignments).length,
        refKeys: Object.keys(assignmentsToSave),
        stateKeys: Object.keys(assignments)
      });
      
      // With permanent IDs, assignments are stored with chapter IDs as keys
      // Simply convert to array format - no mapping needed
      const assignmentsArray = Object.entries(assignmentsToSave).map(([chapterId, assignment]) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:1007',message:'Mapping assignment to array format',data:{chapterId,assignmentTitle:assignment.title,assignmentId:assignment.id,assignmentChapterId:assignment.chapter_id,hasQuestions:!!assignment.questions,questionsCount:assignment.questions?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // Verify chapter ID matches assignment's chapter_id
        if (assignment.chapter_id && assignment.chapter_id !== chapterId) {
          console.warn('⚠️ Assignment chapter_id mismatch with key:', {
            key: chapterId,
            assignmentChapterId: assignment.chapter_id,
            assignmentTitle: assignment.title
          });
        }
        
        // Ensure assignment has required fields for API
        const assignmentForSave: any = {
          ...assignment,
          id: assignment.id || generateUUID(), // Ensure permanent ID
          chapter_id: chapterId, // Use chapter ID from key (should match assignment.chapter_id)
          assignment_type: (assignment as any).assignment_type || 'essay',
          max_score: assignment.max_score || (assignment as any).max_marks || 100,
          max_marks: (assignment as any).max_marks || assignment.max_score || 100,
        };
        
        console.log('📦 Prepared assignment for save:', {
          title: assignmentForSave.title,
          id: assignmentForSave.id,
          chapter_id: assignmentForSave.chapter_id,
          assignment_type: assignmentForSave.assignment_type,
          max_score: assignmentForSave.max_score,
          questionsCount: assignmentForSave.questions?.length || 0
        });
        
        return assignmentForSave;
      });
      
      // Validate assignments before saving
      const assignmentsInRef = Object.keys(assignmentsToSave).length;
      const assignmentsInState = Object.keys(assignments).length;
      console.log('📊 Assignment Save Validation:', {
        assignmentsInRef: assignmentsInRef,
        assignmentsInState: assignmentsInState,
        assignmentsArrayLength: assignmentsArray.length,
        refKeys: Object.keys(assignmentsToSave),
        stateKeys: Object.keys(assignments),
        refDetails: Object.entries(assignmentsToSave).map(([chapterId, ass]) => ({
          chapterId: chapterId,
          title: ass.title,
          hasId: !!ass.id,
          questionsCount: ass.questions?.length || 0,
          chapter_id: ass.chapter_id,
          idMatches: ass.chapter_id === chapterId
        })),
        chaptersCount: chapters.length,
        chapterIds: chapters.map((ch) => ({ id: ch.id, name: ch.name }))
      });
      
      if (assignmentsInRef > 0 && assignmentsArray.length === 0) {
        console.error('❌ CRITICAL: Assignments exist in ref but assignmentsArray is empty!');
        console.error('   This means assignments are not being properly converted to array format.');
        console.error('   Assignments ref:', JSON.stringify(assignmentsToSave, null, 2));
        console.error('   Chapter IDs in ref:', Object.keys(assignmentsToSave));
        console.error('   Available chapter IDs:', chapters.map((ch) => ch.id));
        alert('⚠️ Warning: Assignments exist but may not be saved. Check console for details.');
      }
      
      // Additional check: warn if state and ref are out of sync
      if (assignmentsInRef !== assignmentsInState) {
        console.warn('⚠️ Assignments ref and state are out of sync:', {
          refCount: assignmentsInRef,
          stateCount: assignmentsInState
        });
      }
      
      // Validate each assignment has required fields
      const invalidAssignments: string[] = [];
      assignmentsArray.forEach((assignment: any, index: number) => {
        if (!assignment.title || !assignment.title.trim()) {
          invalidAssignments.push(`Assignment at index ${index}: Missing title`);
        }
        if (!assignment.chapter_id || assignment.chapter_id.trim() === '') {
          invalidAssignments.push(`Assignment "${assignment.title || 'Untitled'}": Missing chapter_id`);
        }
        if (!assignment.assignment_type) {
          console.warn(`⚠️ Assignment "${assignment.title}" missing assignment_type, will default to 'essay'`);
        }
      });
      
      if (invalidAssignments.length > 0) {
        console.error('❌ Invalid assignments detected:', invalidAssignments);
        setError(`Cannot save: ${invalidAssignments.join('; ')}`);
        setSaving(false);
        return;
      }
      
      if (assignmentsArray.length > 0) {
        console.log('✅ Assignments validated and will be saved:', assignmentsArray.map((a: any) => ({
          title: a.title,
          chapter_id: a.chapter_id,
          assignment_type: a.assignment_type,
          questionsCount: a.questions?.length || 0,
          hasId: !!a.id,
          max_score: a.max_score
        })));
      } else {
        console.log('ℹ️ No assignments to save (this is OK if no assignments were created)');
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:1098',message:'Before creating courseData object',data:{assignmentsArrayLength:assignmentsArray.length,assignmentsArray:assignmentsArray.map((a:any)=>({title:a.title,chapter_id:a.chapter_id,id:a.id})),chaptersCount:chapters.length,chapterIds:chapters.map(ch=>ch.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      console.log('💾 Saving course with data:', {
        courseId: course.id,
        chaptersCount: chapters.length,
        assignmentsCount: assignmentsArray.length,
        chapterContentsCount: Object.values(chapterContents).flat().length,
        assignmentsDetails: assignmentsArray.length > 0 ? assignmentsArray.map((a: any) => ({
          title: a.title,
          chapter_id: a.chapter_id,
          assignment_type: a.assignment_type,
          questionsCount: a.questions?.length || 0
        })) : 'No assignments'
      });
      
      const courseData = {
        id: course.id,
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
          contents.map((content: any) => ({
            ...content,
            chapter_id: chapterId,
          }))
        ),
        assignments: assignmentsArray, // Always include, even if empty
        videos: videos.length > 0 ? videos.map((v: any) => ({
          chapter_id: v.chapter_id,
          title: v.title,
          video_url: v.video_url,
          duration: v.duration || undefined,
        })) : undefined,
        status: course.status,
      };
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:1130',message:'courseData object created, calling onSave',data:{courseId:courseData.id,hasAssignments:!!courseData.assignments,assignmentsCount:courseData.assignments?.length||0,assignmentsInCourseData:courseData.assignments?.map((a:any)=>({title:a.title,chapter_id:a.chapter_id,id:a.id}))||[],allKeys:Object.keys(courseData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      // Final validation before sending
      console.log('📤 Final courseData being sent:', {
        courseId: courseData.id,
        hasAssignments: !!courseData.assignments,
        assignmentsCount: courseData.assignments?.length || 0,
        assignmentsArray: courseData.assignments,
        assignmentsDetails: courseData.assignments?.map((a: any) => ({
          title: a.title,
          chapter_id: a.chapter_id,
          assignment_type: a.assignment_type,
          questionsCount: a.questions?.length || 0,
          hasId: !!a.id
        })) || [],
        chaptersCount: courseData.chapters?.length || 0,
        chapterContentsCount: courseData.chapter_contents?.length || 0,
        allKeys: Object.keys(courseData)
      });

      onSave(courseData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Messages */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">
            Course saved successfully!
          </AlertDescription>
        </Alert>
      )}

      {/* Editor Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">
            <BookOpen className="h-4 w-4 mr-2" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger value="schools">
            <School className="h-4 w-4 mr-2" />
            Schools & Grades
          </TabsTrigger>
          <TabsTrigger value="chapters">
            <FileText className="h-4 w-4 mr-2" />
            Chapters
          </TabsTrigger>
          <TabsTrigger value="associations">
            <Link2 className="h-4 w-4 mr-2" />
            Associations
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Update course name, description, and other basic details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    onValueChange={(value) => setBasicInfo({ ...basicInfo, difficulty_level: value as 'Beginner' | 'Intermediate' | 'Advanced' })}
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
                </div>
              </div>

              <div>
                <Label>Course Thumbnail</Label>
                <FileUploadZone
                  type="thumbnail"
                  courseId={course.id}
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schools & Grades Tab */}
        <TabsContent value="schools" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>School & Grade Assignment</CardTitle>
              <CardDescription>
                Assign this course to schools and grades
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SchoolGradeSelector
                selectedSchoolIds={selectedSchoolIds}
                selectedGrades={selectedGrades}
                onSchoolChange={setSelectedSchoolIds}
                onGradeChange={setSelectedGrades}
                required
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chapters Tab */}
        <TabsContent value="chapters" className="space-y-4">
          {/* Debug Display - Temporary */}
          {process.env.NODE_ENV === 'development' && (
            <Card className="bg-yellow-50 border-yellow-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">🐛 Debug: Assignments State</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      console.log('🔄 Manual refresh triggered');
                      hasInitialLoadCompletedRef.current = false;
                      loadAssignments();
                    }}
                    className="text-xs"
                  >
                    🔄 Force Reload
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="text-xs">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <strong>State Count:</strong> {Object.keys(assignments).length}
                    </div>
                    <div>
                      <strong>Ref Count:</strong> {Object.keys(assignmentsRef.current).length}
                    </div>
                    <div>
                      <strong>Course Prop Assignments:</strong> {(course as any).assignments?.length || 0}
                    </div>
                    <div>
                      <strong>Initial Load Completed:</strong> {hasInitialLoadCompletedRef.current ? '✅ Yes' : '❌ No'}
                    </div>
                    <div>
                      <strong>Is Loading:</strong> {isLoadingAssignmentsRef.current ? '⏳ Yes' : '✅ No'}
                    </div>
                    <div>
                      <strong>Chapters Count:</strong> {chapters.length}
                    </div>
                  </div>
                  
                  <div>
                    <strong>Course Prop Assignments Details:</strong>
                    <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-24">
                      {JSON.stringify(
                        ((course as any).assignments || []).map((a: any) => ({
                          id: a.id,
                          title: a.title,
                          chapter_id: a.chapter_id,
                          questionsCount: a.questions?.length || 0,
                          hasQuestions: 'questions' in a,
                          questions: a.questions?.map((q: any) => ({ id: q.id, type: q.question_type, text: q.question_text?.substring(0, 30) })) || [],
                          hasConfig: !!a.config,
                          configChapterId: a.config ? (() => {
                            try {
                              const config = typeof a.config === 'string' ? JSON.parse(a.config) : a.config;
                              return config.chapter_id;
                            } catch {
                              return null;
                            }
                          })() : null
                        })),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                  
                  <div>
                    <strong>Assignments in State:</strong>
                    <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto max-h-32">
                      {JSON.stringify(
                        Object.entries(assignments).map(([key, ass]) => ({
                          key: key,
                          title: ass.title,
                          id: ass.id,
                          chapter_id: ass.chapter_id,
                          questionsCount: ass.questions?.length || 0,
                          hasQuestions: 'questions' in ass,
                          questions: ass.questions?.map((q: any) => ({ id: q.id, type: q.question_type, text: q.question_text?.substring(0, 30) })) || []
                        })),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                  
                  <div>
                    <strong>Chapter Keys & IDs:</strong>
                    <pre className="mt-1 p-2 bg-white rounded text-xs overflow-auto">
                      {JSON.stringify(
                        chapters.map((ch, idx) => ({
                          index: idx,
                          chapterId: ch.id,
                          chapterKey: getChapterKey(ch, idx),
                          name: ch.name
                        })),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                  
                  <div>
                    <strong>Chapter ID Matching Test:</strong>
                    <pre className="mt-1 p-2 bg-white rounded text-xs">
                      {(() => {
                        const courseAssignments = (course as any).assignments || [];
                        if (courseAssignments.length === 0) {
                          return 'No assignments in course prop to match';
                        }
                        return chapters.map((ch, idx) => {
                          const chapterKey = getChapterKey(ch, idx);
                          const stateFound = assignments[chapterKey];
                          const refFound = assignmentsRef.current[chapterKey];
                          const courseAssignmentsForChapter = courseAssignments.filter((a: any) => {
                            const aChapterId = a.chapter_id || (a.config ? (() => {
                              try {
                                const config = typeof a.config === 'string' ? JSON.parse(a.config) : a.config;
                                return config.chapter_id;
                              } catch {
                                return null;
                              }
                            })() : null);
                            return aChapterId === ch.id || 
                                   String(aChapterId).toLowerCase() === String(ch.id).toLowerCase();
                          });
                          
                          return `Chapter ${idx} (${ch.name || 'Untitled'}):\n` +
                                 `  ID: ${ch.id}\n` +
                                 `  Key: ${chapterKey}\n` +
                                 `  Course Prop Assignments: ${courseAssignmentsForChapter.length}\n` +
                                 `  State: ${stateFound ? `✅ "${stateFound.title}"` : '❌ Not found'}\n` +
                                 `  Ref: ${refFound ? `✅ "${refFound.title}"` : '❌ Not found'}\n` +
                                 (courseAssignmentsForChapter.length > 0 ? 
                                   `  Course Assignments: ${courseAssignmentsForChapter.map((a: any) => 
                                     `${a.title} (chapter_id: ${a.chapter_id || 'NULL'})`
                                   ).join(', ')}\n` : '');
                        }).join('\n\n');
                      })()}
                    </pre>
                  </div>
                  
                  <div>
                    <strong>Timing Info:</strong>
                    <div className="mt-1 text-xs">
                      <div>Last assignment change: {lastAssignmentChangeRef.current > 0 ? new Date(lastAssignmentChangeRef.current).toLocaleTimeString() : 'Never'}</div>
                      <div>Time since last change: {lastAssignmentChangeRef.current > 0 ? `${Math.floor((Date.now() - lastAssignmentChangeRef.current) / 1000)}s ago` : 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Chapters & Content</CardTitle>
                  <CardDescription>
                    Manage chapters, content, and assignments
                  </CardDescription>
                </div>
                <Button type="button" onClick={addChapter}>
                  <span className="mr-1">+</span> Add Chapter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {chapters.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No chapters added yet</p>
                  <Button type="button" onClick={addChapter} className="mt-4">
                    Add First Chapter
                  </Button>
                </div>
              ) : (
                chapters.map((chapter, index) => (
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
                        chapterId={getChapterKey(chapter, index)}
                        chapterName={chapter.name || `Chapter ${index + 1}`}
                        contents={chapterContents[getChapterKey(chapter, index)] || []}
                        onContentsChange={(contents) => {
                          const chapterKey = getChapterKey(chapter, index);
                          setChapterContents({
                            ...chapterContents,
                            [chapterKey]: contents,
                          });
                        }}
                        courseId={course.id}
                        onVideoAdded={(video) => {
                          // Add video to videos array
                          setVideos(prev => [...prev, video]);
                          console.log('📹 Video added:', video);
                        }}
                      />
                      <AssignmentBuilder
                        chapterId={(() => {
                          const chapterKey = getChapterKey(chapter, index);
                          console.log('🔑 [AssignmentBuilder] Rendering with chapterId:', {
                            chapterIndex: index,
                            chapterId: chapter.id,
                            chapterKey: chapterKey,
                            chapterName: chapter.name,
                            willPassAsChapterId: chapterKey
                          });
                          return chapterKey;
                        })()}
                        chapterName={chapter.name || `Chapter ${index + 1}`}
                        assignment={(() => {
                          const chapterKey = getChapterKey(chapter, index);
                          let assignment = assignments[chapterKey] || null;
                          
                          // CRITICAL FIX: Ensure questions is always an array, never undefined or null
                          if (assignment) {
                            // Normalize questions to always be an array
                            if (!Array.isArray(assignment.questions)) {
                              console.warn('⚠️ [Assignment lookup] Questions is not an array, normalizing:', {
                                assignmentId: assignment.id,
                                assignmentTitle: assignment.title,
                                questionsType: typeof assignment.questions,
                                questionsValue: assignment.questions
                              });
                              assignment = {
                                ...assignment,
                                questions: assignment.questions ? [assignment.questions] : []
                              };
                            } else if (assignment.questions === undefined || assignment.questions === null) {
                              console.warn('⚠️ [Assignment lookup] Questions is undefined/null, setting to empty array:', {
                                assignmentId: assignment.id,
                                assignmentTitle: assignment.title
                              });
                              assignment = {
                                ...assignment,
                                questions: []
                              };
                            }
                          }
                          
                          // Debug logging for assignment lookup - EXPANDED to show questions
                          const questionsArray = assignment?.questions || [];
                          const questionsInfo = questionsArray.length > 0 ? {
                            count: questionsArray.length,
                            hasQuestions: true,
                            questions: questionsArray.map((q: any) => ({
                              id: q.id,
                              question_type: q.question_type,
                              question_text: q.question_text?.substring(0, 50),
                              marks: q.marks
                            }))
                          } : { count: 0, hasQuestions: false, questions: [] };
                          
                          console.log('🔍 Assignment lookup:', {
                            chapterIndex: index,
                            chapterId: chapter.id,
                            chapterKey: chapterKey,
                            chapterName: chapter.name,
                            foundAssignment: !!assignment,
                            assignmentTitle: assignment?.title,
                            assignmentId: assignment?.id,
                            questionsCount: questionsArray.length,
                            hasQuestions: questionsArray.length > 0,
                            questions: questionsArray.map((q: any) => ({
                              id: q.id,
                              question_type: q.question_type,
                              question_text: q.question_text?.substring(0, 30) + '...'
                            })),
                            // EXPANDED: Full questions info
                            questionsInfo: questionsInfo,
                            // EXPANDED: Full assignment object keys
                            assignmentKeys: assignment ? Object.keys(assignment) : [],
                            // EXPANDED: Check if questions property exists
                            hasQuestionsProperty: assignment ? 'questions' in assignment : false,
                            questionsIsArray: Array.isArray(assignment?.questions),
                            allAssignmentKeys: Object.keys(assignments),
                            allChapterKeys: chapters.map((ch, idx) => getChapterKey(ch, idx)),
                            assignmentsState: Object.entries(assignments).map(([key, ass]) => ({
                              key: key,
                              title: ass.title,
                              id: ass.id,
                              questionsCount: Array.isArray(ass.questions) ? ass.questions.length : 0,
                              hasQuestions: Array.isArray(ass.questions) && ass.questions.length > 0
                            }))
                          });
                          
                          // CRITICAL: Explicitly log questions in a way that won't be collapsed
                          if (assignment) {
                            // Use console.group to make it expandable and visible
                            console.group('📋 [Assignment lookup] QUESTIONS CHECK');
                            console.log('Assignment ID:', assignment.id);
                            console.log('Assignment Title:', assignment.title);
                            console.log('Questions Count:', questionsArray.length);
                            console.log('Questions is Array:', Array.isArray(assignment.questions));
                            console.log('Questions Type:', typeof assignment.questions);
                            console.log('Has Questions Property:', 'questions' in assignment);
                            console.log('Questions Value:', assignment.questions);
                            console.log('Questions Array:', questionsArray);
                            
                            // Log each question individually so they're visible
                            if (questionsArray.length > 0) {
                              console.log('✅ QUESTIONS FOUND:', questionsArray.length);
                              questionsArray.forEach((q: any, idx: number) => {
                                console.log(`  Question ${idx + 1}:`, {
                                  id: q.id,
                                  type: q.question_type,
                                  text: q.question_text?.substring(0, 50),
                                  marks: q.marks
                                });
                              });
                            } else {
                              console.error('❌ NO QUESTIONS in assignment!');
                              console.error('All Properties:', Object.keys(assignment));
                              console.error('Questions Property:', assignment.questions);
                              console.error('Questions Type:', typeof assignment.questions);
                              console.error('Questions Is Array:', Array.isArray(assignment.questions));
                              console.error('Full Assignment:', JSON.parse(JSON.stringify(assignment)));
                            }
                            console.groupEnd();
                          }
                          // #region agent log
                          fetch('http://127.0.0.1:7242/ingest/aa2d37a3-b977-45e9-919f-23aa5642fdcf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:1642',message:'Passing assignment to AssignmentBuilder',data:{chapterKey,chapterId:chapter.id,assignmentId:assignment?.id,assignmentTitle:assignment?.title,questionsCount:questionsArray.length,questions:questionsArray.map((q:any)=>({id:q.id,type:q.question_type})),hasQuestions:questionsArray.length>0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                          // #endregion
                          
                          return assignment;
                        })()}
                        onAssignmentChange={(assignment) => {
                          // Always use permanent chapter ID as key
                          const chapterId = chapter.id || getChapterKey(chapter, index);
                          
                          // CRITICAL: Ensure assignment has correct chapter_id
                          if (assignment && assignment.chapter_id !== chapterId) {
                            console.warn('⚠️ [onAssignmentChange] Assignment chapter_id mismatch, correcting:', {
                              assignmentChapterId: assignment.chapter_id,
                              correctChapterId: chapterId
                            });
                            assignment = { ...assignment, chapter_id: chapterId };
                          }
                          
                          // CRITICAL: Update timestamp to prevent loadAssignments from overwriting
                          lastAssignmentChangeRef.current = Date.now();
                          
                          console.log('🎯 [onAssignmentChange] CALLED:', {
                            chapterIndex: index,
                            chapterId: chapter.id,
                            chapterKey: chapterId,
                            chapterName: chapter.name,
                            hasAssignment: !!assignment,
                            assignmentTitle: assignment?.title,
                            assignmentId: assignment?.id,
                            assignmentChapterId: assignment?.chapter_id,
                            timestamp: lastAssignmentChangeRef.current,
                            currentStateCount: Object.keys(assignments).length,
                            currentRefCount: Object.keys(assignmentsRef.current).length
                          });
                          
                          // CRITICAL: Use functional update to avoid stale closure issues
                          setAssignments((prevAssignments) => {
                            console.log('🔄 [setAssignments] Functional update called:', {
                              prevCount: Object.keys(prevAssignments).length,
                              prevKeys: Object.keys(prevAssignments),
                              chapterId: chapterId,
                              hasAssignment: !!assignment
                            });
                            
                            if (assignment) {
                              // CRITICAL: Preserve questions when updating assignment
                              const questionsToPreserve = assignment.questions || [];
                              
                              // Ensure assignment has permanent ID and correct chapter_id
                              const assignmentWithIds = {
                                ...assignment,
                                id: assignment.id || generateUUID(),
                                chapter_id: chapterId, // Always use permanent chapter ID
                                questions: questionsToPreserve, // CRITICAL: Explicitly preserve questions
                              };
                              
                              const updatedAssignments = {
                                ...prevAssignments,
                                [chapterId]: assignmentWithIds, // Use chapter ID as key
                              };
                              
                              console.log('💾 [setAssignments] Storing assignment:', {
                                chapterId: chapterId,
                                assignmentTitle: assignmentWithIds.title,
                                assignmentId: assignmentWithIds.id,
                                assignmentChapterId: assignmentWithIds.chapter_id,
                                isNew: !assignment.id,
                                questionsCount: assignmentWithIds.questions?.length || 0,
                                hasQuestions: !!(assignmentWithIds.questions && assignmentWithIds.questions.length > 0),
                                newCount: Object.keys(updatedAssignments).length,
                                newKeys: Object.keys(updatedAssignments),
                                storedAssignment: updatedAssignments[chapterId] ? {
                                  key: chapterId,
                                  title: updatedAssignments[chapterId].title,
                                  id: updatedAssignments[chapterId].id,
                                  chapter_id: updatedAssignments[chapterId].chapter_id,
                                  questionsCount: updatedAssignments[chapterId].questions?.length || 0
                                } : null
                              });
                              
                              // CRITICAL: Verify questions are preserved
                              if (questionsToPreserve.length > 0 && (!updatedAssignments[chapterId].questions || updatedAssignments[chapterId].questions.length === 0)) {
                                console.error('❌ [setAssignments] CRITICAL: Questions LOST when storing assignment!', {
                                  chapterId: chapterId,
                                  assignmentTitle: assignmentWithIds.title,
                                  questionsBefore: questionsToPreserve.length,
                                  questionsAfter: updatedAssignments[chapterId].questions?.length || 0,
                                  assignmentObject: JSON.stringify(assignmentWithIds, null, 2).substring(0, 500)
                                });
                                // Restore questions if they were lost
                                updatedAssignments[chapterId].questions = questionsToPreserve;
                              }
                              
                              // Update ref immediately
                              assignmentsRef.current = updatedAssignments;
                              
                              // Immediate verification
                              const verification = {
                                refHasKey: !!assignmentsRef.current[chapterId],
                                refKeyCount: Object.keys(assignmentsRef.current).length,
                                refKeys: Object.keys(assignmentsRef.current),
                                storedTitle: assignmentsRef.current[chapterId]?.title
                              };
                              
                              console.log('✅ [setAssignments] Assignment stored - immediate verification:', verification);
                              
                              // Double-check after a microtask
                              setTimeout(() => {
                                const currentState = assignmentsRef.current;
                                console.log('🔍 [setAssignments] Delayed verification (100ms):', {
                                  refHasKey: !!currentState[chapterId],
                                  refKeyCount: Object.keys(currentState).length,
                                  refKeys: Object.keys(currentState),
                                  storedAssignment: currentState[chapterId] ? {
                                    title: currentState[chapterId].title,
                                    id: currentState[chapterId].id,
                                    chapter_id: currentState[chapterId].chapter_id
                                  } : null
                                });
                                
                                // If assignment is missing, log error
                                if (!currentState[chapterId]) {
                                  console.error('❌ [setAssignments] CRITICAL: Assignment missing after delay!', {
                                    chapterId: chapterId,
                                    expectedTitle: assignmentWithIds.title,
                                    allKeys: Object.keys(currentState)
                                  });
                                }
                              }, 100);
                              
                              return updatedAssignments;
                            } else {
                              const updated = { ...prevAssignments };
                              delete updated[chapterId];
                              
                              console.log('🗑️ [setAssignments] Deleting assignment:', {
                                chapterId: chapterId,
                                beforeDeleteKeys: Object.keys(prevAssignments),
                                afterDeleteKeys: Object.keys(updated)
                              });
                              
                              // Update ref immediately
                              assignmentsRef.current = updated;
                              
                              return updated;
                            }
                          });
                        }}
                      />
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Associations Tab */}
        <TabsContent value="associations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Course Associations</CardTitle>
              <CardDescription>
                View and manage course associations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Assigned Schools</Label>
                  <div className="mt-2">
                    {selectedSchoolIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedSchoolIds.map((id) => (
                          <Badge key={id} variant="secondary">
                            School ID: {id}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No schools assigned</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Assigned Grades</Label>
                  <div className="mt-2">
                    {selectedGrades.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedGrades.map((grade) => (
                          <Badge key={grade} variant="secondary">
                            {grade}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No grades assigned</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

