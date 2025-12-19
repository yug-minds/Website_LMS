// Simple script to trigger a Sentry error
const { execSync } = require('child_process');

console.log('Triggering Sentry test error...\n');

// This will cause a ReferenceError that should be caught by Sentry
try {
  // Call undefined function as per the example
  myUndefinedFunction();
} catch (error) {
  console.error('Error caught:', error.message);
  console.error('Error type:', error.constructor.name);
  console.log('\n✅ Error triggered successfully!');
  console.log('Check your Sentry dashboard to see if this error was captured.');
  console.log('Sentry DSN:', process.env.NEXT_PUBLIC_SENTRY_DSN || 'Using fallback DSN');
}


