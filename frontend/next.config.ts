import type { NextConfig } from "next";

const backendOrigin = (
  process.env.BACKEND_API_ORIGIN ?? "http://127.0.0.1:4000"
).replace(/\/$/, "");

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
