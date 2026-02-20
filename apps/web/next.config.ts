import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@querybot/engine"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://89.167.41.67:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
