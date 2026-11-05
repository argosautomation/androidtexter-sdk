# androidtexter: Python SMS API client for Android Texter

The official Python library for the [Android Texter](https://androidtexter.com) SMS API. Send and receive SMS and MMS through your own Android phone, from your own phone number, with a few lines of Python.

Android Texter turns an Android phone you already own into an SMS gateway. Texts go out through that phone's SIM, so there is no carrier registration, no 10DLC campaign, no shared short code and no per-message carrier fee. Replies sync back to the API and can be pushed to your server with a webhook.

- Send SMS, MMS, group texts and scheduled texts
- Broadcast one message to up to 500 recipients with per-contact personalization
- Read conversations and full message history, including group threads
- Create and update contacts
- Receive inbound texts by webhook, with signature verification
- One dependency (`requests`), type hints throughout, Python 3.9+

Full API reference: https://androidtexter.com/docs

## Install

```bash
pip install androidtexter
```

## Send your first text

1. Install the Android Texter app on an Android phone and pair it at https://androidtexter.com/dashboard.
2. Create an API key at https://androidtexter.com/dashboard/settings/api-keys.
3. Run:

```python
from androidtexter import Client

client = Client(api_key="atx_your_key_here")
result = client.send_message("+15551234567", "Hello from Python")
print(result["message_id"])
```

The text goes out from your paired phone, from your number.

To keep the key out of your code, set an environment variable and call `Client()` with no arguments:

```bash
export ANDROIDTEXTER_API_KEY="atx_your_key_here"
```

## Usage

### Send an SMS or MMS

```python
client.send_message("+15551234567", "Your order has shipped")

# MMS: add a public image URL
client.send_message("+15551234567", "Here is your receipt", media_url="https://example.com/receipt.png")

# From a specific phone, if you have more than one paired
client.send_message("+15551234567", "Hi", device_id="DEVICE_ID")

# Group text: a list of up to 25 numbers
client.send_message(["+15551234567", "+15557654321"], "Meeting moved to 3pm")

# Dual-SIM phone: choose the SIM (0 is SIM 1)
client.send_message("+15551234567", "Hi", sim_slot=1)

# Local-format number read in another country
client.send_message("020 7946 0958", "Hello", country="GB")
```

Numbers in E.164 format (`+15551234567`) always work. Other formats are read in the country of the sending SIM. Message bodies can be up to 1600 characters.

### Schedule a text

```python
from datetime import datetime, timedelta, timezone

when = datetime.now(timezone.utc) + timedelta(hours=2)
sent = client.send_message("+15551234567", "Reminder: appointment at 4pm", scheduled_at=when)

client.list_scheduled_messages()            # pending, soonest first
client.cancel_scheduled_message(sent["message_id"])
```

`scheduled_at` takes a timezone-aware `datetime` or an RFC 3339 string such as `"2026-12-01T09:00:00Z"`.

### Check delivery status

```python
status = client.get_message_status(result["message_id"])
print(status["status"])  # "queued", then "sent" or "failed"
```

A message stays `queued` until the phone reports back. One still queued after 24 hours (for example, the phone was off) is marked `failed`.

### Send a broadcast

```python
out = client.send_broadcast(
    ["+15551234567", "+15557654321"],
    "Hi {{first_name|there}}, our sale starts today.",
)
print(out["sent"], out["failed"])
for r in out["results"]:
    print(r["phone"], r["status"], r.get("error"))
```

Up to 500 recipients per call, each sent as its own text. Tokens such as `{{first_name}}`, `{{last_name}}`, `{{name}}`, `{{company}}`, `{{city}}` and `{{state}}` are filled from each recipient's contact; `{{first_name|there}}` uses "there" when the contact has no first name. Pass `device_mode="round-robin"` to spread the load across all online phones, or `device_id=` to send everything from one phone.

### Read conversations and history

```python
for convo in client.list_conversations(view="inbox", limit=20):
    print(convo["thread_ref"], convo["phone"], convo["last_message"])

history = client.get_conversation_history("+15551234567", limit=50)
for msg in history["messages"]:
    print(msg["direction"], msg["body"])
```

`view` is `"inbox"` (someone replied), `"outbox"` (no reply yet), `"archived"`, `"spam"` or `"all"`.

For a group conversation, pass its `thread_ref` (from `list_conversations` or any message) along with a member's number, or pass the members as a list:

```python
history = client.get_conversation_history("+15551234567", thread_ref=convo["thread_ref"])
```

Other message reads:

```python
client.list_messages(direction="inbound", limit=100)   # received, newest first
client.list_messages(direction="outbound")             # sent
client.search_messages("invoice")
client.get_conversation_counts()                       # {"inbox": 12, "outbox": 3, ...}
client.archive_conversation(thread_ref=convo["thread_ref"])
```

### Devices

```python
for device in client.list_devices():
    print(device["id"], device["device_name"], device["status"], device["battery_level"])
```

### Contacts

```python
# Create, or update the contact with this number. Safe to retry.
contact = client.upsert_contact("+15551234567", name="Jane Doe", company="Acme", tags=["customer"])

client.get_contact("+15551234567")
client.list_contacts(search="acme", tag="customer")
client.list_contact_tags()
client.bulk_upsert_contacts([{"phone": "+15551234567", "name": "Jane"}, {"phone": "+15557654321"}])
client.delete_contact(contact["id"])
```

`upsert_contact` merges: fields you pass overwrite, fields you leave out are kept, and tags are added to the existing ones. `update_contact(contact_id, phone=..., ...)` is a full replace: anything you leave out is cleared.

## Webhooks: receive inbound texts

Register a URL once. The response includes a signing secret that is shown only once, so store it.

```python
hook = client.create_webhook("https://your-server.example.com/sms", events=["message.received"])
print(hook["secret"])  # whsec_...
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

Verify every delivery with the raw request body and the `X-Webhook-Signature` header. Flask example:

```python
import os
from flask import Flask, request, abort
from androidtexter import Client, verify_webhook_signature

app = Flask(__name__)
client = Client()
SECRET = os.environ["ANDROIDTEXTER_WEBHOOK_SECRET"]

@app.post("/sms")
def inbound_sms():
    if not verify_webhook_signature(request.get_data(), request.headers.get("X-Webhook-Signature"), SECRET):
        abort(401)
    event = request.get_json()
    if event["event"] == "message.received":
        sender = event["data"]["from"]
        client.send_message(sender, "Thanks, we got your message.")
    return "", 204
```

`parse_webhook(body, signature, secret)` verifies and decodes in one call, raising `WebhookSignatureError` on a mismatch. The signature is `sha256=` plus the hex HMAC-SHA256 of the raw body, keyed with the full `whsec_...` secret.

Manage webhooks with `client.list_webhooks()` and `client.delete_webhook(webhook_id)`.

## Errors

Every error is a subclass of `androidtexter.AndroidTexterError`. When the server answers with an error status you get an `APIError` carrying `status`, `message` (the server's error text) and `body`:

```python
from androidtexter import APIError, RateLimitError

try:
    client.send_message("+15551234567", "Hi")
except RateLimitError as e:
    if e.upgrade:
        print("Free plan daily limit reached")
    else:
        print("Slow down and retry")
except APIError as e:
    print(e.status, e.message)
```

| Class | Status | Meaning |
| --- | --- | --- |
| `BadRequestError` | 400 | Validation failed, for example no paired phone, or a body over 1600 characters |
| `AuthenticationError` | 401 | Key missing, wrong or revoked |
| `PermissionDeniedError` | 403 | Account cannot do this, for example suspended |
| `NotFoundError` | 404 | No such record on your account |
| `RateLimitError` | 429 | Rate limit, or the free plan's daily cap (`e.upgrade` is True) |
| `InternalServerError` | 5xx | Server error |
| `APIConnectionError` | none | No response: network failure or timeout |

The client never retries on its own, so a send is never sent twice by accident. If you see `APIConnectionError` on a send, check `list_messages(direction="outbound")` before trying again.

## Configuration

```python
Client(
    api_key="atx_...",                     # default: ANDROIDTEXTER_API_KEY
    base_url="https://androidtexter.com",  # default: ANDROIDTEXTER_BASE_URL, then this
    timeout=30.0,                          # seconds per request
    session=None,                          # your own requests.Session
)
```

`client.request(method, path, params=..., json=...)` calls any API-key endpoint that does not have its own method yet, for example `client.request("GET", "/api/quick-replies")`.

## Method reference

| Method | Endpoint |
| --- | --- |
| `me()` | `GET /api/me` |
| `send_message(phone, message, ...)` (alias `send_sms`) | `POST /api/messages/send` |
| `get_message_status(message_id)` | `GET /api/v1/messages/status/{id}` |
| `send_broadcast(phones, message, ...)` | `POST /api/messages/broadcast` |
| `list_messages(direction=None, page, limit)` | `GET /api/messages`, `/api/messages/received`, `/api/messages/sent` |
| `search_messages(query, page, limit)` | `GET /api/messages/search` |
| `list_conversations(view, limit)` | `GET /api/messages/conversations` |
| `get_conversation_history(phone, thread_ref, thread_id, page, limit)` | `GET /api/messages/thread` |
| `get_conversation_counts()` | `GET /api/messages/conversations/counts` |
| `archive_conversation(thread_ref, phone, thread_id, archived)` | `POST /api/messages/conversations/archive` |
| `list_scheduled_messages()` | `GET /api/messages/scheduled` |
| `cancel_scheduled_message(message_id)` | `DELETE /api/messages/scheduled/{id}` |
| `list_devices()` | `GET /api/devices` |
| `get_device(device_id)` | `GET /api/devices/{id}` |
| `list_contacts(search, tag, page, limit)` | `GET /api/contacts` |
| `get_contact(phone)` | `GET /api/contacts/{phone}` |
| `upsert_contact(phone, ...)` | `POST /api/contacts` |
| `update_contact(contact_id, phone, ...)` | `PUT /api/contacts/{id}` |
| `delete_contact(contact_id)` | `DELETE /api/contacts/{id}` |
| `bulk_upsert_contacts(contacts)` | `POST /api/contacts/bulk` |
| `list_contact_tags()` | `GET /api/contacts/tags` |
| `create_webhook(url, events)` | `POST /api/v1/webhooks` |
| `list_webhooks()` | `GET /api/v1/webhooks` |
| `delete_webhook(webhook_id)` | `DELETE /api/v1/webhooks/{id}` |

## Rate limits

Sends and broadcasts allow 10 requests per second with bursts of 20. Endpoints under `/api/v1/` (status, webhooks) allow 5 per second with bursts of 60. Limits are per API key. The free plan also has a daily message cap.

## Links

- Website: https://androidtexter.com
- API docs: https://androidtexter.com/docs
- API keys: https://androidtexter.com/dashboard/settings/api-keys
- Node.js library: `npm install androidtexter`

## License

MIT. Copyright (c) 2026 Cloud Communication Platform LLC.
