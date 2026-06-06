import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const availableEnvVars = Object.keys(process.env).filter(key => 
  key.includes('DATABASE') || key.includes('PG') || key.includes('DB') || key.includes('POSTGRES')
);

if (!process.env.DATABASE_URL) {
  console.error('=== Database Configuration Error ===');
  console.error('DATABASE_URL environment variable is not set.');
  console.error('');
  console.error('Available database-related environment variables:', availableEnvVars.length > 0 ? availableEnvVars.join(', ') : 'NONE');
  console.error('');
  console.error('Please ensure DATABASE_URL is set.');
  console.error('=====================================');
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log('[Database] Connecting to PostgreSQL...');

// Ensure PgBouncer transaction-mode pooling is active.
// Neon hosted DBs: append ?pgbouncer=true to the pooler endpoint URL.
// Self-hosted: set DATABASE_URL to point at your PgBouncer port directly.
const rawUrl = process.env.DATABASE_URL!;
const connectionString = (() => {
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true');
    return u.toString();
  } catch {
    return rawUrl; // non-URL format — leave as-is
  }
})();

function resolveSSL(): false | { rejectUnauthorized: boolean } {
  // Explicitly disabled — never use SSL
  if (
    process.env.DB_SSL === 'false' ||
    connectionString.includes('sslmode=disable') ||
    connectionString.includes('sslmode=no-ssl')
  ) {
    return false;
  }
  // Explicitly enabled — use SSL without strict cert validation
  if (
    process.env.DB_SSL === 'true' ||
    connectionString.includes('sslmode=require') ||
    connectionString.includes('sslmode=verify-ca') ||
    connectionString.includes('sslmode=verify-full')
  ) {
    return { rejectUnauthorized: false };
  }
  // Default: no SSL — avoids breaking hosts that don't support it
  return false;
}

export const pool = new Pool({
  connectionString,
  ssl: resolveSSL(),
  max: 20,                  // 20 per process × PM2 workers = ~160 total connections
  idleTimeoutMillis: 30_000, // release idle connections after 30s
  connectionTimeoutMillis: 3_000, // fail fast if pool is exhausted
});

export const db = drizzle(pool, { schema });
console.log('[Database] Database pool initialized');
