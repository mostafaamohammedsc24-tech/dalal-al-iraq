import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  isLocalStorage,
  newObjectId,
  signUploadToken,
  verifyUploadToken,
  saveLocalObject,
  readLocalObject,
} from "../lib/localStorage";
import { authMiddleware } from "../lib/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

router.post("/uploads/request-url", authMiddleware, async (req: Request, res: Response) => {
  const size = Number(req.body?.size);
  if (Number.isFinite(size) && size > MAX_UPLOAD_BYTES) {
    res.status(400).json({ error: "الملف كبير جداً (الحد 80 ميغابايت)" });
    return;
  }

  // Local filesystem driver (self-hosted / off-Replit): hand back an upload URL
  // that points at our own PUT endpoint carrying a signed token.
  if (isLocalStorage()) {
    const objectId = newObjectId();
    const token = signUploadToken(objectId);
    const base = `${req.protocol}://${req.get("host")}`;
    const uploadURL = `${base}/api/storage/local-upload/${objectId}?token=${token}`;
    res.json({ uploadURL, objectPath: `/objects/${objectId}` });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "تعذر تجهيز الرفع" });
  }
});

// Local driver: receive the raw file bytes via PUT and persist them to disk.
router.put(
  "/local-upload/*path",
  express.raw({ type: "*/*", limit: MAX_UPLOAD_BYTES }),
  async (req: Request, res: Response) => {
    const raw = (req.params as Record<string, string | string[]>).path;
    const objectId = Array.isArray(raw) ? raw.join("/") : raw;
    const token = String(req.query.token || "");
    if (!verifyUploadToken(objectId, token)) {
      res.status(403).json({ error: "رمز الرفع غير صالح" });
      return;
    }
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "لا يوجد محتوى للرفع" });
      return;
    }
    if (body.length > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: "الملف كبير جداً (الحد 80 ميغابايت)" });
      return;
    }
    try {
      const contentType = req.get("content-type") || "application/octet-stream";
      await saveLocalObject(objectId, body, contentType);
      res.status(200).json({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, "Error saving local upload");
      res.status(500).json({ error: "تعذر حفظ الملف" });
    }
  },
);

router.get("/objects/*path", async (req: Request, res: Response) => {
  const raw = req.params.path;
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

  if (isLocalStorage()) {
    try {
      const obj = await readLocalObject(wildcardPath);
      if (!obj) {
        res.status(404).json({ error: "الملف غير موجود" });
        return;
      }
      res.setHeader("Content-Type", obj.contentType);
      res.setHeader("Content-Length", String(obj.size));
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Accept-Ranges", "bytes");
      obj.stream.pipe(res);
    } catch (error) {
      req.log.error({ err: error }, "Error serving local object");
      res.status(500).json({ error: "تعذر عرض الملف" });
    }
    return;
  }

  try {
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile, 86400);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "الملف غير موجود" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "تعذر عرض الملف" });
  }
});

export default router;
