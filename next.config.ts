import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // dockerode / systeminformation are optional native-ish deps only used on
  // the server. Keep them external so they aren't bundled into route chunks.
  serverExternalPackages: ["dockerode", "systeminformation"],
};

export default nextConfig;
