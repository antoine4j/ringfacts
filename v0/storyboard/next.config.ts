// How Next builds the storyboard. Two unusual parts. The settings page
// imports the Decider's lookup from ../pipeline/settings/, outside this folder,
// so Next is told that the whole v0 folder is the project's root. And the
// scores page reads the golden replay's result files from disk at request
// time, so they are named for the server bundle: docs/decisions.md#scores-page.

import path from "node:path";
import type { NextConfig } from "next";

// The v0 folder: the workspace root, holding both the pipeline and the storyboard.
const v0Folder = path.resolve(process.cwd(), "..");

const nextConfig: NextConfig = {
  turbopack: { root: v0Folder },
  outputFileTracingRoot: v0Folder,
  outputFileTracingIncludes: { "/scores": ["../pipeline/measure/replay-results/*.json"] },
  serverExternalPackages: ["pg"],
};

export default nextConfig;
