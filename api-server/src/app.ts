import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db, listingsTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(__dirname, "../../dalal-app/dist/public");
  app.use(express.static(clientDist));

  const indexHtml = () => fs.readFileSync(path.join(clientDist, "index.html"), "utf8");
  const LISTING_ID_RE = /^\/listings\/([0-9a-fA-F-]{36})(?:\/|$)/;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const absMedia = (origin: string, p?: string | null): string => {
    if (!p) return `${origin}/logo.png`;
    if (/^https?:\/\//.test(p)) return p;
    if (p.startsWith("/objects/")) return `${origin}/api/storage${p}`;
    return `${origin}${p.startsWith("/") ? "" : "/"}${p}`;
  };

  // Server-render Open Graph/Twitter tags for listing pages so shared links show
  // the post's title and photo in previews (crawlers don't run the SPA's JS).
  app.get(/^\/listings\/.+/, async (req, res, next) => {
    const m = req.path.match(LISTING_ID_RE);
    if (!m) return next();
    try {
      const [l] = await db
        .select({
          title: listingsTable.title,
          description: listingsTable.description,
          images: listingsTable.images,
          city: listingsTable.city,
          area: listingsTable.area,
          price: listingsTable.price,
        })
        .from(listingsTable)
        .where(eq(listingsTable.id, m[1]!))
        .limit(1);
      if (!l) return next();

      const origin = (
        process.env.PUBLIC_SITE_URL || `${req.protocol}://${req.get("host")}`
      ).replace(/\/$/, "");
      const title = `${l.title} | شبكة دلال العراق`;
      const place = [l.city, l.area].filter(Boolean).join(" - ");
      const desc = (l.description || place || "إعلان على شبكة دلال العراق")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
      const image = absMedia(origin, l.images?.[0]);
      const url = `${origin}${req.originalUrl}`;

      const tags = `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="شبكة دلال العراق" />
    <meta property="og:title" content="${esc(l.title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(l.title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${esc(image)}" />
  </head>`;

      const html = indexHtml()
        .replace(/<title>[\s\S]*?<\/title>/, "")
        .replace(/\s*<meta\s+name="description"[^>]*>/gi, "")
        .replace(/\s*<meta\s+property="og:[^"]*"[^>]*>/gi, "")
        .replace(/\s*<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
        .replace("</head>", tags);
      res.type("html").send(html);
    } catch (err) {
      req.log?.error({ err }, "Failed to render listing OG tags");
      next();
    }
  });

  app.get(/^\/(?!api).*/, (req, res, next) => {
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

export default app;
