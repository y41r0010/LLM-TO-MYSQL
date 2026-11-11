import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 ships optional native bindings; load it from node_modules at runtime
  // instead of bundling it.
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;
