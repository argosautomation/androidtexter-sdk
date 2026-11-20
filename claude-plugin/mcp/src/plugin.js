// Android Texter MCP server, the Claude plugin build.
//
// Same 14 customer tools as the npm package (index.ts), served by the
// dependency-free transport in stdio.ts so the plugin folder can ship
// readable sources with no node_modules and no launcher. The plugin's
// .mcp.json starts this file with `node`.
//
// Built by scripts/build-claude-plugin.sh into claude-plugin/mcp/src/.
import { startStdio } from "./stdio.js";
import { customerTools } from "./customer.js";
startStdio(customerTools);
