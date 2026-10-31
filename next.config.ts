import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ให้มือถือในวง Wi-Fi เดียวกันเปิด dev server ได้ (เช่น http://192.168.1.128:3000) — มีผลเฉพาะ npm run dev
  allowedDevOrigins: ['192.168.*.*'],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
