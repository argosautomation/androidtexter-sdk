// Android Texter MCP server (stdio), the public build.
//
// Lets an AI client send and read texts through the Android phones paired
// to an Android Texter account, with that account's API key (ATX_API_KEY).
// Built by esbuild into build/index.js, which is both the npm package's bin
// and the dashboard download (npm run build:download). The owner's admin
// tools live in a separate build; see server.ts.

import { startServer } from "./server.js";
import { customerTools } from "./customer.js";

startServer(customerTools);
