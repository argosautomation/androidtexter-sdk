// A dependency-free MCP stdio server.
//
// Why a second transport when server.ts already works: the npm package is an
// esbuild bundle (738 KB, with the SDK inlined), and Claude's plugin directory
// holds a submission for a reviewer when the code it would run is packed,
// minified or over 256 KB, and blocks outright on an unpinned `npx`
// launcher. The plugin bundle therefore ships the compiled sources instead,
// started as `node ${CLAUDE_PLUGIN_ROOT}/mcp/src/plugin.js`, and those
// sources cannot import the SDK without dragging node_modules along.
//
// So this file speaks the wire protocol directly. It is small because stdio
// MCP is small: newline-delimited JSON-RPC 2.0 on stdin and stdout, four
// methods, and nothing but JSON ever written to stdout.
//
// The tool definitions, the API client and the instructions string are the
// same modules server.ts uses, so the two servers cannot answer differently.
// build-claude-plugin.sh proves that each build by driving both and comparing
// initialize and tools/list byte for byte.

import { apiRoot, type ToolDef } from "./api.js";
import { INSTRUCTIONS } from "./instructions.js";
import { VERSION } from "./version.js";

/** Protocol revisions this server will speak, newest first. */
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const LATEST_PROTOCOL = SUPPORTED_PROTOCOLS[0];

interface Request {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const PARSE_ERROR = -32700;

/**
 * Serves `tools` over stdio until stdin closes.
 *
 * `name` and `title` are the server identity sent at initialize; they match
 * server.ts so a client sees the same server either way.
 */
export function startStdio(tools: ToolDef[], name = "android-texter-mcp", title = "Android Texter") {
  const byName = new Map(tools.map((t) => [t.name, t]));

  function send(message: unknown) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }

  function reply(id: string | number, result: unknown) {
    send({ jsonrpc: "2.0", id, result });
  }

  function fail(id: string | number, code: number, message: string) {
    send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  /** The tool list, minus each tool's `run`, exactly as server.ts sends it. */
  function toolList() {
    return tools.map(({ run: _run, ...def }) => def);
  }

  async function callTool(params: Record<string, unknown>) {
    const toolName = typeof params.name === "string" ? params.name : "";
    const tool = byName.get(toolName);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Error: Unknown tool: ${toolName}` }],
        isError: true,
      };
    }
    try {
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      return await tool.run(args);
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error?.message ?? String(error)}` }],
        isError: true,
      };
    }
  }

  async function handle(message: Request) {
    const { id, method } = message;
    // A notification has no id and takes no response, not even an error.
    if (id === undefined || id === null) return;
    if (typeof method !== "string") {
      fail(id, INVALID_REQUEST, "A request needs a string method");
      return;
    }
    const params = (message.params ?? {}) as Record<string, unknown>;

    switch (method) {
      case "initialize": {
        const asked = params.protocolVersion;
        const protocolVersion =
          typeof asked === "string" && (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked)
            ? asked
            : LATEST_PROTOCOL;
        reply(id, {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name, title, version: VERSION },
          instructions: INSTRUCTIONS,
        });
        return;
      }
      case "ping":
        reply(id, {});
        return;
      case "tools/list":
        reply(id, { tools: toolList() });
        return;
      case "tools/call": {
        if (typeof params.name !== "string") {
          fail(id, INVALID_PARAMS, "tools/call needs a tool name");
          return;
        }
        reply(id, await callTool(params));
        return;
      }
      default:
        // Clients probe for resources and prompts; this server has neither,
        // and method-not-found is the answer the spec asks for.
        fail(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }

  function dispatch(line: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Parse error" } });
      return;
    }
    // Only the 2024-11-05 and 2025-03-26 revisions allow a batch. Handling an
    // array costs two lines and an older client is cheap to keep working.
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const message of messages) {
      if (message && typeof message === "object") {
        void handle(message as Request).catch((error) => {
          console.error("Handler error:", error);
        });
      }
    }
  }

  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(VERSION);
    return;
  }
  // No key is not fatal: the client can still list the tools (directories
  // inspect servers this way), and every tool call says how to fix it.
  if (!process.env.ATX_API_KEY) {
    console.error(
      "ATX_API_KEY is not set. Tools will return an error until it is. Get a key at https://androidtexter.com/dashboard/settings/api-keys",
    );
  }

  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let cut = buffer.indexOf("\n");
    while (cut !== -1) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (line) dispatch(line);
      cut = buffer.indexOf("\n");
    }
  });
  process.stdin.on("end", () => {
    const line = buffer.trim();
    if (line) dispatch(line);
  });
  process.stdin.resume();

  console.error(
    `Android Texter MCP server ${VERSION} on stdio, API ${apiRoot()}, ${tools.length} tools (plugin build)`,
  );
}
