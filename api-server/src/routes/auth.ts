import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { signToken, authMiddleware } from "../lib/auth";
import { randomUUID } from "crypto";

const router = Router();

router.post("/register", async (req, res) => {
  const { name, phone, password } = req.body;

  if (!name?.trim() || !phone?.trim() || !password) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "كلمة المرور قصيرة (6 أحرف على الأقل)" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "رقم الهاتف مسجل مسبقاً" });
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  const id = randomUUID();
  const [user] = await db.insert(usersTable).values({
    id, phone, password: hashed, name: name.trim(), role: "user",
  }).returning();

  const token = await signToken({ userId: user.id, phone: user.phone, name: user.name, role: user.role });
  res.status(201).json({ token, id: user.id, phone: user.phone, name: user.name, role: user.role });
});

router.post("/login", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    res.status(400).json({ error: "رقم الهاتف وكلمة المرور مطلوبان" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) {
    res.status(401).json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" });
    return;
  }

  const token = await signToken({ userId: user.id, phone: user.phone, name: user.name, role: user.role });
  res.json({ token, id: user.id, phone: user.phone, name: user.name, role: user.role });
});

router.get("/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

export default router;
