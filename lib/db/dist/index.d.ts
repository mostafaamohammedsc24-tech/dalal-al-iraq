import * as schema from "./schema";
export declare const pool: import("pg").Pool;
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("pg").Pool;
};
export * from "./schema";
/**
 * Atomically generates the next sequential human-readable ID for a given
 * prefix, e.g. nextSequentialId("OF") -> "OF-001", then "OF-002", ...
 * Backed by id_counters so concurrent admin actions never collide.
 */
export declare function nextSequentialId(prefix: string, padLength?: number): Promise<string>;
//# sourceMappingURL=index.d.ts.map