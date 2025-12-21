// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
// Suppress Next.js warnings about Promise params/searchParams during Sentry serialization
import '@/lib/suppress-nextjs-promise-warnings';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://8fc8fc58aca2d76641434c942d9dec33@o4510559630655488.ingest.us.sentry.io/4510559634128896",

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out sensitive data and Promise props
  beforeSend(event, hint) {
    // Remove sensitive information
    if (event.request) {
      // Don't send full URLs in production
      if (process.env.NODE_ENV === 'production') {
        delete event.request.url;
      }
    }
    
    // Remove user data if needed
    if (event.user) {
      // Only send partial user ID
      if (event.user.id && typeof event.user.id === 'string' && event.user.id.length > 4) {
        event.user.id = `***${event.user.id.slice(-4)}`;
      }
    }
    
    // Helper function to recursively filter out Promise props
    const filterPromises = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return obj;
      }
      
      // Skip if it's a Promise
      if (obj instanceof Promise) {
        return '[Promise - not serialized]';
      }
      
      // Skip if it's a function
      if (typeof obj === 'function') {
        return '[Function - not serialized]';
      }
      
      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(filterPromises);
      }
      
      // Handle objects
      if (typeof obj === 'object') {
        const filtered: any = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            // Skip Promise props (params, searchParams in Next.js 16)
            if (value instanceof Promise) {
              filtered[key] = '[Promise - not serialized]';
            } else {
              filtered[key] = filterPromises(value);
            }
          }
        }
        return filtered;
      }
      
      return obj;
    };
    
    // Filter out Promise props from all contexts
    if (event.contexts) {
      event.contexts = filterPromises(event.contexts) as any;
    }
    
    // Filter out Promise props from extra data
    if (event.extra) {
      event.extra = filterPromises(event.extra);
    }
    
    // Filter out Promise props from tags
    if (event.tags) {
      event.tags = filterPromises(event.tags);
    }
    
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;