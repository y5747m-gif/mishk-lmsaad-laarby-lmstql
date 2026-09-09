import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";

// Vercel (أي منصة Serverless): الحزمة تُحمَّل كـ request handler ولا نفتح
// خادمًا دائمًا؛ export التوقيع القياسي (req, res) => void الذي يتوقعه
// @vercel/node، وتُمرَّر الطلبات إلى تطبيق Express نفسه.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  app(req, res);
}

export { app };

// التطوير محليًا (Replit / `pnpm start`): تشغيل كخادم دائم على المنفذ المطلوب.
const isServerless = process.env["VERCEL"] !== undefined;

if (!isServerless) {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}
