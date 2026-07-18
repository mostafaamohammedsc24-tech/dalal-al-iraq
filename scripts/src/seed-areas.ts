import { randomUUID } from "crypto";
import { db, areasTable } from "@workspace/db";
import { IRAQ_AREAS } from "./data/iraq-areas.js";

// Idempotent: inserts every (city, area) pair from the dataset, skipping any
// that already exist (unique constraint on city+name). Safe to re-run.
async function main() {
  let inserted = 0;
  for (const [city, areas] of Object.entries(IRAQ_AREAS)) {
    for (const name of areas) {
      const res = await db
        .insert(areasTable)
        .values({ id: randomUUID(), city, name })
        .onConflictDoNothing({ target: [areasTable.city, areasTable.name] })
        .returning({ id: areasTable.id });
      if (res.length > 0) inserted++;
    }
  }
  console.log(`Seeded areas. Newly inserted: ${inserted}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed areas:", err);
  process.exit(1);
});
