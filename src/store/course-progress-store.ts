import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Safe storage adapter for SSR
const getSafeStorage = () => {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage;
  }
  return localStorage;
};

/**
 * Course Progress Store
 * 
 * Global state management for course progress with optimistic updates.
 * Matches Coursera/Udemy patterns for instant UI feedback.
 */

export interface ContentProgress {
  contentId: string;
  chapterId: string;
  courseId: string;
  isCompleted: boolean;
  completedAt?: string;
  lastPosition?: number; // For video resume
  timeSpent?: number; // In seconds
}

export interface ChapterProgress {
  chapterId: string;
  courseId: string;
  isCompleted: boolean;
  completedAt?: string;
  progressPercent: number;
}

export interface CourseProgressState {
  // Progress data keyed by contentId
  contentProgress: Record<string, ContentProgress>;
  
  // Chapter progress keyed by chapterId
  chapterProgress: Record<string, ChapterProgress>;
  
  // Video positions keyed by contentId
  videoPositions: Record<string, number>;
  
  // Loading states
  savingProgress: Set<string>;
  
  // Actions
  setContentCompleted: (contentId: string, chapterId: string, courseId: string, completed: boolean) => void;
  setChapterCompleted: (chapterId: string, courseId: string, completed: boolean, progressPercent?: number) => void;
  setVideoPosition: (contentId: string, position: number) => void;
  getVideoPosition: (contentId: string) => number;
  isContentCompleted: (contentId: string) => boolean;
  isChapterCompleted: (chapterId: string) => boolean;
  getChapterProgress: (chapterId: string) => number;
  setSavingProgress: (contentId: string, saving: boolean) => void;
  isSaving: (contentId: string) => boolean;
  
  // Bulk operations
  loadProgressFromServer: (progress: ContentProgress[]) => void;
  loadChapterProgressFromServer: (progress: ChapterProgress[]) => void;
  clearCourseProgress: (courseId: string) => void;
}

export const useCourseProgressStore = create<CourseProgressState>()(
  persist(
    (set, get) => ({
      contentProgress: {},
      chapterProgress: {},
      videoPositions: {},
      savingProgress: new Set<string>(),

      setContentCompleted: (contentId, chapterId, courseId, completed) => {
        set((state) => ({
          contentProgress: {
            ...state.contentProgress,
            [contentId]: {
              contentId,
              chapterId,
              courseId,
              isCompleted: completed,
              completedAt: completed ? new Date().toISOString() : undefined,
            },
          },
        }));
      },

      setChapterCompleted: (chapterId, courseId, completed, progressPercent = 100) => {
        set((state) => ({
          chapterProgress: {
            ...state.chapterProgress,
            [chapterId]: {
              chapterId,
              courseId,
              isCompleted: completed,
              completedAt: completed ? new Date().toISOString() : undefined,
              progressPercent,
            },
          },
        }));
      },

      setVideoPosition: (contentId, position) => {
        set((state) => ({
          videoPositions: {
            ...state.videoPositions,
            [contentId]: position,
          },
        }));
      },

      getVideoPosition: (contentId) => {
        return get().videoPositions[contentId] || 0;
      },

      isContentCompleted: (contentId) => {
        return get().contentProgress[contentId]?.isCompleted || false;
      },

      isChapterCompleted: (chapterId) => {
        return get().chapterProgress[chapterId]?.isCompleted || false;
      },

      getChapterProgress: (chapterId) => {
        return get().chapterProgress[chapterId]?.progressPercent || 0;
      },

      setSavingProgress: (contentId, saving) => {
        set((state) => {
          const newSaving = new Set(state.savingProgress);
          if (saving) {
            newSaving.add(contentId);
          } else {
            newSaving.delete(contentId);
          }
          return { savingProgress: newSaving };
        });
      },

      isSaving: (contentId) => {
        return get().savingProgress.has(contentId);
      },

      loadProgressFromServer: (progress) => {
        set((state) => {
          const newProgress = { ...state.contentProgress };
          progress.forEach((p) => {
            newProgress[p.contentId] = p;
          });
          return { contentProgress: newProgress };
        });
      },

      loadChapterProgressFromServer: (progress) => {
        set((state) => {
          const newProgress = { ...state.chapterProgress };
          progress.forEach((p) => {
            newProgress[p.chapterId] = p;
          });
          return { chapterProgress: newProgress };
        });
      },

      clearCourseProgress: (courseId) => {
        set((state) => {
          const newContentProgress = { ...state.contentProgress };
          const newChapterProgress = { ...state.chapterProgress };
          const newVideoPositions = { ...state.videoPositions };

          Object.keys(newContentProgress).forEach((key) => {
            if (newContentProgress[key].courseId === courseId) {
              delete newContentProgress[key];
            }
          });

          Object.keys(newChapterProgress).forEach((key) => {
            if (newChapterProgress[key].courseId === courseId) {
              delete newChapterProgress[key];
            }
          });

          return {
            contentProgress: newContentProgress,
            chapterProgress: newChapterProgress,
            videoPositions: newVideoPositions,
          };
        });
      },
    }),
    {
      name: 'course-progress-store',
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({
        contentProgress: state.contentProgress,
        chapterProgress: state.chapterProgress,
        videoPositions: state.videoPositions,
      }),
      // Handle Set serialization
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        savingProgress: new Set<string>(),
      }),
    }
  )
);
