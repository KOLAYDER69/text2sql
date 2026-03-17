import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@querybot/engine"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://85.198.69.198:3333/api/:path*",
      },
    ];
  },
};

export default nextConfig;
