/**
 * Analytics tracking for assignment interactions
 */

export type AnalyticsEvent = 
  | 'assignment_viewed'
  | 'assignment_started'
  | 'question_answered'
  | 'question_navigated'
  | 'assignment_submitted'
  | 'assignment_graded'
  | 'assignment_abandoned'
  | 'page_viewed'
  | 'feature_used'
  | 'error_occurred'
  | 'user_role_set'

export interface AnalyticsEventData {
  assignmentId?: string
  questionId?: string
  questionIndex?: number
  questionType?: string
  courseId?: string
  chapterId?: string
  grade?: number
  timeSpent?: number
  [key: string]: any
}

/**
 * Generic track event function that accepts any event name
 */
export function trackEvent(event: AnalyticsEvent | string, data?: AnalyticsEventData | Record<string, any>): void {
  // Only track in browser environment
  if (typeof window === 'undefined') return

  try {
    // Send to analytics service (e.g., Google Analytics, Mixpanel, etc.)
    // For now, we'll use console.log and can be extended to actual analytics service
    
    const eventData = {
      event,
      timestamp: new Date().toISOString(),
      ...data
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics]', eventData)
    }

    // Send to analytics service (example with gtag)
    if (typeof window !== 'undefined' && (window as any).gtag) {
      ;(window as any).gtag('event', event, {
        ...data,
        event_category: 'assignment',
        event_label: data?.assignmentId || 'unknown'
      })
    }

    // Send to custom analytics endpoint (if available)
    if (process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT) {
      fetch(process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      }).catch(err => {
        console.error('Failed to send analytics event:', err)
      })
    }
  } catch (error) {
    console.error('Error tracking analytics event:', error)
  }
}

/**
 * Track assignment view
 */
export function trackAssignmentView(assignmentId: string, courseId?: string, chapterId?: string): void {
  trackEvent('assignment_viewed', {
    assignmentId,
    courseId,
    chapterId
  })
}

/**
 * Track assignment start
 */
export function trackAssignmentStart(assignmentId: string): void {
  trackEvent('assignment_started', {
    assignmentId
  })
}

/**
 * Track question answer
 */
export function trackQuestionAnswer(
  assignmentId: string,
  questionId: string,
  questionIndex: number,
  questionType: string
): void {
  trackEvent('question_answered', {
    assignmentId,
    questionId,
    questionIndex,
    questionType
  })
}

/**
 * Track question navigation
 */
export function trackQuestionNavigation(
  assignmentId: string,
  fromIndex: number,
  toIndex: number
): void {
  trackEvent('question_navigated', {
    assignmentId,
    fromIndex,
    toIndex
  })
}

/**
 * Track assignment submission
 */
export function trackAssignmentSubmission(assignmentId: string, timeSpent?: number): void {
  trackEvent('assignment_submitted', {
    assignmentId,
    timeSpent
  })
}

/**
 * Track assignment grading
 */
export function trackAssignmentGraded(assignmentId: string, grade: number): void {
  trackEvent('assignment_graded', {
    assignmentId,
    grade
  })
}

/**
 * Track assignment abandonment
 */
export function trackAssignmentAbandoned(assignmentId: string, timeSpent?: number): void {
  trackEvent('assignment_abandoned', {
    assignmentId,
    timeSpent
  })
}

/**
 * Track page view for Google Analytics
 */
export function trackPageView(path: string, gaId?: string): void {
  // Only track in browser environment
  if (typeof window === 'undefined') return

  try {
    // Use gtag if available (Google Analytics)
    if ((window as any).gtag) {
      ;(window as any).gtag('config', gaId || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-VLEC0XTTY5', {
        page_path: path
      })
    }

    // Also send to custom analytics
    trackEvent('page_viewed' as AnalyticsEvent, {
      path,
      gaId
    } as AnalyticsEventData)
  } catch (error) {
    console.error('Error tracking page view:', error)
  }
}

/**
 * Track feature usage
 */
export function trackFeatureUsage(featureName: string, metadata?: Record<string, any>): void {
  trackEvent('feature_used', {
    featureName,
    ...metadata
  })
}

/**
 * Track error
 */
export function trackError(error: Error, context?: Record<string, any>): void {
  trackEvent('error_occurred', {
    errorMessage: error.message,
    errorStack: error.stack,
    errorName: error.name,
    ...context
  })
}

/**
 * Set user properties
 */
export function setUserProperties(userId: string, properties?: Record<string, any>): void {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    ;(window as any).gtag('set', {
      user_id: userId,
      ...properties
    })
  }
}

/**
 * Track user role
 */
export function trackUserRole(role: string): void {
  trackEvent('user_role_set', {
    role
  })
  setUserProperties('', { role })
}

/**
 * Analytics events enum for type safety
 */
export const AnalyticsEvents = {
  ASSIGNMENT_VIEWED: 'assignment_viewed',
  ASSIGNMENT_STARTED: 'assignment_started',
  QUESTION_ANSWERED: 'question_answered',
  QUESTION_NAVIGATED: 'question_navigated',
  ASSIGNMENT_SUBMITTED: 'assignment_submitted',
  ASSIGNMENT_GRADED: 'assignment_graded',
  ASSIGNMENT_ABANDONED: 'assignment_abandoned',
  PAGE_VIEWED: 'page_viewed',
  FEATURE_USED: 'feature_used',
  ERROR_OCCURRED: 'error_occurred',
  USER_ROLE_SET: 'user_role_set',
  LOGIN: 'login',
  COURSE_ENROLLED: 'course_enrolled',
  REPORT_SUBMITTED: 'report_submitted'
} as const
