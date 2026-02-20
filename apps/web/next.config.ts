import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@querybot/engine"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
