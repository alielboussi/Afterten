import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: ["@supabase/supabase-js", "@supabase/ssr"],
  experimental: {
    serverActions: {
      // Product image uploads (Supabase bucket max 5 MB); default Next limit is 1 MB.
      bodySizeLimit: "6mb",
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Windows: filesystem + memory webpack caches often desync CSS from JS after HMR.
      // Slower rebuilds, but styles stay attached until you change a file again.
      config.cache = false;
      config.watchOptions = {
        ...config.watchOptions,
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**"],
      };
      if (process.env.WATCHPACK_POLLING) {
        config.watchOptions.poll = Number(process.env.WATCHPACK_POLLING) || 1000;
      }
    }
    return config;
  },
};

export default nextConfig;
