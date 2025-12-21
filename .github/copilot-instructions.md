# AI Coding Agent Instructions

## Project Overview

**Student Portal** is a comprehensive student management system built with **Next.js 14** (App Router), **TypeScript**, **Supabase** (hosted PostgreSQL), and **Tailwind CSS**. It serves multiple roles: admin, school admin, teacher, and student, each with distinct dashboards and permissions.

### Architecture Essentials

- **Frontend**: React 18 + Next.js App Router in `src/app/` with role-based dashboards (`/admin`, `/school-admin`, `/teacher`, `/student`)
- **Backend**: 97+ API endpoints in `src/app/api/` with consistent error handling and rate limiting
- **Database**: Supabase (PostgreSQL) with 73 migrations in `supabase/migrations/`
- **Authentication**: Supabase Auth with role-based access control (RBAC) via `profiles.role` column
- **Error & Monitoring**: Centralized logging via `src/lib/logger.ts`, Sentry integration, activity tracking

## Critical Patterns & Conventions

### 1. API Route Authorization Flow (MANDATORY for Admin Endpoints)

**All admin API routes MUST follow this security order**:

```typescript
export async function POST(request: NextRequest) {
  // 1. FIRST: Verify admin access
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.success) {
    logger.warn('Unauthorized access attempt', { endpoint: '/api/admin/...' });
    return adminCheck.response;
  }

  // 2. Validate CSRF token
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  // 3. Apply rate limiting
  const rateLimitResult = await rateLimit(request, RateLimitPresets.WRITE);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
    );
  }

  // 4. Business logic
  try {
    logger.info('Operation starting', { 
      endpoint: '/api/admin/...',
      userId: adminCheck.userId  // Include user ID from verified admin
    });
    // ... rest of implementation
  } catch (error) {
    const errorInfo = await handleApiError(error, {...}, 'Error message');
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
```

**Key Points**:
- Always call `verifyAdmin()` or `verifyRole()` BEFORE any other processing
- Include `userId` from the verified admin check in all logging contexts
- Non-admin endpoints use `getAuthenticatedUserId()` instead

### 2. Frontend Authentication for API Calls

**Frontend must always include authorization tokens**:

```typescript
// Use fetchWithCsrf (handles both auth + CSRF tokens automatically)
import { fetchWithCsrf } from '@/lib/csrf-client';

const response = await fetchWithCsrf('/api/admin/teachers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(formData),
});
// Automatically includes:
// - Authorization: Bearer <supabase_token>
// - x-csrf-token: <token>
// - Cookie: (for session)
```

**How it works**:
- `fetchWithCsrf` calls `getAuthToken()` to fetch Supabase session token
- Includes token as `Authorization: Bearer <token>` header
- ALSO fetches and includes CSRF token from `/api/csrf-token`
- Sends `credentials: 'include'` for cookie-based session

### 3. API Route Error Handling (Mandatory)

**All API routes must use `handleApiError`** from `src/lib/logger.ts`. This ensures consistent error handling, sanitization, and Sentry tracking.

```typescript
import { logger, handleApiError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    logger.info('Starting operation', { endpoint: '/api/example' });
    // ... business logic
  } catch (error) {
    const errorInfo = await handleApiError(
      error,
      { endpoint: '/api/example', userId: adminCheck.userId },
      'Default error message'
    );
    return NextResponse.json(errorInfo, { status: errorInfo.status });
  }
}
```

### 2. Input Validation with Zod

**All user inputs require Zod schema validation** in `src/lib/validation-schemas.ts`. Define schemas once, reuse everywhere.

```typescript
import { validateRequestBody } from '@/lib/validation-schemas';
import { createStudentSchema } from '@/lib/validation-schemas';

// In route handler:
const { data, error } = validateRequestBody(await request.json(), createStudentSchema);
if (error) {
  return NextResponse.json({ error }, { status: 400 });
}
```

### 3. Authentication & Authorization

- **Check user ID**: `getAuthenticatedUserId(request)` from `src/lib/auth-utils.ts`
- **Role-specific checks**: `getTeacherUserId()`, `getSchoolAdminSchoolId()` from specialized auth modules
- **Activity tracking**: Automatically updates `profiles.last_activity` on authenticated requests (non-blocking)
- **CSRF protection**: All POST/PUT/DELETE routes validate CSRF via `validateCsrf(request)` from `src/lib/csrf-middleware.ts`

```typescript
const userId = await getAuthenticatedUserId(request);
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

### 4. Database Access Pattern

Use `supabaseAdmin` for server-side operations (from `src/lib/supabase.ts`):

```typescript
import { supabaseAdmin } from '@/lib/supabase';

const { data, error } = await supabaseAdmin
  .from('table_name')
  .select('column1, column2')
  .eq('condition', value)
  .single();
```

**Key points**:
- Always check for errors after queries
- Use `.single()` for single-row queries to handle null properly
- Row-level security (RLS) policies are enforced at database level
- Foreign key constraints prevent orphaned data

### 5. Logging Context Structure

Always include meaningful context in logs:

```typescript
logger.info('Action description', {
  endpoint: '/api/path',
  userId: userId, // if applicable
  schoolId: schoolId, // if applicable
  method: 'GET|POST|PUT|DELETE',
  additionalField: value
});
```

## Key Files & Directories

| File/Directory | Purpose |
|---|---|
| `src/lib/logger.ts` | Centralized logging, error handling, Sentry integration |
| `src/lib/validation-schemas.ts` | Zod schemas for all request/response validation |
| `src/lib/rate-limit.ts` | Rate limiting with configurable presets (READ, WRITE, STRICT) |
| `src/lib/auth-utils.ts` | Authentication utilities and user ID extraction |
| `src/lib/csrf-middleware.ts` | CSRF token validation and generation |
| `src/app/api/` | All API endpoints (97+ routes with consistent patterns) |
| `supabase/migrations/` | Database schema (73 migrations, ordered by timestamp) |
| `src/components/` | Reusable React components (Radix UI + Tailwind) |
| `src/app/providers.tsx` | React Query setup (1min stale time, no refetch on focus) |

## Authorization & Security Fixes (Recent)

### Fixed Issue: "Failed to add teacher: Unauthorized"

**Root Cause**: Frontend wasn't sending authorization token with API requests

**Solution Applied**:
1. Enhanced `src/lib/csrf-client.ts` to include auth tokens via `getAuthToken()`
2. Updated `fetchWithCsrf()` to automatically include `Authorization: Bearer <token>` header
3. Enhanced error logging in `src/lib/auth-utils.ts` for better diagnostics
4. Fixed multiple admin endpoints to call `verifyAdmin()` before processing

**Related Files**:
- `src/lib/csrf-client.ts` - Includes `getAuthToken()`, `addTokensToHeaders()`
- `src/lib/auth-utils.ts` - Enhanced `getAuthenticatedUserId()` with debug logging
- `src/app/api/admin/*/route.ts` - All now follow auth → CSRF → rate-limit → logic pattern

**See Also**: `AUTHORIZATION_FIX_GUIDE.md` for complete audit and remaining issues

## Database Schema Essentials

- **Core tables**: `profiles` (users with `role` column), `schools`, `students`, `teachers`, `courses`
- **Access control**: RLS policies enforce role-based access at row level
- **Migrations**: 73 files organized by category (schema, RLS, features, performance, security)
- **Activity tracking**: `profiles.last_activity` updated non-blocking on authenticated requests
- **Rate limiting**: `rate_limit_logs` table tracks requests by user/IP/endpoint

## Development Workflows

### Running tests & validation

```bash
npm run dev              # Start dev server on localhost:3000
npm run build            # Build for production
npm run lint             # Run ESLint
npm run typecheck        # Type check without emitting
npm run test:api-routes  # Test error handling on all routes
npm run perf:test        # Load test with artillery
```

### Debugging Authorization Issues

When you see "Unauthorized" errors:

1. **Check browser console** for warnings like:
   - "No authorization header present in request"
   - "Invalid authorization header format"
   - "Token is valid but no user found"

2. **Verify Network tab** (DevTools):
   - Request headers include `Authorization: Bearer <token>`
   - Request includes `x-csrf-token` header
   - Response from `/api/csrf-token` returns valid token

3. **Check admin role**:
   - User must have `role = 'admin'` in `profiles` table
   - Verify with: `supabaseAdmin.from('profiles').select('id, role').eq('id', userId)`

4. **Enable detailed logging**:
   - Look for console warnings with "❌" prefix
   - Check server logs for `logger.warn()` calls
   - Search for "Unauthorized access attempt" in logs

### Environment variables (required for dev)

Use `./setup-env.sh` or manually set in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Server-side admin key (never expose to client)

### Database migrations

- Use Supabase CLI: `supabase db push` after modifying migrations
- Migrations run in order by timestamp (e.g., `20250120000001_*`)
- Each migration must be idempotent (safe to re-run)
- Add comments explaining the "why" behind schema changes

## Common Pitfalls to Avoid

1. **Forget error handling**: Every API route must handle errors with `handleApiError`
2. **Skip validation**: Always validate input with predefined Zod schemas
3. **Hardcode role checks**: Use specialized auth functions (`getTeacherUserId`, etc.) instead
4. **Sync database updates**: Activity tracking and rate limiting should not block requests
5. **Expose sensitive errors**: Only expose sanitized messages to client; details logged internally
6. **Missing CSRF on mutations**: All POST/PUT/DELETE routes must validate CSRF
7. **Unbounded queries**: Always limit result sets (use pagination utilities in `src/lib/pagination.ts`)
8. **Assume authentication**: Always check for null user ID, never assume authenticated state

## Component & UI Conventions

- **Use Radix UI primitives** wrapped in `src/components/` for consistency
- **Styling**: Tailwind CSS with `clsx` for conditional classes
- **Forms**: Leverage Zod schema validation with React Hook Form patterns
- **State management**: React Query for server state (`tanstack/react-query`), React hooks for local state
- **Error boundaries**: Wrap routes with `ErrorBoundary` from `src/app/error-boundary.tsx`

## Performance Optimizations

- React Query stale time: 1 minute by default (adjust per endpoint need)
- Disable refetch on window focus by default (reduces unnecessary API calls)
- Implement pagination for large result sets (use utilities in `src/lib/pagination.ts`)
- Rate limiting prevents abuse; respect rate limit headers in responses
- Activity tracking is non-blocking to avoid request latency

## Security Reminders

- ✅ Never log sensitive data (passwords, tokens, PII)
- ✅ Sanitize error messages before sending to client
- ✅ Validate all inputs with Zod before processing
- ✅ Use `SUPABASE_SERVICE_ROLE_KEY` only server-side
- ✅ Enforce CSRF on all state-changing endpoints
- ✅ Respect RLS policies; never bypass via raw SQL
- ✅ Rate limit all public endpoints

## When in Doubt

1. **Check `src/app/api/admin/schools/route.ts`** for the canonical API pattern
2. **Review `src/lib/validation-schemas.ts`** for schema examples before creating new ones
3. **Look at `src/lib/logger.ts`** for error handling patterns
4. **Search for `handleApiError` usage** to see how errors should be handled
5. **Check middleware.ts** for public vs. protected route patterns
