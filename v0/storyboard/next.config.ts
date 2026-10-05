// How Next builds the storyboard. The one unusual part: the settings page
// imports the Decider's lookup from ../pipeline/settings/, outside this folder,
// so Next is told that the whole v0 folder is the project's root.

import path from "node:path";
import type { NextConfig } from "next";

// The v0 folder: the workspace root, holding both the pipeline and the storyboard.
const v0Folder = path.resolve(process.cwd(), "..");

const nextConfig: NextConfig = {
  turbopack: { root: v0Folder },
  outputFileTracingRoot: v0Folder,
  serverExternalPackages: ["pg"],
};

export default nextConfig;
