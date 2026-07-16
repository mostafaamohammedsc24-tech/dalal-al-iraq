import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
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
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "تعذر تجهيز الرفع" });
  }
});

router.get("/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
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
