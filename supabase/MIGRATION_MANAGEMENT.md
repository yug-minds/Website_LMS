# Migration Management Strategy

**Last Updated:** 2025-01-29  
**Total Migrations:** 73 files  
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Migration Categories](#migration-categories)
3. [Migration Naming Convention](#migration-naming-convention)
4. [Workflow](#workflow)
5. [Best Practices](#best-practices)
6. [Migration Organization](#migration-organization)
7. [Tools & Scripts](#tools--scripts)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This document outlines the migration management strategy for the Student Portal application using Supabase (hosted PostgreSQL). Migrations are SQL files that version-control database schema changes.

### Key Principles

- ✅ **Version Control:** All schema changes are tracked in Git
- ✅ **Idempotent:** Migrations can be run multiple times safely
- ✅ **Ordered:** Migrations run in timestamp order
- ✅ **Documented:** Each migration includes comments explaining its purpose
- ✅ **Tested:** Migrations are tested before applying to production

### Current Status

- **Database:** Supabase Hosted (PostgreSQL)
- **Migration Tool:** Supabase CLI + Manual SQL Editor
- **Total Migrations:** 73 files
- **Last Cleanup:** 2025-01-29 (removed 6 demo/test files, fixed 3 duplicate timestamps)

---

## Migration Categories

Migrations are organized by purpose:

### 1. **Schema Creation** (Foundation)
- Core table creation (profiles, schools, students, teachers)
- Initial schema setup
- **Files:** `20241201000001_*` to `20241201000024_*`

### 2. **RLS Policies** (Security)
- Row Level Security policies
- Access control rules
- **Files:** `*_rls*.sql`, `*_policies*.sql`

### 3. **Features** (Functionality)
- Dashboard tables
- Course management
- Attendance tracking
- **Files:** `*_dashboard*.sql`, `*_course*.sql`, `*_attendance*.sql`

### 4. **Data Integrity** (Quality)
- Foreign key constraints
- Data validation
- Sync triggers
- **Files:** `*_integrity*.sql`, `*_constraints*.sql`

### 5. **Performance** (Optimization)
- Indexes
- Query optimization
- **Files:** `*_indexes*.sql`, `*_performance*.sql`

### 6. **Security Features** (Hardening)
- Rate limiting tables
- Activity tracking
- Security enhancements
- **Files:** `*_rate_limiting*.sql`, `*_security*.sql`, `*_activity*.sql`

### 7. **Cleanup** (Maintenance)
- Remove deprecated tables
- Consolidate duplicates
- **Files:** `*_remove*.sql`, `*_cleanup*.sql`

---

## Migration Naming Convention

### Format
```
YYYYMMDDHHMMSS_descriptive_name.sql
```

### Examples
- ✅ `20250128000001_add_rate_limiting.sql` - Good
- ✅ `20250127000001_add_last_activity_tracking.sql` - Good
- ❌ `20250127000000_remove_custom_session_management.sql` - Duplicate timestamp (fixed)

### Rules
1. **Timestamp:** Must be unique (YYYYMMDDHHMMSS format)
2. **Name:** Use lowercase with underscores
3. **Action:** Start with verb (create, add, fix, remove, update)
4. **Descriptive:** Clearly describe what the migration does

### Timestamp Guidelines
- Use sequential timestamps for related migrations
- Leave gaps (00001, 00002, 00007) for future insertions
- Never reuse timestamps (causes conflicts)

---

## Workflow

### For New Migrations

1. **Create Migration File**
   ```bash
   # Generate timestamp
   date +"%Y%m%d%H%M%S"
   # Example: 20250129120000
   
   # Create file
   touch supabase/migrations/20250129120000_add_new_feature.sql
   ```

2. **Write Migration SQL**
   ```sql
   -- Migration: Add New Feature
   -- Date: 2025-01-29
   -- Purpose: Add new table for feature X
   
   CREATE TABLE IF NOT EXISTS new_feature (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     name text NOT NULL,
     created_at timestamptz DEFAULT now()
   );
   
   -- Add RLS
   ALTER TABLE new_feature ENABLE ROW LEVEL SECURITY;
   
   CREATE POLICY "Users can view own features"
     ON new_feature FOR SELECT
     USING (auth.uid() = user_id);
   ```

3. **Test Locally** (if using local Supabase)
   ```bash
   supabase migration up
   ```

4. **Apply to Hosted Supabase**
   ```bash
   # Option 1: Via Supabase CLI
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push --password YOUR_DB_PASSWORD
   
   # Option 2: Via Supabase Dashboard SQL Editor
   # Copy SQL from migration file and run in SQL Editor
   ```

5. **Verify**
   ```bash
   supabase migration list --password YOUR_DB_PASSWORD
   ```

### For Existing Database (Already Set Up)

If your database is already set up and you don't need to run old migrations:

1. **Keep migrations as documentation** ✅
2. **Only apply new migrations** going forward
3. **Use migrations for future changes** only

---

## Best Practices

### ✅ DO

1. **Always use `IF NOT EXISTS` / `IF EXISTS`**
   ```sql
   CREATE TABLE IF NOT EXISTS ...
   ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...
   DROP TABLE IF EXISTS ...
   ```

2. **Make migrations idempotent**
   ```sql
   -- Good: Can run multiple times safely
   CREATE INDEX IF NOT EXISTS idx_name ON table(column);
   
   -- Bad: Will fail on second run
   CREATE INDEX idx_name ON table(column);
   ```

3. **Include comments**
   ```sql
   -- Migration: Purpose
   -- Date: YYYY-MM-DD
   -- Related: Link to issue/PR
   ```

4. **Test before production**
   - Test in development/staging first
   - Verify SQL syntax
   - Check for breaking changes

5. **Use transactions for data migrations**
   ```sql
   BEGIN;
   -- Migration SQL
   COMMIT;
   ```

6. **Document breaking changes**
   ```sql
   -- BREAKING: This migration removes the 'old_column' field
   -- Update application code before applying this migration
   ```

### ❌ DON'T

1. **Don't modify existing migrations** (create new ones instead)
2. **Don't use demo/test data** in production migrations
3. **Don't skip RLS policies** (security risk)
4. **Don't use duplicate timestamps**
5. **Don't delete migrations** (archive instead if needed)

---

## Migration Organization

### Current Structure
```
supabase/migrations/
├── 20241201000001_create_profiles_table.sql
├── 20241201000002_create_admin_tables.sql
├── ...
└── 20250129000000_enable_pg_stat_statements.sql
```

### Recommended Organization (Optional)

For better organization, you can create subdirectories:

```
supabase/migrations/
├── 01_schema/
│   ├── 20241201000001_create_profiles_table.sql
│   └── ...
├── 02_features/
│   ├── 20241201000007_create_teacher_dashboard_tables.sql
│   └── ...
├── 03_security/
│   ├── 20250128000001_add_rate_limiting.sql
│   └── ...
└── 04_performance/
    ├── 20250128000000_add_performance_indexes.sql
    └── ...
```

**Note:** Supabase CLI expects all migrations in the root `migrations/` folder. Subdirectories would require custom tooling.

---

## Tools & Scripts

### Available Scripts

1. **Apply All Migrations**
   ```bash
   ./apply-all-migrations.sh
   ```

2. **Check Migration Status**
   ```bash
   supabase migration list --password YOUR_DB_PASSWORD
   ```

3. **Apply Single Migration** (via API)
   ```bash
   # Use the migration API endpoints
   POST /api/migrations/apply-direct
   ```

### Helper Scripts (To Create)

See `scripts/migration-helpers/` for:
- `create-migration.sh` - Generate new migration template
- `verify-migrations.sh` - Check for duplicate timestamps
- `list-migrations.sh` - Show migration summary

---

## Troubleshooting

### Issue: Duplicate Timestamp

**Error:** Migration conflict detected

**Solution:**
1. Check for duplicate timestamps:
   ```bash
   ls supabase/migrations/ | cut -d'_' -f1 | sort | uniq -d
   ```
2. Rename one of the conflicting files:
   ```bash
   mv 20250127000000_old.sql 20250127000001_old.sql
   ```

### Issue: Migration Already Applied

**Error:** Migration already exists in schema_migrations

**Solution:**
- If migration was applied manually, mark it as applied:
  ```sql
  INSERT INTO supabase_migrations.schema_migrations(version, name)
  VALUES ('20250128000001', 'add_rate_limiting')
  ON CONFLICT DO NOTHING;
  ```

### Issue: Migration Failed

**Error:** SQL error during migration

**Solution:**
1. Check SQL syntax
2. Verify table/column existence
3. Check for dependencies
4. Review error logs in Supabase dashboard

### Issue: RLS Policy Conflicts

**Error:** Policy already exists

**Solution:**
```sql
-- Use IF NOT EXISTS or DROP POLICY IF EXISTS
DROP POLICY IF EXISTS "old_policy" ON table_name;
CREATE POLICY "new_policy" ON table_name ...
```

---

## Migration Checklist

Before creating a new migration:

- [ ] Generate unique timestamp
- [ ] Use descriptive filename
- [ ] Include comments (purpose, date)
- [ ] Use `IF NOT EXISTS` / `IF EXISTS`
- [ ] Make it idempotent
- [ ] Add RLS policies if creating tables
- [ ] Test SQL syntax
- [ ] Document breaking changes
- [ ] Update this document if adding new category

Before applying to production:

- [ ] Test in development/staging
- [ ] Backup database
- [ ] Review migration SQL
- [ ] Check for dependencies
- [ ] Verify no breaking changes
- [ ] Apply during maintenance window (if needed)
- [ ] Monitor after application

---

## Migration History

### Recent Changes (2025-01-29)

- ✅ **Deleted 6 files:**
  - Demo data migration
  - Testing migrations (RLS disabled)
  - Temporary fixes
  - Rollback migrations

- ✅ **Fixed 3 duplicate timestamps:**
  - `20250127000000_remove_custom_session_management.sql` → `20250127000007_...`
  - `20250127000001_remove_duplicate_tables.sql` → `20250127000008_...`
  - `20250128000000_add_rate_limiting.sql` → `20250128000004_...`

### Migration Statistics

- **Total:** 73 migrations
- **By Year:**
  - 2024: 24 migrations (Dec 2024)
  - 2025: 49 migrations (Jan 2025)
- **By Category:**
  - Schema: ~20 migrations
  - RLS/Security: ~15 migrations
  - Features: ~20 migrations
  - Performance: ~5 migrations
  - Cleanup: ~8 migrations
  - Other: ~5 migrations

---

## Quick Reference

### Create New Migration
```bash
# 1. Generate timestamp
TIMESTAMP=$(date +"%Y%m%d%H%M%S")

# 2. Create file
touch "supabase/migrations/${TIMESTAMP}_your_migration_name.sql"

# 3. Write SQL with comments
```

### Apply Migration
```bash
# Via CLI
supabase db push --password YOUR_PASSWORD

# Via Dashboard
# Copy SQL to Supabase Dashboard → SQL Editor → Run
```

### Check Status
```bash
supabase migration list --password YOUR_PASSWORD
```

### Verify Timestamps
```bash
cd supabase/migrations
ls -1 | cut -d'_' -f1 | sort | uniq -d
# Should return nothing (no duplicates)
```

---

## Support

For migration issues:
1. Check this document
2. Review Supabase migration docs: https://supabase.com/docs/guides/cli/local-development#database-migrations
3. Check migration logs in Supabase dashboard
4. Review error messages carefully

---

**Last Updated:** 2025-01-29  
**Maintained By:** Development Team










