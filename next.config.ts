import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Stop MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Force HTTPS for 1 year
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Referrer policy
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Permissions policy — disable unused browser features
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Content Security Policy
  // Adjust connect-src if you add more external API origins
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval required by Next.js dev + React
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // agent-prod.studio.lyzr.ai is needed for the Lyzr agent event WebSocket (monitoring only).
      // All data API calls (Hostaway, Ticketmaster, Lyzr chat) go through the FastAPI backend.
      "connect-src 'self' wss://metrics.studio.lyzr.ai https://agent-prod.studio.lyzr.ai http://localhost:8000 http://localhost:3000",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // ── Security headers on all routes ──────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // ── Image optimisation ───────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }, // tighten to specific hostnames before launch
    ],
    formats: ["image/avif", "image/webp"],
  },

  // ── Production hardening ─────────────────────────────────────────────────────
  compress: true,

  // Strip React source maps in production to avoid leaking component names
  productionBrowserSourceMaps: false,

  // Fail build on TypeScript errors — never ship broken code
  typescript: { ignoreBuildErrors: false },

  // Server-side packages that must not be bundled into client chunks
  // (mongoose removed - no longer used in frontend)
  serverExternalPackages: [],

  // Anchor webpack's file tracing to this directory, preventing it from
  // crawling to /Original_priceos and failing to resolve tailwindcss
  outputFileTracingRoot: __dirname,

  // ── API Rewrites ────────────────────────────────────────────────────────────
  // This allows the frontend to call the backend directly via /api/* without
  // needing redundant proxy files in src/app/api/*.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },

  // ── Docker optimization ────────────────────────────────────────────────────
  output: 'standalone',
};

export default nextConfig;
