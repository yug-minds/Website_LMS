#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 * Checks if all required and configured environment variables are set correctly
 */

require('dotenv').config({ path: '.env.local' });

const requiredVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const optionalVars = [
  'DATABASE_URL',
  'EMAIL_USER',
  'EMAIL_PASS',
  'NEXT_PUBLIC_SENTRY_DSN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'REDIS_ENABLED',
  'CRON_SECRET',
];

console.log('🔍 Validating Environment Variables...\n');

// Check required variables
let allValid = true;
const missing = [];
const present = [];

console.log('📋 Required Variables:');
for (const varName of requiredVars) {
  const value = process.env[varName];
  if (!value || value.trim() === '') {
    console.log(`  ❌ ${varName}: MISSING`);
    missing.push(varName);
    allValid = false;
  } else {
    // Mask sensitive values
    const masked = varName.includes('KEY') || varName.includes('PASSWORD') || varName.includes('SECRET')
      ? value.substring(0, 20) + '...' + value.substring(value.length - 10)
      : value;
    console.log(`  ✅ ${varName}: SET (${masked})`);
    present.push(varName);
  }
}

console.log('\n📋 Optional Variables:');
for (const varName of optionalVars) {
  const value = process.env[varName];
  if (value && value.trim() !== '') {
    const masked = varName.includes('KEY') || varName.includes('PASSWORD') || varName.includes('SECRET') || varName.includes('TOKEN')
      ? value.substring(0, 20) + '...' + value.substring(value.length - 10)
      : value;
    console.log(`  ✅ ${varName}: SET (${masked})`);
  } else {
    console.log(`  ⚪ ${varName}: not set (optional)`);
  }
}

// Validate Supabase URL format
console.log('\n🔗 Connection Validation:');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl) {
  try {
    const url = new URL(supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}`);
    if (url.hostname.includes('.supabase.co')) {
      console.log('  ✅ Supabase URL format: VALID');
    } else {
      console.log('  ⚠️  Supabase URL format: May not be a Supabase URL');
    }
  } catch (e) {
    console.log('  ❌ Supabase URL format: INVALID');
    allValid = false;
  }
}

// Validate Redis configuration
const redisEnabled = process.env.REDIS_ENABLED !== 'false';
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (redisEnabled) {
  if (redisUrl && redisToken) {
    console.log('  ✅ Redis: CONFIGURED');
  } else {
    console.log('  ⚠️  Redis: ENABLED but credentials missing (will use fallback)');
  }
} else {
  console.log('  ⚪ Redis: DISABLED (using fallback cache)');
}

// Validate Email configuration
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;

if (emailUser && emailPass) {
  console.log('  ✅ Email: CONFIGURED');
} else {
  console.log('  ⚪ Email: NOT CONFIGURED (contact form may not work)');
}

// Validate Database URL format
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  try {
    if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
      console.log('  ✅ Database URL format: VALID');
    } else {
      console.log('  ⚠️  Database URL format: May not be PostgreSQL');
    }
  } catch (e) {
    console.log('  ⚠️  Database URL: Could not validate format');
  }
} else {
  console.log('  ⚪ Database URL: NOT SET (connection pooling disabled)');
}

// Summary
console.log('\n' + '='.repeat(50));
if (allValid) {
  console.log('✅ All required environment variables are set!');
  console.log('\n💡 Next steps:');
  console.log('   1. Run: npm run dev');
  console.log('   2. Test the application at http://localhost:3000');
  process.exit(0);
} else {
  console.log('❌ Some required environment variables are missing!');
  console.log('\nMissing variables:');
  missing.forEach(v => console.log(`   - ${v}`));
  console.log('\n💡 Please update your .env.local file with the missing variables.');
  process.exit(1);
}

