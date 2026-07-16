import { Router } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, lawyersTable } from "@workspace/db";
import { signToken, authMiddleware, requireRole } from "../lib/auth";

const router = Router();

router.post("/login", async (req, res) => {
  const { id, password } = req.body as { id?: string; password?: string };
  if (!id?.trim() || !password) {
    res.status(400).json({ error: "رقم المحامي وكلمة المرور مطلوبان" });
    return;
  }

  const [lawyer] = await db.select().from(lawyersTable).where(eq(lawyersTable.id, id.trim())).limit(1);
  if (!lawyer) {
    res.status(401).json({ error: "رقم المحامي أو كلمة المرور غير صحيحة" });
    return;
  }
  if (lawyer.status !== "active") {
    res.status(403).json({ error: "الحساب موقوف، يرجى التواصل مع الإدارة" });
    return;
  }

  const valid = await bcrypt.compare(password, lawyer.password);
  if (!valid) {
    res.status(401).json({ error: "رقم المحامي أو كلمة المرور غير صحيحة" });
    return;
  }

  const token = await signToken({ userId: lawyer.id, name: lawyer.name, role: "lawyer" });
  res.json({
    token,
    id: lawyer.id,
    name: lawyer.name,
    role: "lawyer",
    mustChangePassword: lawyer.mustChangePassword,
  });
});

router.post("/change-password", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }
  const hashed = await bcrypt.hash(newPassword, 10);
  await db
    .update(lawyersTable)
    .set({ password: hashed, mustChangePassword: false })
    .where(eq(lawyersTable.id, req.user!.userId));
  res.json({ ok: true });
});

export default router;
