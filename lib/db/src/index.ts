import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * Database configuration is optional for the API server because on-chain
 * indexing is explicitly disabled unless it is configured. Consumers must
 * surface the missing URL when they require durable storage; importing this
 * package must not make a disabled server fail to boot.
 */
export const databaseConfigured = Boolean(process.env.DATABASE_URL);
export const pool = databaseConfigured
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : undefined;
export const db = pool ? drizzle(pool, { schema }) : undefined;

export * from "./schema";
