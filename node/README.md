# androidtexter: Node.js SMS API client for Android Texter

The official Node.js and TypeScript library for the [Android Texter](https://androidtexter.com) SMS API. Send and receive SMS and MMS through your own Android phone, from your own phone number, with a few lines of JavaScript.

Android Texter turns an Android phone you already own into an SMS gateway. Texts go out through that phone's SIM, so there is no carrier registration, no 10DLC campaign, no shared short code and no per-message carrier fee. Replies sync back to the API and can be pushed to your server with a webhook.

- Send SMS, MMS, group texts and scheduled texts
- Broadcast one message to up to 500 recipients with per-contact personalization
- Read conversations and full message history, including group threads
- Create and update contacts
- Receive inbound texts by webhook, with signature verification
- Zero dependencies, full TypeScript types, ESM and CommonJS, Node 18+

Full API reference: https://androidtexter.com/docs

## Install

```bash
npm install androidtexter
```

## Send your first text

1. Install the Android Texter app on an Android phone and pair it at https://androidtexter.com/dashboard.
2. Create an API key at https://androidtexter.com/dashboard/settings/api-keys.
3. Run:

```js
import { AndroidTexter } from "androidtexter";

const client = new AndroidTexter({ apiKey: "atx_your_key_here" });
const result = await client.sendMessage({ phone: "+15551234567", message: "Hello from Node" });
console.log(result.message_id);
```

The text goes out from your paired phone, from your number.

CommonJS works too:

```js
const { AndroidTexter } = require("androidtexter");
```

To keep the key out of your code, set an environment variable and call `new AndroidTexter()` with no arguments:

```bash
export ANDROIDTEXTER_API_KEY="atx_your_key_here"
```

## Usage

Method names are camelCase. Request fields use the API's own names (`phone`, `media_url`, `device_id`), so they match the [API docs](https://androidtexter.com/docs) and the JSON you see on the wire.

### Send an SMS or MMS

```js
await client.sendMessage({ phone: "+15551234567", message: "Your order has shipped" });

// MMS: add a public image URL
await client.sendMessage({ phone: "+15551234567", message: "Here is your receipt", media_url: "https://example.com/receipt.png" });

// From a specific phone, if you have more than one paired
await client.sendMessage({ phone: "+15551234567", message: "Hi", device_id: "DEVICE_ID" });

// Group text: an array of up to 25 numbers
await client.sendMessage({ phone: ["+15551234567", "+15557654321"], message: "Meeting moved to 3pm" });

// Dual-SIM phone: choose the SIM (0 is SIM 1)
await client.sendMessage({ phone: "+15551234567", message: "Hi", sim_slot: 1 });

// Local-format number read in another country
await client.sendMessage({ phone: "020 7946 0958", message: "Hello", country: "GB" });
```

Numbers in E.164 format (`+15551234567`) always work. Other formats are read in the country of the sending SIM. Message bodies can be up to 1600 characters.

### Schedule a text

```js
const sent = await client.sendMessage({
  phone: "+15551234567",
  message: "Reminder: appointment at 4pm",
  scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
});

await client.listScheduledMessages();               // pending, soonest first
await client.cancelScheduledMessage(sent.message_id);
```

`scheduled_at` takes a `Date` or an RFC 3339 string such as `"2026-12-01T09:00:00Z"`.

### Check delivery status

```js
const status = await client.getMessageStatus(result.message_id);
console.log(status.status); // "queued", then "sent" or "failed"
```

A message stays `queued` until the phone reports back. One still queued after 24 hours (for example, the phone was off) is marked `failed`.

### Send a broadcast

```js
const out = await client.sendBroadcast({
  phones: ["+15551234567", "+15557654321"],
  message: "Hi {{first_name|there}}, our sale starts today.",
});
console.log(out.sent, out.failed);
for (const r of out.results) console.log(r.phone, r.status, r.error);
```

Up to 500 recipients per call, each sent as its own text. Tokens such as `{{first_name}}`, `{{last_name}}`, `{{name}}`, `{{company}}`, `{{city}}` and `{{state}}` are filled from each recipient's contact; `{{first_name|there}}` uses "there" when the contact has no first name. Pass `device_mode: "round-robin"` to spread the load across all online phones, or `device_id` to send everything from one phone.

### Read conversations and history

```js
const convos = await client.listConversations({ view: "inbox", limit: 20 });
for (const c of convos) console.log(c.thread_ref, c.phone, c.last_message);

const history = await client.getConversationHistory({ phone: "+15551234567", limit: 50 });
for (const m of history.messages) console.log(m.direction, m.body);
```

`view` is `"inbox"` (someone replied), `"outbox"` (no reply yet), `"archived"`, `"spam"` or `"all"`.

For a group conversation, pass its `thread_ref` (from `listConversations` or any message) along with a member's number, or pass the members as an array:

```js
await client.getConversationHistory({ phone: "+15551234567", thread_ref: convos[0].thread_ref });
```

Other message reads:

```js
await client.listMessages({ direction: "inbound", limit: 100 }); // received, newest first
await client.listMessages({ direction: "outbound" });            // sent
await client.searchMessages("invoice");
await client.getConversationCounts();                           // { inbox: 12, outbox: 3, ... }
await client.archiveConversation({ thread_ref: convos[0].thread_ref });
```

### Devices

```js
for (const d of await client.listDevices()) {
  console.log(d.id, d.device_name, d.status, d.battery_level);
}
```

### Contacts

```js
// Create, or update the contact with this number. Safe to retry.
const contact = await client.upsertContact({ phone: "+15551234567", name: "Jane Doe", company: "Acme", tags: ["customer"] });

await client.getContact("+15551234567");
await client.listContacts({ search: "acme", tag: "customer" });
await client.listContactTags();
await client.bulkUpsertContacts([{ phone: "+15551234567", name: "Jane" }, { phone: "+15557654321" }]);
await client.deleteContact(contact.id);
```

`upsertContact` merges: fields you pass overwrite, fields you leave out are kept, and tags are added to the existing ones. `updateContact(id, { phone, ... })` is a full replace: anything you leave out is cleared.

## Webhooks: receive inbound texts

Register a URL once. The response includes a signing secret that is shown only once, so store it.

```js
const hook = await client.createWebhook({ url: "https://your-server.example.com/sms", events: ["message.received"] });
console.log(hook.secret); // whsec_...
```

Events are `message.received` (a text arrived on a paired phone) and `message.sent` (the phone sent a text). Each delivery is a JSON `POST`:

```json
{
  "event": "message.received",
  "timestamp": "2026-03-11T20:26:47Z",
  "data": {
    "id": "...",
    "from": "+14155551234",
    "body": "Hello!",
    "device_id": "...",
    "device_name": "Pixel 7",
    "device_phone": "+12485550100",
    "received_at": "2026-03-11T20:26:47Z"
  }
}
```

MMS deliveries also carry `media_url` and `media_type`. For `message.sent`, `data.from` holds the recipient's number.

Verify every delivery against the raw body and the `X-Webhook-Signature` header. Express example (note `express.raw`, not `express.json`, so the bytes are untouched):

```js
import express from "express";
import { AndroidTexter, verifyWebhookSignature } from "androidtexter";

const app = express();
const client = new AndroidTexter();
const SECRET = process.env.ANDROIDTEXTER_WEBHOOK_SECRET;

app.post("/sms", express.raw({ type: "application/json" }), async (req, res) => {
  if (!verifyWebhookSignature(req.body, req.get("X-Webhook-Signature"), SECRET)) {
    return res.sendStatus(401);
  }
  const event = JSON.parse(req.body.toString("utf8"));
  if (event.event === "message.received") {
    await client.sendMessage({ phone: event.data.from, message: "Thanks, we got your message." });
  }
  res.sendStatus(204);
});

app.listen(3000);
```

`parseWebhook(body, signature, secret)` verifies and decodes in one call, throwing `WebhookSignatureError` on a mismatch. The signature is `sha256=` plus the hex HMAC-SHA256 of the raw body, keyed with the full `whsec_...` secret.

Manage webhooks with `client.listWebhooks()` and `client.deleteWebhook(id)`.

## Errors

Every error extends `AndroidTexterError`. When the server answers with an error status you get an `APIError` with `status`, `error` (the server's error text) and `body`:

```js
import { APIError, RateLimitError } from "androidtexter";

try {
  await client.sendMessage({ phone: "+15551234567", message: "Hi" });
} catch (err) {
  if (err instanceof RateLimitError && err.upgrade) {
    console.log("Free plan daily limit reached");
  } else if (err instanceof APIError) {
    console.log(err.status, err.error);
  } else {
    throw err;
  }
}
```

| Class | Status | Meaning |
| --- | --- | --- |
| `BadRequestError` | 400 | Validation failed, for example no paired phone, or a body over 1600 characters |
| `AuthenticationError` | 401 | Key missing, wrong or revoked |
| `PermissionDeniedError` | 403 | Account cannot do this, for example suspended |
| `NotFoundError` | 404 | No such record on your account |
| `RateLimitError` | 429 | Rate limit, or the free plan's daily cap (`err.upgrade` is true) |
| `InternalServerError` | 5xx | Server error |
| `APIConnectionError` | none | No response: network failure or timeout |

The client never retries on its own, so a send is never sent twice by accident. If you see `APIConnectionError` on a send, check `listMessages({ direction: "outbound" })` before trying again.

## Configuration

```js
new AndroidTexter({
  apiKey: "atx_...",                     // default: process.env.ANDROIDTEXTER_API_KEY
  baseUrl: "https://androidtexter.com",  // default: ANDROIDTEXTER_BASE_URL, then this
  timeoutMs: 30000,                      // per request
  fetch: customFetch,                    // default: global fetch
});
```

`client.request(method, path, { query, body })` calls any API-key endpoint that does not have its own method yet, for example `client.request("GET", "/api/quick-replies")`.

## Method reference

| Method | Endpoint |
| --- | --- |
| `me()` | `GET /api/me` |
| `sendMessage({ phone, message, ... })` (alias `sendSms`) | `POST /api/messages/send` |
| `getMessageStatus(id)` | `GET /api/v1/messages/status/:id` |
| `sendBroadcast({ phones, message, ... })` | `POST /api/messages/broadcast` |
| `listMessages({ direction, page, limit })` | `GET /api/messages`, `/api/messages/received`, `/api/messages/sent` |
| `searchMessages(query, { page, limit })` | `GET /api/messages/search` |
| `listConversations({ view, limit })` | `GET /api/messages/conversations` |
| `getConversationHistory({ phone, thread_ref, thread_id, page, limit })` | `GET /api/messages/thread` |
| `getConversationCounts()` | `GET /api/messages/conversations/counts` |
| `archiveConversation({ thread_ref, phone, thread_id, archived })` | `POST /api/messages/conversations/archive` |
| `listScheduledMessages()` | `GET /api/messages/scheduled` |
| `cancelScheduledMessage(id)` | `DELETE /api/messages/scheduled/:id` |
| `listDevices()` | `GET /api/devices` |
| `getDevice(id)` | `GET /api/devices/:id` |
| `listContacts({ search, tag, page, limit })` | `GET /api/contacts` |
| `getContact(phone)` | `GET /api/contacts/:phone` |
| `upsertContact({ phone, ... })` | `POST /api/contacts` |
| `updateContact(id, { phone, ... })` | `PUT /api/contacts/:id` |
| `deleteContact(id)` | `DELETE /api/contacts/:id` |
| `bulkUpsertContacts(contacts)` | `POST /api/contacts/bulk` |
| `listContactTags()` | `GET /api/contacts/tags` |
| `createWebhook({ url, events })` | `POST /api/v1/webhooks` |
| `listWebhooks()` | `GET /api/v1/webhooks` |
| `deleteWebhook(id)` | `DELETE /api/v1/webhooks/:id` |

## Rate limits

Sends and broadcasts allow 10 requests per second with bursts of 20. Endpoints under `/api/v1/` (status, webhooks) allow 5 per second with bursts of 60. Limits are per API key. The free plan also has a daily message cap.

## Links

- Website: https://androidtexter.com
- API docs: https://androidtexter.com/docs
- API keys: https://androidtexter.com/dashboard/settings/api-keys
- Python library: `pip install androidtexter`

## License

MIT. Copyright (c) 2026 Cloud Communication Platform LLC.
