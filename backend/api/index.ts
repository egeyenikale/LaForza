import type { IncomingMessage, ServerResponse } from "node:http";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let appPromise: ReturnType<typeof createApp> | undefined;

function createApp() {
  return Promise.resolve().then(async () => {
    const app = await buildApp(loadConfig());
    await app.ready();
    return app;
  });
}

function getApp() {
  appPromise ??= createApp();
  return appPromise;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const app = await getApp();
    await new Promise<void>((resolve, reject) => {
      response.once("finish", resolve);
      response.once("close", resolve);
      response.once("error", reject);
      app.server.emit("request", request, response);
    });
  } catch (error) {
    appPromise = undefined;
    const message =
      error instanceof Error ? error.message : "Unknown backend startup error";
    console.error("La Forza backend startup failed", error);
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined);
      return;
    }
    response.statusCode = 503;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({
        status: "error",
        service: "laforza-backend",
        error: message,
      }),
    );
  }
}
