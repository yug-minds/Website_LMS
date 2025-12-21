
/**
 * Frontend Logging Utility
 * Provides structured logging for client-side code with context and error tracking
 * Integrated with Sentry for error tracking in production
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  role?: string;
  schoolId?: string;
  component?: string;
  action?: string;
   
  [key: string]: any;
}

class FrontendLogger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private sentryEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  private sendToSentry(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    if (!this.sentryEnabled || level !== 'error') {
      return;
    }

    try {
      // Dynamic import to avoid issues if Sentry is not configured
      if (typeof window !== 'undefined') {
        import('@sentry/nextjs').then((Sentry) => {
          if (error) {
            Sentry.captureException(error, {
              level: 'error',
              tags: {
                component: context?.component,
                action: context?.action,
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
                component: context?.component,
                action: context?.action,
                role: context?.role,
              },
              extra: {
                context: this.sanitizeContext(context),
              },
            });
          }
        }).catch(() => {
          // Silently fail if Sentry is not available
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
    if (!this.isDevelopment && level === 'debug') {
      return; // Skip debug logs in production
    }

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
    this.log('debug', message, context);
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

export const frontendLogger = new FrontendLogger();

/**
 * Handle API errors in frontend with proper logging
 */
export function handleApiErrorResponse(
  error: unknown,
  context: LogContext,
  defaultMessage: string = 'An unexpected error occurred'
): { message: string; details?: string; status?: number } {
  if (error instanceof Error) {
    frontendLogger.error(defaultMessage, context, error);
    
    return {
      message: defaultMessage,
      details: error.message,
    };
  }

  if (typeof error === 'object' && error !== null && 'error' in error) {
    const apiError = error as { error: string; details?: string; status?: number };
    frontendLogger.error(apiError.error || defaultMessage, context);
    
    return {
      message: apiError.error || defaultMessage,
      details: apiError.details,
      status: apiError.status,
    };
  }

  frontendLogger.error(defaultMessage, context, new Error(String(error)));
  return {
    message: defaultMessage,
  };
}

/**
 * Enhanced fetch wrapper with error handling and logging
 */
export async function fetchWithLogging(
  url: string,
  options: RequestInit = {},
  context: LogContext = {}
): Promise<Response> {
  frontendLogger.debug('API request initiated', {
    ...context,
    url,
    method: options.method || 'GET',
  });

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      frontendLogger.error('API request failed', {
        ...context,
        url,
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });

      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    frontendLogger.debug('API request succeeded', {
      ...context,
      url,
      status: response.status,
    });

    return response;
  } catch (error) {
    frontendLogger.error('API request exception', {
      ...context,
      url,
    }, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

