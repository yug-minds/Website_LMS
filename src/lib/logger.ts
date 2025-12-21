
/**
 * Structured Logging Utility
 * Provides consistent logging across the application with context and error tracking
 * Integrated with Sentry for error tracking in production
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  role?: string;
  schoolId?: string;
  endpoint?: string;
  method?: string;
   
  [key: string]: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  private async sendToSentry(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    if (!this.sentryEnabled || level !== 'error') {
      return;
    }

    try {
      // Dynamic import to avoid issues if Sentry is not configured
      const Sentry = await import('@sentry/nextjs');
      
      if (error) {
        Sentry.captureException(error, {
          level: 'error',
          tags: {
            endpoint: context?.endpoint,
            method: context?.method,
            role: context?.role,
          },
          extra: {
            message,
            context: this.sanitizeContext(context),
          },
        });
      } else {
        Sentry.captureMessage(message, {
          level: 'error',
          tags: {
            endpoint: context?.endpoint,
            method: context?.method,
            role: context?.role,
          },
          extra: {
            context: this.sanitizeContext(context),
          },
        });
      }
    } catch (sentryError) {
      // Silently fail if Sentry is not available
      if (this.isDevelopment) {
        console.warn('Sentry not available:', sentryError);
      }
    }
  }

  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;
    
    // Remove sensitive data before sending to Sentry
    const sanitized = { ...context };
    // Don't send full user IDs, just last 4 chars
    if (sanitized.userId && sanitized.userId.length > 4) {
      sanitized.userId = `***${sanitized.userId.slice(-4)}`;
    }
    return sanitized;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    const formattedMessage = this.formatMessage(level, message, context);
    
    if (error) {
      const errorDetails = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
      console[level === 'error' ? 'error' : level](formattedMessage, errorDetails);
      
      // Send errors to Sentry
      if (level === 'error') {
        this.sendToSentry(level, message, context, error);
      }
    } else {
      console[level === 'error' ? 'error' : level](formattedMessage);
    }
  }

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext, error?: Error) {
    this.log('warn', message, context, error);
  }

  error(message: string, context?: LogContext, error?: Error) {
    this.log('error', message, context, error);
  }
}

export const logger = new Logger();

/**
 * Create error response with proper structure
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  details?: any,
  context?: LogContext
) {
  const errorResponse = {
    error: message,
    status,
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && context && { context }),
  };

  if (status >= 500) {
    logger.error(message, context);
  } else {
    logger.warn(message, context);
  }

  return errorResponse;
}

/**
 * Sanitize error message to prevent information disclosure
 */
function sanitizeErrorMessage(message: string): string {
  // Remove stack trace indicators
  const sanitized = message
    .replace(/at\s+.*/g, '') // Remove "at ..." stack trace lines
    .replace(/file:\/\/.*/g, '') // Remove file:// URLs
    .replace(/\/Users\/.*/g, '') // Remove /Users/ paths
    .replace(/\/home\/.*/g, '') // Remove /home/ paths
    .replace(/C:\\\\.*/g, '') // Remove Windows paths
    .replace(/node_modules.*/g, '') // Remove node_modules paths
    .replace(/internal\/.*/g, '') // Remove internal/ paths
    .trim();
  
  return sanitized || 'An error occurred';
}

/**
 * Handle API errors with proper logging and response
 */
export async function handleApiError(
  error: unknown,
  context: LogContext,
  defaultMessage: string = 'An unexpected error occurred'
): Promise<{ message: string; status: number; details?: any }> {
  if (error instanceof Error) {
    logger.error(defaultMessage, context, error);
    
    // Sanitize error message to prevent information disclosure
    const sanitizedMessage = sanitizeErrorMessage(error.message);
    
    // Handle specific error types
    if (error.message.includes('Unauthorized') || error.message.includes('authentication')) {
      return {
        message: 'Unauthorized: Authentication required',
        status: 401,
        details: process.env.NODE_ENV === 'development' ? sanitizedMessage : undefined,
      };
    }

    if (error.message.includes('Forbidden') || error.message.includes('permission')) {
      return {
        message: 'Forbidden: Insufficient permissions',
        status: 403,
        details: process.env.NODE_ENV === 'development' ? sanitizedMessage : undefined,
      };
    }

    if (error.message.includes('Not found') || error.message.includes('does not exist')) {
      return {
        message: 'Resource not found',
        status: 404,
        details: process.env.NODE_ENV === 'development' ? sanitizedMessage : undefined,
      };
    }

    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return {
        message: 'Validation error',
        status: 400,
        details: sanitizedMessage, // Validation errors are safe to show
      };
    }

    return {
      message: defaultMessage,
      status: 500,
      details: process.env.NODE_ENV === 'development' ? sanitizedMessage : undefined,
    };
  }

  logger.error(defaultMessage, context, new Error(String(error)));
  return {
    message: defaultMessage,
    status: 500,
  };
}

