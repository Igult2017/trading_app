import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const availableEnvVars = Object.keys(process.env).filter(key => 
  key.includes('DATABASE') || key.includes('PG') || key.includes('DB') || key.includes('POSTGRES')
);

if (!process.env.DATABASE_URL) {
  console.error('=== Database Configuration Error ===');
  console.error('DATABASE_URL environment variable is not set.');
  console.error('');
  console.error('Available database-related environment variables:', availableEnvVars.length > 0 ? availableEnvVars.join(', ') : 'NONE');
  console.error('');
  console.error('For Coolify deployment, ensure:');
  console.error('1. DATABASE_URL is set in Environment Variables (not Build Args)');
  console.error('2. The value format is: postgresql://user:password@host:port/database');
  console.error('3. No quotes around the value');
  console.error('4. Redeploy after setting the variable');
  console.error('=====================================');
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log('[Database] Connecting to PostgreSQL...');
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
console.log('[Database] Database pool initialized');
