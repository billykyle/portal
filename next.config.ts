import type { NextConfig } from "next";
import { CLIENT_HOME } from "./src/lib/routes";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/library", destination: "/my-content", permanent: true },
      { source: "/library/:path*", destination: "/my-content/:path*", permanent: true },
      { source: "/hub", destination: CLIENT_HOME, permanent: true },
      { source: "/hub/:path*", destination: `${CLIENT_HOME}/:path*`, permanent: true },
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
