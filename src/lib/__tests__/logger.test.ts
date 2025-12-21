import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createErrorResponse, handleApiError } from '../logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console methods
    global.console.log = vi.fn();
    global.console.info = vi.fn();
    global.console.warn = vi.fn();
    global.console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logger.debug', () => {
    it('should log debug messages in development', () => {
      // Mock console.debug since logger uses console[level] which becomes console['debug']
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.stubEnv('NODE_ENV', 'development');
      logger.debug('Test debug message');
      // Debug uses console.debug in development
      expect(consoleDebugSpy).toHaveBeenCalled();
      vi.unstubAllEnvs();
      consoleDebugSpy.mockRestore();
    });

    it('should not log debug messages in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      logger.debug('Test debug message');
      expect(console.log).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
  });

  describe('logger.info', () => {
    it('should log info messages', () => {
      logger.info('Test info message');
      expect(console.info).toHaveBeenCalled();
    });

    it('should log info messages with context', () => {
      const context = { userId: '123', role: 'admin' };
      logger.info('Test info message', context);
      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('logger.warn', () => {
    it('should log warning messages', () => {
      logger.warn('Test warning message');
      expect(console.warn).toHaveBeenCalled();
    });

    it('should log warnings with errors', () => {
      const error = new Error('Test error');
      logger.warn('Test warning', undefined, error);
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('logger.error', () => {
    it('should log error messages', () => {
      logger.error('Test error message');
      expect(console.error).toHaveBeenCalled();
    });

    it('should log errors with context and error object', () => {
      const error = new Error('Test error');
      const context = { userId: '123', endpoint: '/api/test' };
      logger.error('Test error message', context, error);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with default status 500', () => {
      const response = createErrorResponse('Test error');
      expect(response).toMatchObject({
        error: 'Test error',
        status: 500,
      });
    });

    it('should create error response with custom status', () => {
      const response = createErrorResponse('Not found', 404);
      expect(response).toMatchObject({
        error: 'Not found',
        status: 404,
      });
    });

    it('should include details in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const response = createErrorResponse('Test error', 500, { detail: 'test' });
      expect(response.details).toBeDefined();
      vi.unstubAllEnvs();
    });

    it('should log error for 5xx status codes', () => {
      createErrorResponse('Server error', 500);
      expect(console.error).toHaveBeenCalled();
    });

    it('should log warning for 4xx status codes', () => {
      createErrorResponse('Client error', 400);
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('handleApiError', () => {
    it('should handle Error instances', async () => {
      const error = new Error('Test error');
      const context = { endpoint: '/api/test' };
      const result = await handleApiError(error, context);

      expect(result.message).toBe('An unexpected error occurred');
      expect(result.status).toBe(500);
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle unauthorized errors', async () => {
      const error = new Error('Unauthorized access');
      const context = { endpoint: '/api/test' };
      const result = await handleApiError(error, context, 'Default message');

      expect(result.status).toBe(401);
      expect(result.message).toContain('Unauthorized');
    });

    it('should handle forbidden errors', async () => {
      const error = new Error('Forbidden: insufficient permissions');
      const context = { endpoint: '/api/test' };
      const result = await handleApiError(error, context);

      expect(result.status).toBe(403);
      expect(result.message).toContain('Forbidden');
    });

    it('should handle not found errors', async () => {
      const error = new Error('Resource does not exist');
      const context = { endpoint: '/api/test' };
      const result = await handleApiError(error, context);

      expect(result.status).toBe(404);
      expect(result.message).toContain('not found');
    });

    it('should handle validation errors', async () => {
      const error = new Error('Validation failed: invalid input');
      const context = { endpoint: '/api/test' };
      const result = await handleApiError(error, context);

      expect(result.status).toBe(400);
      expect(result.message).toContain('Validation');
    });

    it('should handle non-Error objects', async () => {
      const error = 'String error';
      const context = { endpoint: '/api/test' };
      const result = await handleApiError(error, context);

      expect(result.message).toBe('An unexpected error occurred');
      expect(result.status).toBe(500);
    });
  });
});

