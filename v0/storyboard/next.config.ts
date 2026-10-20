// How Next builds the storyboard. Two unusual parts. The settings page
// imports the Decider's lookup from ../pipeline/settings/, and the reading page
// the fighters' name stems from the repository's watchlist.js, both outside
// this folder, so Next is told that the whole repository is the project's
// root. And the scores page reads the golden replay's result files from disk
// at request time, so they are named for the server bundle:
// docs/decisions.md#scores-page.

import path from "node:path";
import type { NextConfig } from "next";

// The repository: the workspace root, holding the watchlist, the pipeline and the storyboard.
const repository = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  turbopack: { root: repository },
  outputFileTracingRoot: repository,
  outputFileTracingIncludes: { "/scores": ["../pipeline/measure/replay-results/*.json"] },
  serverExternalPackages: ["pg"],
};

export default nextConfig;
