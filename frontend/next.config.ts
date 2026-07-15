import type { NextConfig } from "next";

const localBackendOrigin = "http://127.0.0.1:4000";
const productionBackendOrigin = "https://la-forza-backend.vercel.app";

function resolveBackendOrigin(): string {
  const configuredOrigin = process.env.BACKEND_API_ORIGIN?.replace(/\/$/, "");

  if (process.env.VERCEL !== "1") {
    return configuredOrigin ?? localBackendOrigin;
  }

  if (!configuredOrigin) {
    return productionBackendOrigin;
  }

  try {
    const hostname = new URL(configuredOrigin).hostname.toLowerCase();
    const isPrivateHostname =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]";
    const isEphemeralBackendDeployment =
      hostname.startsWith("la-forza-backend-") &&
      hostname.endsWith(".vercel.app");

    if (isPrivateHostname || isEphemeralBackendDeployment) {
      return productionBackendOrigin;
    }

    return configuredOrigin;
  } catch {
    return productionBackendOrigin;
  }
}

const backendOrigin = resolveBackendOrigin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
