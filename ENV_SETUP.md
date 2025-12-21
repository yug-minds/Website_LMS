# Environment Variables Setup Guide

Based on the `.vercelignore` file, the following environment variables should be set in `.env.local` (which is ignored by Vercel).

## Required Environment Variables

These variables are **required** for the application to run:

```env
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

## Optional Environment Variables

These variables have defaults or enable optional features:

```env
# Database Configuration (Optional - for connection pooling)
DATABASE_URL=postgresql://user:password@host:port/database

# Redis/Cache Configuration (Optional - for caching)
# Set REDIS_ENABLED=false to disable Redis caching
REDIS_ENABLED=true
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Admin User Configuration (Optional - has defaults)
ADMIN_EMAIL=likithkarnekota@gmail.com
ADMIN_PASSWORD=Likith@1808
ADMIN_FULL_NAME=Admin User

# Email Configuration (Optional - for contact form)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Sentry Error Tracking (Optional)
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn

# Google Analytics (Optional)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Application URL (Optional - for certificate generation)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Analytics Endpoint (Optional)
NEXT_PUBLIC_ANALYTICS_ENDPOINT=https://your-analytics-endpoint.com

# Cron Job Security (Optional - for protected cron endpoints)
CRON_SECRET=your-secret-key-here

# User Activity Tracking (Optional)
NEXT_PUBLIC_INACTIVITY_TIMEOUT_MS=1800000
NEXT_PUBLIC_INACTIVITY_WARNING_MS=300000

# Cache Verification (Optional - for development/testing)
VERIFY_CACHE_WRITES=false
```

## How to Create .env.local

1. Create a file named `.env.local` in the root directory of the project
2. Copy the required variables above and fill in your actual values
3. Add any optional variables you need

**Note**: The `.vercelignore` file specifies that `.env.local` and `.env*.local` files are ignored from Vercel deployments, so your local environment variables won't be accidentally committed or deployed.

## Getting Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy the following:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## Getting Redis Credentials (if using Upstash Redis)

1. Go to your Upstash Redis dashboard
2. Copy the **REST URL** → `UPSTASH_REDIS_REST_URL`
3. Copy the **REST TOKEN** → `UPSTASH_REDIS_REST_TOKEN`

## Running the Project

Once you have your `.env.local` file set up:

```bash
# Install dependencies (if not already installed)
npm install

# Run the development server
npm run dev

# The application will be available at http://localhost:3000
```

