import { createHmac, randomUUID } from "crypto";
import { promises as fs } from "fs";
import { createReadStream } from "fs";
import path from "path";

// Local filesystem storage driver — a self-hosted alternative to the Replit
// object storage sidecar (which only exists on Replit). When PRIVATE_OBJECT_DIR
// is not configured we fall back to storing uploads on disk so images and
// videos work on any server (VPS, local machine, etc.).

export function isLocalStorage(): boolean {
  // Use local disk unless the Replit object-storage env is present.
  if (process.env.STORAGE_DRIVER === "local") return true;
  if (process.env.STORAGE_DRIVER === "replit") return false;
  return !process.env.PRIVATE_OBJECT_DIR;
}

export function getLocalStorageDir(): string {
  return process.env.LOCAL_STORAGE_DIR || path.resolve(process.cwd(), "uploads");
}

const SECRET = process.env.SESSION_SECRET || "dev-secret";

// Stateless one-time-ish upload token: HMAC of the object id. The client PUTs
// the file to a URL carrying this token so anonymous PUTs cannot target
// arbitrary paths.
export function signUploadToken(objectId: string): string {
  return createHmac("sha256", SECRET).update(`upload:${objectId}`).digest("hex").slice(0, 32);
}

export function verifyUploadToken(objectId: string, token: string): boolean {
  const expected = signUploadToken(objectId);
  return token.length === expected.length && token === expected;
}

function safeObjectPath(objectId: string): string | null {
  // objectId is the part after /objects/ e.g. "uploads/<uuid>". Reject traversal.
  if (!objectId || objectId.includes("..") || path.isAbsolute(objectId)) return null;
  return path.join(getLocalStorageDir(), objectId);
}

export function newObjectId(): string {
  return `uploads/${randomUUID()}`;
}

export async function saveLocalObject(
  objectId: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const filePath = safeObjectPath(objectId);
  if (!filePath) throw new Error("Invalid object path");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  await fs.writeFile(`${filePath}.type`, contentType || "application/octet-stream");
}

export interface LocalObject {
  stream: NodeJS.ReadableStream;
  contentType: string;
  size: number;
}

export async function readLocalObject(objectId: string): Promise<LocalObject | null> {
  const filePath = safeObjectPath(objectId);
  if (!filePath) return null;
  try {
    const stat = await fs.stat(filePath);
    let contentType = "application/octet-stream";
    try {
      contentType = (await fs.readFile(`${filePath}.type`, "utf8")).trim() || contentType;
    } catch {
      /* no sidecar type file */
    }
    return { stream: createReadStream(filePath), contentType, size: stat.size };
  } catch {
    return null;
  }
}
