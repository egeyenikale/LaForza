import type { NextConfig } from "next";

const localBackendOrigin = "http://127.0.0.1:4000";
const productionBackendOrigin = "https://la-forza-backend.vercel.app";

function resolveBackendOrigin(): string {
  const configuredOrigin = process.env.BACKEND_API_ORIGIN?.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    return productionBackendOrigin;
  }

  return configuredOrigin ?? localBackendOrigin;
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
