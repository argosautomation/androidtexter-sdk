# Android Texter

Send and read text messages from your own Android phone, in Claude.

[Android Texter](https://androidtexter.com) turns an Android phone into an SMS
and MMS gateway for your own number. You install the app on your phone, pair it
to your account by scanning a QR code on the phone itself, and grant Android's
default SMS role on the device. After that, texts you send go out over that
phone's carrier plan from its real number, and replies come back into your
account. This plugin connects Claude to that account, so "text Sam that the
meeting moved to 3pm" or "who replied to yesterday's announcement?" happens on
your own phone.

The messages are your own, on your own number. Nothing here reads anybody
else's phone, and the pairing step requires physical possession of the handset.

## What it installs

- **An MCP server**, `mcp/src/plugin.js`, started with `node`. It is plain
  JavaScript compiled from the TypeScript sources in the same folder, with no
  dependencies and nothing to install: the only thing it does is speak MCP over
  stdin and stdout and make HTTPS requests to `https://androidtexter.com/api`.
  It sends your API key in an `X-API-Key` header and reads or writes only your
  own account's data. It writes no files and runs no other program.
- **Three skills** that tell Claude how to use the tools: confirm a recipient
  before sending, build a broadcast list explicitly and state the count, and
  answer a question about a conversation instead of pasting JSON.

## Setup

1. An Android Texter account, with the app installed on an Android phone and
   paired to it. Sign up at [androidtexter.com](https://androidtexter.com).
2. An API key: in the dashboard, **Settings > API Keys**
   ([direct link](https://androidtexter.com/dashboard/settings/api-keys)). Keys
   start with `atx_`.
3. Node.js 18 or newer (`node --version`).

In Claude Code, until the directory listing is live:

```
/plugin marketplace add argosautomation/androidtexter-sdk
/plugin install android-texter@androidtexter
```

Install the plugin, and Claude Code asks for the key. It is stored in your
operating system's credential store, not in a settings file, and it is passed
to the MCP server as the `ATX_API_KEY` environment variable. That is the only
thing the plugin asks you for.

The MCP server runs on your computer, so its tools load in Claude Code and in a
Cowork session running on your own machine. The skills load everywhere,
including chat. For Claude on the web, see
[androidtexter.com/mcp](https://androidtexter.com/mcp).

## Tools

Reading: `list_devices`, `list_conversations`, `get_conversation`,
`search_messages`, `get_message_status`, `list_scheduled_messages`,
`list_contacts`, `list_contact_tags`.

Writing: `send_message` (one person, a small group, or scheduled for later),
`send_broadcast` (the same text to up to 500 people, each as its own message),
`save_contact`, `cancel_scheduled_message`.

About the server itself: `known_issues` reads Android Texter's published list of
current limits and bugs, and `report_issue` files a limitation you ran into.
Neither one carries your message text, numbers or names.

Sending tools send real texts to real people and cannot be undone, so the
skills make Claude confirm the recipients and the wording with you first.

## Support

[Documentation](https://androidtexter.com/docs) ·
[Privacy](https://androidtexter.com/privacy) ·
[Terms](https://androidtexter.com/terms) · support@androidtexter.com

The same server is on npm as
[`android-texter-mcp`](https://www.npmjs.com/package/android-texter-mcp) for
Claude Desktop, Cursor and other MCP clients. Sources and issues:
[argosautomation/androidtexter-sdk](https://github.com/argosautomation/androidtexter-sdk).

MIT licensed. Copyright Cloud Communication Platform LLC.
