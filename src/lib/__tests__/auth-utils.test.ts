import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase before importing auth-utils
vi.mock('../supabase', () => {
  const mockSupabaseAdmin = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({}),
      })),
    })),
  };
  return {
    supabaseAdmin: mockSupabaseAdmin,
  };
});

// Import after mocking
import {
  getAuthenticatedUserId,
  getUserProfile,
  verifyRole,
  verifyAdmin,
  verifyStudent,
  verifyTeacher,
} from '../auth-utils';
import * as supabaseModule from '../supabase';

describe('Auth Utils', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = new NextRequest('http://localhost:3000/api/test');
  });

  describe('getAuthenticatedUserId', () => {
    it('should return null when no authorization header', async () => {
      const userId = await getAuthenticatedUserId(mockRequest);
      expect(userId).toBeNull();
    });

    it('should return null for invalid authorization header format', async () => {
      mockRequest.headers.set('authorization', 'InvalidFormat token');
      const userId = await getAuthenticatedUserId(mockRequest);
      expect(userId).toBeNull();
    });

    it('should return null for empty token', async () => {
      mockRequest.headers.set('authorization', 'Bearer ');
      const userId = await getAuthenticatedUserId(mockRequest);
      expect(userId).toBeNull();
    });

    it('should return user ID for valid token', async () => {
      const mockUser = { id: 'user-123' };
      
      (supabaseModule.supabaseAdmin.auth.getUser as any) = vi.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRequest.headers.set('authorization', 'Bearer valid-token');
      const userId = await getAuthenticatedUserId(mockRequest);

      expect(userId).toBe('user-123');
    });

    it('should return null for invalid token', async () => {
      (supabaseModule.supabaseAdmin.auth.getUser as any) = vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      mockRequest.headers.set('authorization', 'Bearer invalid-token');
      const userId = await getAuthenticatedUserId(mockRequest);

      expect(userId).toBeNull();
    });

    it('should suppress warning when requested', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await getAuthenticatedUserId(mockRequest, true);
      
      // Warning should not be logged when suppressed
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile', async () => {
      const mockProfile = {
        id: 'user-123',
        role: 'admin',
        school_id: null,
      };

      (supabaseModule.supabaseAdmin.from as any) = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: mockProfile,
              error: null,
            }),
          })),
        })),
      }));

      const profile = await getUserProfile('user-123');

      expect(profile).toEqual(mockProfile);
    });

    it('should return null for non-existent user', async () => {
      (supabaseModule.supabaseAdmin.from as any) = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          })),
        })),
      }));

      const profile = await getUserProfile('non-existent');

      expect(profile).toBeNull();
    });
  });

  describe('verifyRole', () => {
    it('should return success for valid role', async () => {
      mockRequest.headers.set('authorization', 'Bearer valid-token');
      
      (supabaseModule.supabaseAdmin.auth.getUser as any) = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      (supabaseModule.supabaseAdmin.from as any) = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-123', role: 'admin', school_id: null },
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({}),
        })),
      }));

      const result = await verifyRole(mockRequest, ['admin']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe('user-123');
        expect(result.role).toBe('admin');
      }
    });

    it('should return error for unauthorized request', async () => {
      const result = await verifyRole(mockRequest, ['admin']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(401);
      }
    });

    it('should return error for forbidden role', async () => {
      mockRequest.headers.set('authorization', 'Bearer valid-token');
      
      (supabaseModule.supabaseAdmin.auth.getUser as any) = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      (supabaseModule.supabaseAdmin.from as any) = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-123', role: 'student', school_id: null },
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({}),
        })),
      }));

      const result = await verifyRole(mockRequest, ['admin']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(403);
      }
    });
  });

  describe('verifyAdmin', () => {
    it('should verify admin role', async () => {
      mockRequest.headers.set('authorization', 'Bearer valid-token');
      
      (supabaseModule.supabaseAdmin.auth.getUser as any) = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      (supabaseModule.supabaseAdmin.from as any) = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-123', role: 'admin', school_id: null },
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({}),
        })),
      }));

      const result = await verifyAdmin(mockRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe('user-123');
      }
    });
  });

  describe('verifyStudent', () => {
    it('should verify student role', async () => {
      mockRequest.headers.set('authorization', 'Bearer valid-token');
      
      (supabaseModule.supabaseAdmin.auth.getUser as any) = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      (supabaseModule.supabaseAdmin.from as any) = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-123', role: 'student', school_id: 'school-123' },
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({}),
        })),
      }));

      const result = await verifyStudent(mockRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe('user-123');
      }
    });
  });

  describe('verifyTeacher', () => {
    it('should verify teacher role', async () => {
      mockRequest.headers.set('authorization', 'Bearer valid-token');
      
      (supabaseModule.supabaseAdmin.auth.getUser as any) = vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      (supabaseModule.supabaseAdmin.from as any) = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'user-123', role: 'teacher', school_id: 'school-123' },
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({}),
        })),
      }));

      const result = await verifyTeacher(mockRequest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe('user-123');
      }
    });
  });
});

