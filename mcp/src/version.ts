// The server version, as one string.
//
// This used to be `import pkg from "../package.json" with { type: "json" }`,
// which esbuild inlines happily but plain Node only accepts from 20.10, and
// which cannot resolve at all once the compiled files are copied somewhere
// else (the Claude plugin bundle in claude-plugin/ is exactly that copy).
// A constant works everywhere. `npm run version:check` fails the build if it
// ever drifts from package.json, and prepublishOnly runs it.
export const VERSION = "1.2.0";
