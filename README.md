# Android Texter SDKs

Official client libraries for [Android Texter](https://androidtexter.com), the SMS gateway that sends and receives texts through your own Android phone and number. No carrier registration, no 10DLC campaign, no per-message carrier fee.

| Package | Install | Folder |
| --- | --- | --- |
| Python | `pip install androidtexter` | [`python/`](python) |
| Node.js / TypeScript | `npm install androidtexter` | [`node/`](node) |
| MCP server for Claude, Cursor and other AI clients | `npx -y android-texter-mcp` | [`mcp/`](mcp) |

## Send your first text

1. Install the Android Texter app on an Android phone and pair it at https://androidtexter.com/dashboard.
2. Create an API key at https://androidtexter.com/dashboard/settings/api-keys.
3. Send a text:

```python
from androidtexter import Client

client = Client(api_key="atx_...")
client.send_message("+14155551234", "Hello from my own phone number")
```

```js
import { AndroidTexter } from "androidtexter";

const client = new AndroidTexter({ apiKey: "atx_..." });
await client.sendMessage({ phone: "+14155551234", message: "Hello from my own phone number" });
```

Each folder has its own README with every method, webhooks and signature verification.

## Links

- API reference: https://androidtexter.com/docs
- MCP setup: https://androidtexter.com/mcp
- Support: support@androidtexter.com

This repository is published from Android Texter's main codebase. Issues and pull requests are welcome here.

MIT licensed. Copyright (c) 2026 Cloud Communication Platform LLC.
