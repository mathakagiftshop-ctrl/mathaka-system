import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Logos and payment slips are uploaded through server actions (max 4 MB).
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
