// The Android Texter MCP server itself: a stdio MCP server over a list of
// tools. The two entry points decide which tools:
//
//   index.ts  the public package and dashboard download: customer tools only.
//   the owner's private build, outside this folder, adds A/B test and
//             content tools that call admin-only routes. It is never
//             published.
//
// Separate entry points rather than a runtime flag, so the public bundle
// does not even contain the admin tools' code or their descriptions.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import pkg from "../package.json" with { type: "json" };
import { apiRoot, type ToolDef } from "./api.js";

/** Starts the stdio server with the given tools. `label` goes in the startup log. */
export function startServer(tools: ToolDef[], label = "") {
  const byName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "android-texter-mcp", title: "Android Texter", version: pkg.version },
    {
      capabilities: { tools: {} },
      instructions:
        "Android Texter sends real text messages from the user's own Android phone and number. Read tools (list_devices, list_conversations, get_conversation, search_messages, list_contacts) are safe to call freely. Before send_message or send_broadcast, confirm the recipients and the exact wording with the user.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ run: _run, ...def }) => def),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Error: Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      return await tool.run((request.params.arguments ?? {}) as Record<string, unknown>);
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error?.message ?? String(error)}` }],
        isError: true,
      };
    }
  });

  async function run() {
    if (process.argv.includes("--version") || process.argv.includes("-v")) {
      console.log(pkg.version);
      return;
    }
    // No key is not fatal: the client can still list the tools (directories
    // inspect servers this way), and every tool call says how to fix it.
    if (!process.env.ATX_API_KEY) {
      console.error("ATX_API_KEY is not set. Tools will return an error until it is. Get a key at https://androidtexter.com/dashboard/settings/api-keys");
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(
      `Android Texter MCP server ${pkg.version} on stdio, API ${apiRoot()}, ${tools.length} tools${label}`,
    );
  }

  run().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
