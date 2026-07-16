import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";
import { idCountersTable } from "./schema/id-counters";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

/**
 * Atomically generates the next sequential human-readable ID for a given
 * prefix, e.g. nextSequentialId("OF") -> "OF-001", then "OF-002", ...
 * Backed by id_counters so concurrent admin actions never collide.
 */
export async function nextSequentialId(prefix: string, padLength = 3): Promise<string> {
  const [row] = await db
    .insert(idCountersTable)
    .values({ key: prefix, value: 1 })
    .onConflictDoUpdate({
      target: idCountersTable.key,
      set: { value: sql`${idCountersTable.value} + 1` },
    })
    .returning();
  const value = row!.value;
  return `${prefix}-${String(value).padStart(padLength, "0")}`;
}
