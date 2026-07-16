import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

// Idempotent: creates the admin user if missing, otherwise makes sure the
// existing account has the admin role and the documented password.
const ADMIN_PHONE = "07740080310";
const ADMIN_PASSWORD = "sofydono3?";
const ADMIN_NAME = "الإدارة";

async function main() {
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, ADMIN_PHONE))
    .limit(1);

  if (existing) {
    await db
      .update(usersTable)
      .set({ password: hashed, role: "admin" })
      .where(eq(usersTable.phone, ADMIN_PHONE));
    console.log(`Updated existing user ${ADMIN_PHONE} to admin role.`);
  } else {
    await db.insert(usersTable).values({
      id: randomUUID(),
      phone: ADMIN_PHONE,
      password: hashed,
      name: ADMIN_NAME,
      role: "admin",
    });
    console.log(`Created admin user ${ADMIN_PHONE}.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed admin user:", err);
  process.exit(1);
});
