import type { IncomingMessage, ServerResponse } from "node:http";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const appPromise = buildApp(loadConfig()).then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const app = await appPromise;
  await new Promise<void>((resolve, reject) => {
    response.once("finish", resolve);
    response.once("close", resolve);
    response.once("error", reject);
    app.server.emit("request", request, response);
  });
}
