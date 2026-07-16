import { Router } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, officesTable } from "@workspace/db";
import { signToken, authMiddleware, requireRole } from "../lib/auth";

const router = Router();

router.post("/login", async (req, res) => {
  const { id, password } = req.body as { id?: string; password?: string };
  if (!id?.trim() || !password) {
    res.status(400).json({ error: "رقم المكتب وكلمة المرور مطلوبان" });
    return;
  }

  const [office] = await db.select().from(officesTable).where(eq(officesTable.id, id.trim())).limit(1);
  if (!office || !office.password) {
    res.status(401).json({ error: "رقم المكتب أو كلمة المرور غير صحيحة" });
    return;
  }
  if (office.status !== "active") {
    res.status(403).json({ error: "الحساب موقوف، يرجى التواصل مع الإدارة" });
    return;
  }

  const valid = await bcrypt.compare(password, office.password);
  if (!valid) {
    res.status(401).json({ error: "رقم المكتب أو كلمة المرور غير صحيحة" });
    return;
  }

  const token = await signToken({ userId: office.id, name: office.name, role: "office" });
  res.json({
    token,
    id: office.id,
    name: office.name,
    role: "office",
    mustChangePassword: office.mustChangePassword,
  });
});

router.post("/change-password", authMiddleware, requireRole("office"), async (req, res) => {
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }
  const hashed = await bcrypt.hash(newPassword, 10);
  await db
    .update(officesTable)
    .set({ password: hashed, mustChangePassword: false })
    .where(eq(officesTable.id, req.user!.userId));
  res.json({ ok: true });
});

export default router;
