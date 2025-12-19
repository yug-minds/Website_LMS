/**
 * Course Form Persistence Utility
 * 
 * Comprehensive form data persistence for course creation/editing
 * with auto-save, recovery, and state preservation across tab switches.
 */

import { saveFormData, loadFormData, clearFormData, hasFormData } from './form-persistence';

const COURSE_FORM_STORAGE_KEY = 'admin_course_creation_form';
const AUTO_SAVE_INTERVAL = 10000; // Auto-save every 10 seconds
const MAX_STORAGE_AGE = 30 * 60 * 1000; // 30 minutes

export interface CourseFormState {
  // Basic form data
  formData: {
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
  };
  
  // Chapters
  chapters: Array<{
    id?: string;
    name: string;
    description?: string;
    learning_outcomes?: string[];
    order_number?: number;
    [key: string]: any; // Allow additional properties
  }>;
  
  // Videos
  videos: Array<{
    id?: string;
    chapter_id: string;
    title: string;
    url?: string;
    video_url?: string;
    type?: string;
    order_number?: number;
    [key: string]: any; // Allow additional properties
  }>;
  
  // Materials
  materials: Array<{
    id?: string;
    chapter_id: string;
    title: string;
    type?: string;
    url?: string;
    resource_url?: string;
    order_number?: number;
    [key: string]: any; // Allow additional properties
  }>;
  
  // Assignments
  assignments: Array<{
    id?: string;
    chapter_id: string;
    title: string;
    description: string;
    auto_grading_enabled: boolean;
    max_score: number;
    questions: Array<{
      id?: string;
      assignment_id?: string;
      question_type: 'MCQ' | 'FillBlank';
      question_text: string;
      options?: string[];
      correct_answer: string;
      marks: number;
      [key: string]: any; // Allow additional properties
    }>;
    [key: string]: any; // Allow additional properties
  }>;
  
  // Scheduling
  scheduling: {
    release_type: 'Daily' | 'Weekly' | 'Bi-weekly';
    start_date: string;
    release_schedule: any[];
  };
  
  // UI State
  uiState: {
    currentStep: number;
    selectedSchools: string[];
    selectedGrades: string[];
    currentChapterIndex: number;
  };
  
  // Metadata
  metadata: {
    lastSaved: number;
    isDirty: boolean;
    version: number;
  };
}

/**
 * Save complete course form state
 */
export function saveCourseFormState(state: Partial<CourseFormState>): boolean {
  try {
    const fullState: CourseFormState = {
      formData: state.formData || {
        name: '',
        description: '',
        school_ids: [],
        grades: [],
        total_chapters: 0,
        total_videos: 0,
        total_materials: 0,
        total_assignments: 0,
        release_type: 'Weekly',
        status: 'Draft',
      },
      chapters: state.chapters || [],
      videos: state.videos || [],
      materials: state.materials || [],
      assignments: state.assignments || [],
      scheduling: state.scheduling || {
        release_type: 'Weekly',
        start_date: '',
        release_schedule: [],
      },
      uiState: state.uiState || {
        currentStep: 1,
        selectedSchools: [],
        selectedGrades: [],
        currentChapterIndex: -1,
      },
      metadata: {
        lastSaved: Date.now(),
        isDirty: true,
        version: (state.metadata?.version || 0) + 1,
      },
    };

    return saveFormData(COURSE_FORM_STORAGE_KEY, fullState);
  } catch (error) {
    console.error('Error saving course form state:', error);
    return false;
  }
}

/**
 * Load complete course form state
 */
export function loadCourseFormState(): CourseFormState | null {
  try {
    const saved = loadFormData<CourseFormState>(COURSE_FORM_STORAGE_KEY);
    
    if (!saved) return null;
    
    // Check if data is too old
    const age = Date.now() - (saved.metadata?.lastSaved || 0);
    if (age > MAX_STORAGE_AGE) {
      console.log('Course form data expired, clearing...');
      clearCourseFormState();
      return null;
    }
    
    return saved;
  } catch (error) {
    console.error('Error loading course form state:', error);
    return null;
  }
}

/**
 * Clear course form state
 */
export function clearCourseFormState(): void {
  clearFormData(COURSE_FORM_STORAGE_KEY);
}

/**
 * Check if course form has saved data
 */
export function hasCourseFormState(): boolean {
  return hasFormData(COURSE_FORM_STORAGE_KEY);
}

/**
 * Get time since last save
 */
export function getLastSaveTime(): number | null {
  const state = loadCourseFormState();
  if (!state?.metadata?.lastSaved) return null;
  return Date.now() - state.metadata.lastSaved;
}

/**
 * React hook for course form auto-save
 */
export function useCourseFormAutoSave(
  state: Partial<CourseFormState>,
  options: {
    enabled?: boolean;
    interval?: number;
    onSave?: (saved: boolean) => void;
  } = {}
) {
  const { enabled = true, interval = AUTO_SAVE_INTERVAL, onSave } = options;

  if (typeof window === 'undefined' || !enabled) return;

  // Auto-save on state changes
  const saveTimeoutRef = { current: null as NodeJS.Timeout | null };

  const scheduleSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const saved = saveCourseFormState(state);
      if (onSave) {
        onSave(saved);
      }
      if (saved) {
        console.log('💾 Course form auto-saved');
      }
    }, 1000); // Debounce by 1 second
  };

  // Save whenever state changes
  scheduleSave();

  // Cleanup
  return () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  };
}

/**
 * Show recovery dialog
 */
export function showRecoveryDialog(
  onRecover: () => void,
  onDiscard: () => void
): void {
  if (typeof window === 'undefined') return;

  const lastSaveTime = getLastSaveTime();
  const minutesAgo = lastSaveTime ? Math.floor(lastSaveTime / 60000) : 0;
  
  const message = `We found unsaved course data from ${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago. Would you like to recover it?`;
  
  if (window.confirm(`${message}\n\nClick OK to recover, or Cancel to discard.`)) {
    onRecover();
  } else {
    onDiscard();
  }
}


