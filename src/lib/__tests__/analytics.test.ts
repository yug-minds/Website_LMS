import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackPageView,
  trackEvent,
  trackFeatureUsage,
  trackError,
  setUserProperties,
  trackUserRole,
  AnalyticsEvents,
} from '../analytics';

// Extend Window interface for tests
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

describe('Google Analytics', () => {
  beforeEach(() => {
    // Mock window and document objects
    global.window = {
      ...global.window,
      gtag: vi.fn(),
      dataLayer: [],
    } as any;
    
    global.document = {
      title: 'Test Page',
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('trackPageView', () => {
    it('should track page view with default measurement ID', () => {
      trackPageView('/test-page');
      
      expect(window.gtag).toHaveBeenCalledWith('config', 'G-VLEC0XTTY5', {
        page_path: '/test-page',
        page_title: expect.any(String),
      });
    });

    it('should track page view with custom measurement ID', () => {
      trackPageView('/test-page', 'G-CUSTOM123');
      
      expect(window.gtag).toHaveBeenCalledWith('config', 'G-CUSTOM123', {
        page_path: '/test-page',
        page_title: expect.any(String),
      });
    });

    it('should not throw if gtag is not available', () => {
      delete (window as any).gtag;
      
      expect(() => trackPageView('/test-page')).not.toThrow();
    });
  });

  describe('trackEvent', () => {
    it('should track custom event', () => {
      trackEvent('button_click', {
        button_name: 'Submit',
        category: 'form',
      });
      
      expect(window.gtag).toHaveBeenCalledWith('event', 'button_click', {
        button_name: 'Submit',
        category: 'form',
      });
    });

    it('should track event without parameters', () => {
      trackEvent('page_view');
      
      expect(window.gtag).toHaveBeenCalledWith('event', 'page_view', undefined);
    });
  });

  describe('trackFeatureUsage', () => {
    it('should track feature usage', () => {
      trackFeatureUsage('course_enrollment', {
        course_id: '123',
      });
      
      expect(window.gtag).toHaveBeenCalledWith('event', AnalyticsEvents.FEATURE_USED, {
        feature_name: 'course_enrollment',
        course_id: '123',
      });
    });
  });

  describe('trackError', () => {
    it('should track error', () => {
      const error = new Error('Test error');
      trackError(error, { context: 'test' });
      
      expect(window.gtag).toHaveBeenCalledWith('event', AnalyticsEvents.ERROR_OCCURRED, {
        error_message: 'Test error',
        error_name: 'Error',
        context: 'test',
      });
    });
  });

  describe('setUserProperties', () => {
    it('should set user properties', () => {
      setUserProperties('user-123', {
        school_id: 'school-456',
        role: 'teacher',
      });
      
      expect(window.gtag).toHaveBeenCalledWith('set', 'user_properties', {
        user_id: 'user-123',
        school_id: 'school-456',
        role: 'teacher',
      });
    });
  });

  describe('trackUserRole', () => {
    it('should track user role', () => {
      trackUserRole('admin');
      
      expect(window.gtag).toHaveBeenCalledWith('set', 'user_properties', {
        user_role: 'admin',
      });
    });
  });

  describe('AnalyticsEvents', () => {
    it('should have predefined event constants', () => {
      expect(AnalyticsEvents.LOGIN).toBe('login');
      expect(AnalyticsEvents.COURSE_ENROLLED).toBe('course_enrolled');
      expect(AnalyticsEvents.REPORT_SUBMITTED).toBe('report_submitted');
      expect(AnalyticsEvents.ERROR_OCCURRED).toBe('error_occurred');
    });
  });
});

