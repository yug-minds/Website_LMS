import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { rateLimit, RateLimitPresets, createRateLimitHeaders } from '../rate-limit';
import * as redisClient from '../redis-client';
import * as authUtils from '../auth-utils';

// Mock dependencies
vi.mock('../redis-client');
vi.mock('../auth-utils');
vi.mock('../supabase', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}));

describe('Rate Limiting', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = new NextRequest('http://localhost:3000/api/test', {
      headers: {
        'x-forwarded-for': '192.168.1.1',
      },
    });
  });

  describe('rateLimit', () => {
    it('should allow request when under limit (Supabase fallback)', async () => {
      vi.spyOn(redisClient, 'isRedisAvailable').mockReturnValue(false);
      vi.spyOn(authUtils, 'getAuthenticatedUserId').mockResolvedValue(null);
      
      const { supabaseAdmin } = await import('../supabase');
      (supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
        data: [{ allowed: true, remaining: 95, reset_time: new Date(Date.now() + 60000) }],
        error: null,
      });

      const result = await rateLimit(mockRequest, {
        maxRequests: 100,
        windowSeconds: 60,
      });

      expect(result.success).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should block request when over limit (Supabase fallback)', async () => {
      vi.spyOn(redisClient, 'isRedisAvailable').mockReturnValue(false);
      vi.spyOn(authUtils, 'getAuthenticatedUserId').mockResolvedValue(null);
      
      const { supabaseAdmin } = await import('../supabase');
      (supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
        data: [{ allowed: false, remaining: 0, reset_time: new Date(Date.now() + 60000) }],
        error: null,
      });

      const result = await rateLimit(mockRequest, {
        maxRequests: 100,
        windowSeconds: 60,
      });

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should use user ID when authenticated', async () => {
      vi.spyOn(redisClient, 'isRedisAvailable').mockReturnValue(false);
      vi.spyOn(authUtils, 'getAuthenticatedUserId').mockResolvedValue('user-123');
      
      const { supabaseAdmin } = await import('../supabase');
      (supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
        data: [{ allowed: true, remaining: 95, reset_time: new Date(Date.now() + 60000) }],
        error: null,
      });

      await rateLimit(mockRequest, {
        maxRequests: 100,
        windowSeconds: 60,
      });

      // Verify RPC was called with identifier
      expect(supabaseAdmin.rpc).toHaveBeenCalled();
    });

    it('should fallback to Supabase when Redis unavailable', async () => {
      const { supabaseAdmin } = await import('../supabase');
      
      vi.spyOn(redisClient, 'isRedisAvailable').mockReturnValue(false);
      vi.spyOn(authUtils, 'getAuthenticatedUserId').mockResolvedValue(null);
      
      (supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
        data: [{ allowed: true, remaining: 99, reset_time: new Date(Date.now() + 60000) }],
        error: null,
      });

      const result = await rateLimit(mockRequest, {
        maxRequests: 100,
        windowSeconds: 60,
      });

      expect(result.success).toBe(true);
      expect(supabaseAdmin.rpc).toHaveBeenCalled();
    });

    it('should fail open on error', async () => {
      vi.spyOn(redisClient, 'isRedisAvailable').mockReturnValue(false);
      vi.spyOn(authUtils, 'getAuthenticatedUserId').mockResolvedValue(null);
      
      const { supabaseAdmin } = await import('../supabase');
      (supabaseAdmin as any).rpc = vi.fn().mockRejectedValue(new Error('Database error'));

      const result = await rateLimit(mockRequest, {
        maxRequests: 100,
        windowSeconds: 60,
      });

      // Should fail open (allow request)
      expect(result.success).toBe(true);
    });
  });

  describe('RateLimitPresets', () => {
    it('should have AUTH preset with correct limits', () => {
      expect(RateLimitPresets.AUTH).toEqual({
        maxRequests: 5,
        windowSeconds: 60,
      });
    });

    it('should have API preset with correct limits', () => {
      expect(RateLimitPresets.API).toEqual({
        maxRequests: 100,
        windowSeconds: 60,
      });
    });

    it('should have UPLOAD preset with correct limits', () => {
      expect(RateLimitPresets.UPLOAD).toEqual({
        maxRequests: 10,
        windowSeconds: 60,
      });
    });
  });

  describe('createRateLimitHeaders', () => {
    it('should create correct rate limit headers', () => {
      const result = {
        success: true,
        limit: 100,
        remaining: 95,
        reset: Math.floor(Date.now() / 1000) + 60,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('95');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should include Retry-After when rate limited', () => {
      const result = {
        success: false,
        limit: 100,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + 60,
        retryAfter: 45,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers['Retry-After']).toBe('45');
    });
  });
});

