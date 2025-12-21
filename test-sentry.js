// Test script to trigger Sentry error
// Run with: node test-sentry.js

// Import Sentry
const Sentry = require('@sentry/nextjs');

// Initialize Sentry with the DSN
Sentry.init({
  dsn: "https://8fc8fc58aca2d76641434c942d9dec33@o4510559630655488.ingest.us.sentry.io/4510559634128896",
  tracesSampleRate: 1.0,
});

console.log('🚀 Sending test error to Sentry...\n');

// Trigger the undefined function error (as per example)
try {
  myUndefinedFunction();
} catch (error) {
  console.error('❌ Error caught:', error.message);
  console.error('Error type:', error.constructor.name);
  
  // Send to Sentry
  Sentry.captureException(error);
  console.log('\n✅ Error sent to Sentry!');
  console.log('Check your Sentry dashboard: https://sentry.io/organizations/yugminds-74/projects/javascript-nextjs/');
  
  // Give Sentry time to send
  setTimeout(() => {
    console.log('\n✨ Done! Check your Sentry dashboard for the error.');
    process.exit(0);
  }, 2000);
}


