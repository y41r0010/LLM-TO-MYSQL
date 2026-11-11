import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build in .next/standalone (server + only the node_modules it uses),
  // so the server needs Node but not `npm install` or internet access. See deploy/README.md.
  output: "standalone",

  // ssh2 ships optional native bindings; load it from node_modules at runtime
  // instead of bundling it.
  serverExternalPackages: ["ssh2"],

  // Don't announce the framework in every response.
  poweredByHeader: false,

  // The panel uses no next/image, so the image optimizer (sharp, a native binary
  // built for the OS that compiles) stays out of the package for the Linux server.
  images: { unoptimized: true },
  outputFileTracingExcludes: { "*": ["node_modules/@img/**", "node_modules/sharp/**"] },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Data answers must never be cached by the browser or a proxy.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
