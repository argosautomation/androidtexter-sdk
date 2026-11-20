// Fails if src/version.ts and package.json disagree.
//
// src/version.ts is what the server reports in serverInfo, in the
// X-MCP-Client header and in a report_issue payload; package.json is what
// npm publishes. They used to be one value (the server imported
// package.json), until the Claude plugin bundle needed the compiled files to
// run outside this folder. prepublishOnly runs this, and so does
// scripts/build-claude-plugin.sh.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const src = readFileSync(new URL("./src/version.ts", import.meta.url), "utf8");
const found = /^export const VERSION = "(.*)";$/m.exec(src);

if (!found) {
  console.error("src/version.ts has no `export const VERSION = \"...\";` line");
  process.exit(1);
}
if (found[1] !== pkg.version) {
  console.error(`version drift: src/version.ts says ${found[1]}, package.json says ${pkg.version}`);
  process.exit(1);
}
console.log(`version ${pkg.version} ok`);
