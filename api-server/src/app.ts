import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

  app.get(/^\/(?!api).*/, (req, res, next) => {
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

export default app;
