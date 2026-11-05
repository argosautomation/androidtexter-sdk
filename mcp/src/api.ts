// HTTP client for the Android Texter API, shared by the customer and admin
// tool sets.

export const DEFAULT_API_BASE = "https://androidtexter.com/api";

// ATX_API_BASE is the API root, ending in /api (the same variable and form
// make-app/hub-runs.py uses). Most customer routes live directly under it;
// the original external API lives under /api/v1. Both accept the same
// X-API-Key header.
export function apiRoot(): string {
  const raw = (process.env.ATX_API_BASE || DEFAULT_API_BASE).trim();
  return raw.replace(/\/+$/, "");
}

export type ToolArgs = Record<string, unknown>;

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  run(args: ToolArgs): Promise<ToolResult>;
}

export function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}

export function json(data: unknown): ToolResult {
  return text(JSON.stringify(data, null, 2));
}

function detectClient(): string {
  if (process.env.CURSOR_VERSION || process.env.CURSOR_EXECUTION) return "Cursor";
  if (process.env.CODEIUM_VERSION || process.env.WINDSURF_VERSION) return "Windsurf";
  if (process.env.CLAUDECODE) return "Claude Code";
  if (process.env.VSCODE_PID) return "VS Code";

  // Claude Desktop sets no variable of its own; these are the closest tells.
  if (process.env.npm_config_user_agent?.includes("claude")) return "Claude Desktop";
  if (process.env.COMMAND_MODE === "unix2003" && !process.env.TERM_PROGRAM) return "Claude Desktop";

  return "Unknown Client";
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Calls the API. `path` is relative to the API root, so "/v1/devices" or
 * "/messages/scheduled".
 */
export async function atx(path: string, method = "GET", body?: unknown): Promise<any> {
  const apiKey = process.env.ATX_API_KEY;
  if (!apiKey) {
    throw new ApiError(
      "ATX_API_KEY is not set. Create an API key in the Android Texter dashboard (Settings > API Keys, https://androidtexter.com/dashboard/settings/api-keys) and add it to this MCP server's env as ATX_API_KEY.",
      401,
    );
  }

  const init: RequestInit = {
    method,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-MCP-Client": process.env.ATX_CLIENT_NAME || detectClient(),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let response: Response;
  try {
    response = await fetch(`${apiRoot()}${path}`, init);
  } catch (e: any) {
    const cause = e?.cause?.code || e?.cause?.message || e?.message || String(e);
    throw new ApiError(`Could not reach the Android Texter API at ${apiRoot()} (${cause}).`, 0);
  }
  // A proxy or gateway error page is HTML, not JSON. Read the text first so
  // the caller gets the status instead of a JSON parse error.
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = null;
  }

  if (!response.ok) {
    const reason =
      (data && typeof data.error === "string" && data.error) ||
      `${response.status} ${response.statusText}`.trim();
    if (response.status === 401) {
      throw new ApiError(`${reason}. Check that ATX_API_KEY is a current key from the dashboard API Keys page.`, 401);
    }
    throw new ApiError(`Android Texter API error: ${reason}`, response.status);
  }
  if (data === null) {
    throw new ApiError(`Android Texter API returned a response that is not JSON (HTTP ${response.status}).`, response.status);
  }
  return data;
}

export function str(args: ToolArgs, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

export function requireStr(args: ToolArgs, key: string): string {
  const v = str(args, key);
  if (v === undefined) throw new Error(`${key} is required`);
  return v;
}

export function int(args: ToolArgs, key: string, min: number, max: number): number | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number`);
  return Math.min(max, Math.max(min, n));
}

export function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
