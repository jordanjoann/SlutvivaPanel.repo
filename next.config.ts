import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Turbopack doesn't pick up an
  // unrelated lockfile higher up the tree (e.g. C:\Users\jorda).
  turbopack: {
    root: __dirname,
  },
  // dockerode / systeminformation are optional native-ish deps only used on
  // the server. Keep them external so they aren't bundled into route chunks.
  serverExternalPackages: ["dockerode", "systeminformation"],
};

export default nextConfig;
