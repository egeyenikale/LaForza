import type { IncomingMessage, ServerResponse } from "node:http";

type InjectMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "PATCH"
  | "POST"
  | "PUT"
  | "OPTIONS";

function injectMethod(method: string | undefined): InjectMethod {
  const normalized = (method ?? "GET").toUpperCase();
  if (
    normalized === "DELETE" ||
    normalized === "GET" ||
    normalized === "HEAD" ||
    normalized === "PATCH" ||
    normalized === "POST" ||
    normalized === "PUT" ||
    normalized === "OPTIONS"
  ) {
    return normalized;
  }
  return "GET";
}

let appPromise: Promise<Awaited<ReturnType<typeof importApp>>> | undefined;

async function importApp() {
  const [{ buildApp }, { loadConfig }] = await Promise.all([
    import("../src/app.js"),
    import("../src/config.js"),
  ]);
  const app = await buildApp(loadConfig());
  await app.ready();
  return app;
}

function createApp() {
  return importApp();
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
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const payload = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const result = await app.inject({
      method: injectMethod(request.method),
      url: request.url ?? "/",
      headers: request.headers,
      ...(payload ? { payload } : {}),
    });
    response.statusCode = result.statusCode;
    for (const [name, value] of Object.entries(result.headers)) {
      if (value !== undefined) response.setHeader(name, value);
    }
    response.end(result.rawPayload);
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
