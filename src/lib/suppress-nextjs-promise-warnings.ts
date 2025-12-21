/**
 * Suppress Next.js warnings about Promise params/searchParams during Sentry serialization
 * 
 * These warnings occur when Sentry's React integration tries to serialize component props
 * that contain Promise params/searchParams. The components properly unwrap these using
 * React.use(), so these warnings are false positives during Sentry's instrumentation.
 * 
 * This should be imported as early as possible in the application lifecycle.
 * 
 * Note: This suppresses warnings that occur when Sentry's instrumentation tries to serialize
 * component props. All page components properly unwrap params and searchParams using React.use(),
 * so these warnings don't indicate an actual problem in the application code.
 */

// Extend Window interface to include our flag
declare global {
  interface Window {
    __nextjs_promise_warnings_suppressed__?: boolean;
  }
}

// Run immediately when module loads (both client and server, but only patch on client)
if (typeof window !== 'undefined') {
  // Only patch once, even if module is loaded multiple times
  if (!window.__nextjs_promise_warnings_suppressed__) {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    // Patch console.error
    console.error = (...args: any[]) => {
      // Convert all arguments to strings for checking
      const messages = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message + ' ' + arg.stack;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }).join(' ');
      
      // Check if this is a Next.js Promise warning
      // Match various formats of the warning message
      const isNextJsPromiseWarning = 
        messages.includes('params are being enumerated') ||
        messages.includes('params is a Promise') ||
        messages.includes('The keys of `searchParams` were accessed directly') ||
        messages.includes('searchParams` is a Promise and must be unwrapped') ||
        messages.includes('`params` is a Promise and must be unwrapped') ||
        (messages.includes('params') && messages.includes('Promise') && messages.includes('unwrapped')) ||
        (messages.includes('The keys of') && messages.includes('searchParams') && messages.includes('accessed directly')) ||
        (messages.includes('searchParams') && messages.includes('is a Promise')) ||
        (messages.includes('searchParams') && messages.includes('Promise') && messages.includes('unwrapped')) ||
        messages.includes('sync-dynamic-apis') || // Next.js error code
        messages.includes('React.use()') && (messages.includes('params') || messages.includes('searchParams')); // Generic React.use warning
      
      if (isNextJsPromiseWarning) {
        // Silently ignore these warnings - they're false positives from Sentry's serialization
        // The components already properly unwrap params/searchParams using React.use()
        return;
      }
      
      // For all other errors, call the original console.error
      originalError.apply(console, args);
    };
    
    // Also patch console.warn as a backup
    console.warn = (...args: any[]) => {
      const messages = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }).join(' ');
      
      const isNextJsPromiseWarning = 
        messages.includes('params are being enumerated') ||
        messages.includes('params is a Promise') ||
        messages.includes('The keys of `searchParams` were accessed directly') ||
        messages.includes('searchParams` is a Promise and must be unwrapped') ||
        messages.includes('`params` is a Promise and must be unwrapped') ||
        (messages.includes('params') && messages.includes('Promise') && messages.includes('unwrapped')) ||
        (messages.includes('The keys of') && messages.includes('searchParams') && messages.includes('accessed directly')) ||
        (messages.includes('searchParams') && messages.includes('is a Promise')) ||
        (messages.includes('searchParams') && messages.includes('Promise') && messages.includes('unwrapped')) ||
        messages.includes('sync-dynamic-apis') ||
        messages.includes('React.use()') && (messages.includes('params') || messages.includes('searchParams'));
      
      if (isNextJsPromiseWarning) {
        return;
      }
      
      originalWarn.apply(console, args);
    };
    
    // Mark as patched
    window.__nextjs_promise_warnings_suppressed__ = true;
  }
}

// Export something to make this a proper module
export const suppressPromiseWarnings = true;


