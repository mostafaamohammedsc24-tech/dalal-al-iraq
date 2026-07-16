import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Request, Response, NextFunction } from "express";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}
const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);
const ISSUER = "dalal-iraq";

// role: "user" | "admin" | "office" | "lawyer"
// For office/lawyer accounts, userId holds the sequential ID (e.g. OF-001)
// and phone is optional since those accounts log in with their ID, not a phone.
export interface AuthPayload extends JWTPayload {
  userId: string;
  phone?: string;
  name: string;
  role: string;
}

export async function signToken(payload: Omit<AuthPayload, keyof JWTPayload>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
  return payload as AuthPayload;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  try {
    req.user = await verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: "الجلسة منتهية، يرجى تسجيل الدخول مجدداً" });
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = await verifyToken(header.slice(7));
    } catch {
      // ignore invalid/expired token — treat as anonymous
    }
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "غير مصرح" });
      return;
    }
    next();
  };
}

export function generateRandomPassword(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
