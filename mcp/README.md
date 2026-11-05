# Android Texter MCP Server

Let Claude, Cursor, Windsurf, and any other MCP client send and read text messages through [Android Texter](https://androidtexter.com).

Android Texter turns your own Android phone into an SMS and MMS gateway. Texts go out from the phone's real number over its carrier plan, and replies come back into your account. This server connects your AI assistant to that account, so you can say "text Sam that the meeting moved to 3pm" or "who replied to yesterday's broadcast?" and it happens on your phone.

- Sends from your own number, not a shared short code or a rented line
- Reads conversations, searches message history, and manages contacts
- Schedules texts for later and cancels them
- Runs locally over stdio; your API key stays on your computer

## Before you start

1. An Android Texter account with the app installed on an Android phone and paired to it. Sign up at [androidtexter.com](https://androidtexter.com).
2. An API key. In the dashboard, open **Settings > API Keys** ([androidtexter.com/dashboard/settings/api-keys](https://androidtexter.com/dashboard/settings/api-keys)) and create one. Keys start with `atx_`.
3. Node.js 18 or newer (`node --version`).

## Install

The server runs with `npx`, so there is nothing to install by hand. Pick your client below and replace `atx_YOUR_API_KEY` with your key.

### Claude Desktop

Open **Settings > Developer > Edit Config** (or edit `claude_desktop_config.json` directly: `~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows) and add:

```json
{
  "mcpServers": {
    "android-texter": {
      "command": "npx",
      "args": ["-y", "android-texter-mcp"],
      "env": {
        "ATX_API_KEY": "atx_YOUR_API_KEY"
      }
    }
  }
}
```

Restart Claude Desktop. The Android Texter tools appear under the tools menu in a new chat.

### Claude Code

```bash
claude mcp add android-texter --scope user --env ATX_API_KEY=atx_YOUR_API_KEY -- npx -y android-texter-mcp
```

Run `claude mcp list` to check that it connected.

### Cursor

Add to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "android-texter": {
      "command": "npx",
      "args": ["-y", "android-texter-mcp"],
      "env": {
        "ATX_API_KEY": "atx_YOUR_API_KEY"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json` (or **Settings > Cascade > MCP Servers > View raw config**):

```json
{
  "mcpServers": {
    "android-texter": {
      "command": "npx",
      "args": ["-y", "android-texter-mcp"],
      "env": {
        "ATX_API_KEY": "atx_YOUR_API_KEY"
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`. VS Code asks for the key once and stores it securely:

```json
{
  "inputs": [
    { "type": "promptString", "id": "atx-api-key", "description": "Android Texter API key", "password": true }
  ],
  "servers": {
    "android-texter": {
      "command": "npx",
      "args": ["-y", "android-texter-mcp"],
      "env": { "ATX_API_KEY": "${input:atx-api-key}" }
    }
  }
}
```

### Any other MCP client

Run `npx -y android-texter-mcp` as a stdio server with `ATX_API_KEY` in its environment.

On Windows, if your client cannot find `npx`, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "android-texter-mcp"]`.

### Without npm

The same server is available as a single file from the dashboard (**Settings > Integrations > Download Script**). Save it anywhere and use `"command": "node"` with `"args": ["/absolute/path/to/android-texter-mcp.js"]` in place of the `npx` lines above.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ATX_API_KEY` | Yes | Your Android Texter API key, from **Settings > API Keys**. |
| `ATX_API_BASE` | No | API root URL. Default `https://androidtexter.com/api`. Only change it for a test backend. |
| `ATX_CLIENT_NAME` | No | Name shown for this connection on the API Keys activity log. Detected automatically for most clients. |

## Tools

| Tool | What it does |
| --- | --- |
| `list_devices` | Your paired phones, with online status, battery, number, and SIMs. |
| `list_conversations` | Recent conversations, filtered by folder: all, inbox (replied), outbox (no reply yet), archived, spam. |
| `get_conversation` | The messages in one conversation, by phone number or thread (groups too). |
| `search_messages` | Search every sent and received text by words, number, or contact name. |
| `send_message` | Send a text or picture message (MMS) now or at a scheduled time, from a chosen phone and SIM. Several numbers make a group text. |
| `send_broadcast` | Send one text to up to 500 numbers, each as its own message, with `{{name}}`-style personalization. |
| `get_message_status` | Whether a sent message is queued, sent, delivered, or failed. |
| `list_scheduled_messages` | Messages waiting to go out later. |
| `cancel_scheduled_message` | Call off a scheduled message before it sends. |
| `list_contacts` | List or search contacts, or everyone with a tag. |
| `list_contact_tags` | Every tag in use on your contacts. |
| `save_contact` | Create a contact or update one by phone number. Fields you leave out are kept; tags are added. |

Sending tools send real texts to real people from your number. Good clients ask before calling them; you can also set them to always ask in your client's tool settings.

## Example prompts

- "Which of my phones are online?"
- "Show my last 10 conversations that got a reply."
- "Read my conversation with +1 555 123 4567 and draft a reply."
- "Text +15551234567: Running 10 minutes late, see you soon."
- "Schedule a text to +15559876543 for tomorrow at 9am Eastern: Good morning!"
- "Find anyone who texted the word interested this week."
- "Add +15551112222 as Dana Lee from Acme with the tag vip."
- "Send everyone tagged vip: Hi {{first_name|there}}, early access opens today."

## Troubleshooting

- **"ATX_API_KEY is not set" or "Invalid API key"**: check the key in your client config and that it has not been deleted on the API Keys page.
- **"No devices registered"**: pair a phone in the Android Texter app first.
- **Messages stay queued**: the phone is offline or the app is not running. Open the app on the phone. A message that cannot go out within 24 hours is marked failed.
- **"Daily message limit reached"**: the free plan has a daily cap. Upgrade in the dashboard under Billing.

Help: [support@androidtexter.com](mailto:support@androidtexter.com). API reference: [androidtexter.com/docs](https://androidtexter.com/docs).

## Development

```bash
npm install
npm run typecheck
npm run build            # build/index.js, the npm bin
npm run build:download   # also copies it to the dashboard download in the Android Texter monorepo
```

## License

MIT
