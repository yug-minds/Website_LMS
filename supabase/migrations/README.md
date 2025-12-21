# Database Migrations

This directory contains SQL migration files for the Student Portal database schema.

## Quick Start

### View All Migrations
```bash
./scripts/migration-helpers/list-migrations.sh
```

### Verify Migrations
```bash
./scripts/migration-helpers/verify-migrations.sh
```

### Create New Migration
```bash
./scripts/migration-helpers/create-migration.sh your_migration_name
```

## Documentation

For complete migration management strategy, see:
- **[MIGRATION_MANAGEMENT.md](../MIGRATION_MANAGEMENT.md)** - Complete guide

## Current Status

- **Total Migrations:** 73 files
- **Last Updated:** 2025-01-29
- **Status:** ✅ All timestamps unique, no duplicates

## Migration Categories

1. **Schema Creation** - Core tables and initial setup
2. **RLS Policies** - Security and access control
3. **Features** - Dashboard, courses, attendance
4. **Data Integrity** - Constraints and validation
5. **Performance** - Indexes and optimization
6. **Security Features** - Rate limiting, activity tracking
7. **Cleanup** - Remove deprecated tables

## Important Notes

- ⚠️ **Never modify existing migration files** - Create new ones instead
- ✅ **Always use IF NOT EXISTS / IF EXISTS** for idempotency
- ✅ **Test migrations** before applying to production
- ✅ **Keep migrations as documentation** even if database is already set up

## Applying Migrations

### To Hosted Supabase

**Option 1: Via Supabase CLI**
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --password YOUR_DB_PASSWORD
```

**Option 2: Via Supabase Dashboard**
1. Go to SQL Editor in Supabase Dashboard
2. Copy SQL from migration file
3. Run the SQL

### Check Applied Migrations
```bash
supabase migration list --password YOUR_DB_PASSWORD
```

## File Naming

Format: `YYYYMMDDHHMMSS_descriptive_name.sql`

Example: `20250128000001_add_rate_limiting.sql`

- Timestamp must be unique
- Use lowercase with underscores
- Be descriptive about what the migration does










