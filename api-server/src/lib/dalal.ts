import { eq, sql } from "drizzle-orm";
import { db, usersTable, notificationsTable, networkNotificationsTable } from "@workspace/db";
import { randomUUID } from "crypto";

let cachedAdminId: string | null = null;

export async function getAdminUserId(): Promise<string | null> {
  if (cachedAdminId) return cachedAdminId;
  const [admin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .orderBy(sql`${usersTable.createdAt} ASC`)
    .limit(1);
  cachedAdminId = admin?.id ?? null;
  return cachedAdminId;
}

export async function createNotification(opts: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  if (!opts.userId) return;
  await db.insert(notificationsTable).values({
    id: randomUUID(),
    userId: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link ?? null,
  });
}

// إشعارات شبكة المكاتب/المحامين — منفصلة عن إشعارات المستخدمين العاديين.
export async function notifyNetwork(opts: {
  recipientType: "office" | "lawyer" | "admin";
  recipientId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  if (!opts.recipientId) return;
  await db.insert(networkNotificationsTable).values({
    id: randomUUID(),
    recipientType: opts.recipientType,
    recipientId: opts.recipientId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link ?? null,
  });
}

/** Notifies all admins (role=admin) via the regular user notifications table. */
export async function notifyAllAdmins(opts: { type: string; title: string; body: string; link?: string | null }): Promise<void> {
  const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
  await Promise.all(admins.map((a) => createNotification({ userId: a.id, ...opts })));
}
