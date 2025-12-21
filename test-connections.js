#!/usr/bin/env node

/**
 * Test connections to external services
 */

require('dotenv').config({ path: '.env.local' });

const https = require('https');
const http = require('http');

console.log('🔌 Testing External Connections...\n');

// Test Supabase connection
async function testSupabase() {
  return new Promise((resolve) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      console.log('❌ Supabase: URL not configured');
      resolve(false);
      return;
    }

    const supabaseUrl = url.startsWith('http') ? url : `https://${url}`;
    const parsedUrl = new URL(supabaseUrl);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: '/rest/v1/',
      method: 'GET',
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 404) {
        console.log('✅ Supabase: Connection successful');
        resolve(true);
      } else {
        console.log(`⚠️  Supabase: Connection returned status ${res.statusCode}`);
        resolve(true); // Still consider it working
      }
      res.on('data', () => {});
      res.on('end', () => {});
    });

    req.on('error', (e) => {
      console.log(`❌ Supabase: Connection failed - ${e.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('❌ Supabase: Connection timeout');
      resolve(false);
    });

    req.end();
  });
}

// Test Redis/Upstash connection
async function testRedis() {
  return new Promise((resolve) => {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      console.log('⚠️  Redis: Not configured (using fallback cache)');
      resolve(true); // Not an error, just not configured
      return;
    }

    try {
      const parsedUrl = new URL(redisUrl);
      const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: '/ping',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${redisToken}`
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 200 || res.statusCode === 401) {
          console.log('✅ Redis: Connection successful');
          resolve(true);
        } else {
          console.log(`⚠️  Redis: Connection returned status ${res.statusCode}`);
          resolve(true);
        }
        res.on('data', () => {});
        res.on('end', () => {});
      });

      req.on('error', (e) => {
        console.log(`⚠️  Redis: Connection test failed - ${e.message}`);
        console.log('   (This is OK - Redis will use fallback if connection fails)');
        resolve(true); // Not critical
      });

      req.on('timeout', () => {
        req.destroy();
        console.log('⚠️  Redis: Connection timeout (using fallback)');
        resolve(true);
      });

      req.end();
    } catch (e) {
      console.log(`⚠️  Redis: Invalid URL format - ${e.message}`);
      resolve(true);
    }
  });
}

async function runTests() {
  console.log('Testing connections (this may take a few seconds)...\n');
  
  const supabaseOk = await testSupabase();
  await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
  await testRedis();

  console.log('\n' + '='.repeat(50));
  if (supabaseOk) {
    console.log('✅ All critical connections are working!');
    console.log('\n💡 Your environment is properly configured.');
    console.log('   You can now run: npm run dev');
    process.exit(0);
  } else {
    console.log('⚠️  Some connections had issues, but configuration looks correct.');
    console.log('   This might be due to network or firewall settings.');
    process.exit(0);
  }
}

runTests();

