import type { NextConfig } from "next";
import path from "node:path";

/** PDFKit on Vercel needs AFM data + standard-fonts .cjs modules in the serverless bundle. */
const PDFKIT_OUTPUT_TRACE = [
  "./node_modules/pdfkit/js/data/**/*",
  "./node_modules/pdfkit/js/standard-fonts/**/*",
  "./lib/assets/afterten-logo.png",
];

const PDF_API_ROUTES = [
  "/api/outlet-app/ensure-order-pdf",
  "/api/outlet-app/ensure-approved-order-pdf",
  "/api/outlet-app/ensure-driver-handoff-pdf",
  "/api/webhooks/outlet-order-placed",
  "/api/webhooks/supervisor-order-accepted",
  "/api/webhooks/driver-handoff-pdf",
  "/api/portal/orders/pdf",
] as const;

const outputFileTracingIncludes = Object.fromEntries(
  PDF_API_ROUTES.map((route) => [route, PDFKIT_OUTPUT_TRACE]),
) as Record<string, string[]>;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/ssr",
    "pdfkit",
    "fontkit",
    "sharp",
  ],
  outputFileTracingIncludes,
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
