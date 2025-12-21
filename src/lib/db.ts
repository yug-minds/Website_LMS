/**
 * Direct PostgreSQL database connection
 * 
 * This provides a direct connection to the PostgreSQL database,
 * bypassing the Supabase API. Use this for:
 * - Complex queries that are easier with raw SQL
 * - Performance-critical operations
 * - Database administration tasks
 * 
 * ⚠️  Note: This bypasses Row Level Security (RLS) policies.
 * Use the Supabase client (src/lib/supabase.ts) for most operations
 * as it respects RLS and provides better security.
 * 
 * 📌 Connection Pooling Recommendations:
 * - For Supabase Free Tier (Nano): Use connection pooler (port 6543) with max 150
 * - For Direct Connections (port 5432): Free tier max is 60, use max 15-20 (avoid >80% warning)
 * - Get pooler connection string from: Supabase Dashboard → Settings → Database → Connection Pooling
 * - Note: Reduce "Pool Size" in Supabase dashboard to 15-20 if using direct connections (currently 50 causes warning)
 */

import postgres from 'postgres';
import { getRequiredEnv } from './env';
import { getPoolConfig } from './connection-pool-monitor';

// Get database connection string from environment
const connectionString = getRequiredEnv('DATABASE_URL', 'Database URL');

// Get optimized pool configuration
const poolConfig = getPoolConfig();

// Create SQL client with optimized connection pooling
export const sql = postgres(connectionString, {
  // Maximum number of connections in the pool
  // Optimized based on connection type and environment
  max: poolConfig.max,
  // Connection timeout in milliseconds
  connect_timeout: poolConfig.connect_timeout,
  // Idle timeout - close connections after this many seconds of inactivity
  idle_timeout: poolConfig.idle_timeout,
  // Maximum lifetime of a connection in seconds
  max_lifetime: poolConfig.max_lifetime,
});

// Export a function to close all connections (useful for cleanup)
export async function closeDatabaseConnection() {
  await sql.end();
}

// Example usage:
// import { sql } from '@/lib/db';

// const users = await sql`SELECT * FROM profiles WHERE role = 'admin'`;

