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

const connectionString = process.env.DATABASE_URL!;

function resolveSSL(): false | { rejectUnauthorized: boolean } {
  if (
    process.env.DB_SSL === 'false' ||
    connectionString.includes('sslmode=disable') ||
    connectionString.includes('sslmode=no-ssl')
  ) {
    return false;
  }
  if (
    connectionString.includes('sslmode=require') ||
    connectionString.includes('sslmode=verify') ||
    process.env.DB_SSL === 'true' ||
    process.env.NODE_ENV === 'production'
  ) {
    return { rejectUnauthorized: false };
  }
  return false;
}

export const pool = new Pool({
  connectionString,
  ssl: resolveSSL(),
});

export const db = drizzle(pool, { schema });
console.log('[Database] Database pool initialized');
