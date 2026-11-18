import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/trainings/map", destination: "/competitions/map", permanent: true }];
  },
  allowedDevOrigins: [
    "192.168.25.36",
  ],
};

export default nextConfig;