import { readFileSync } from "node:fs";

import { build } from "esbuild";

// Read the version rather than repeating it. The banner was hardcoded and had
// already drifted — the bundle still announced v0.0.1-beta.1 after 0.0.1 was
// released, because a string inside a build script does not look like a version
// field when you go around bumping them.
const { version } = JSON.parse(readFileSync("package.json", "utf8"));

await build({
  entryPoints: ["src/somtoday-card.js"],
  outfile: "somtoday-card.js",
  bundle: true,
  format: "iife",
  target: ["es2022"],
  legalComments: "none",
  banner: { js: `/* Somtoday Card v${version} */` },
});
