import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/library", destination: "/my-content", permanent: true },
      { source: "/library/:path*", destination: "/my-content/:path*", permanent: true },
    ];
  },
  serverExternalPackages: [
    "postgres",
    "bcryptjs",
    "yazl",
    "google-auth-library",
    "@vercel/oidc",
    "@modelcontextprotocol/sdk",
  ],
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
