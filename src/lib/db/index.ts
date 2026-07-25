import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Lazy singleton: nothing connects at import time, so unit tests and the
// Next.js build can load modules that import `getDb` without a database.
let db: NodePgDatabase<typeof schema> | null = null;

export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set — copy .env.example to .env");
    }
    db = drizzle(new Pool({ connectionString }), { schema });
  }
  return db;
}

export * from "./schema";
