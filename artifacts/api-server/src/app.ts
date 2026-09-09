import express, { type Express } from "express";
import cors from "cors";
// pino-http is a CJS package whose .d.ts is written ESM-style; the named
// import typechecks under every module mode (bundler/node16/nodenext/commonjs)
// and resolves at runtime (module.exports.pinoHttp exists).
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
