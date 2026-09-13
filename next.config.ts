import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "bcryptjs"],
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
