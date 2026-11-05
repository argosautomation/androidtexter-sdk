// Tests run against the built dist/ output, ESM here and CJS in cjs.test.cjs.
// No test reaches the network: every client gets a fake fetch, and the global
// fetch is replaced with one that fails the test. A real send would text a
// real person from a real phone.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AndroidTexter,
  Client,
  AndroidTexterError,
  APIError,
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  VERSION,
} from "../dist/index.js";

const BASE = "https://androidtexter.com";
const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };

beforeEach(() => {
  globalThis.fetch = () => {
    throw new Error("Network access is disabled in tests");
  };
  delete process.env.ANDROIDTEXTER_API_KEY;
  delete process.env.ANDROIDTEXTER_BASE_URL;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

function fake(responses = []) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const r = responses.shift() ?? { status: 200, body: {} };
    if (r.throw) throw r.throw;
    const text = r.text ?? (r.body === undefined ? "" : JSON.stringify(r.body));
    return new Response(text, { status: r.status ?? 200, statusText: r.statusText ?? "" });
  };
  fn.calls = calls;
  Object.defineProperty(fn, "last", { get: () => calls[calls.length - 1] });
  return fn;
}

function make(responses) {
  const f = fake(responses);
  return { client: new AndroidTexter({ apiKey: "atx_test", fetch: f }), f };
}

// ------------------------------------------------------------ setup

test("version matches package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(VERSION, pkg.version);
});

test("reads api key from env", async () => {
  process.env.ANDROIDTEXTER_API_KEY = "atx_env";
  const f = fake();
  await new AndroidTexter({ fetch: f }).me();
  assert.equal(f.last.headers["X-API-Key"], "atx_env");
  assert.equal(f.last.url, BASE + "/api/me");
});

test("missing api key throws", () => {
  assert.throws(() => new AndroidTexter({ fetch: fake() }), (e) => e instanceof AndroidTexterError && /ANDROIDTEXTER_API_KEY/.test(e.message));
});

test("base url variants", async () => {
  for (const baseUrl of ["https://example.test", "https://example.test/", "https://example.test/api", "https://example.test/api/"]) {
    const f = fake();
    await new AndroidTexter({ apiKey: "atx_x", baseUrl, fetch: f }).me();
    assert.equal(f.last.url, "https://example.test/api/me");
  }
});

test("base url from env", async () => {
  process.env.ANDROIDTEXTER_BASE_URL = "http://localhost:8080";
  const f = fake();
  await new AndroidTexter({ apiKey: "atx_x", fetch: f }).listDevices();
  assert.equal(f.last.url, "http://localhost:8080/api/devices");
});

test("headers", async () => {
  const { client, f } = make();
  await client.me();
  assert.equal(f.last.headers["X-API-Key"], "atx_test");
  assert.equal(f.last.headers["User-Agent"], "androidtexter-node/" + VERSION);
  assert.equal(f.last.headers["Content-Type"], undefined);
});

test("Client alias", () => {
  assert.equal(Client, AndroidTexter);
});

// ------------------------------------------------------------ errors

test("error carries status and server message", async () => {
  const { client } = make([{ status: 400, body: { error: "Phone and message are required" } }]);
  await assert.rejects(client.sendMessage({ phone: "", message: "" }), (e) => {
    assert.ok(e instanceof BadRequestError);
    assert.ok(e instanceof APIError);
    assert.ok(e instanceof AndroidTexterError);
    assert.equal(e.status, 400);
    assert.equal(e.error, "Phone and message are required");
    assert.equal(e.message, "[400] Phone and message are required");
    assert.deepEqual(e.body, { error: "Phone and message are required" });
    return true;
  });
});

for (const [status, cls] of [
  [401, AuthenticationError],
  [404, NotFoundError],
  [429, RateLimitError],
  [500, InternalServerError],
  [503, InternalServerError],
]) {
  test(`status ${status} maps to ${cls.name}`, async () => {
    const { client } = make([{ status, body: { error: "nope" } }]);
    await assert.rejects(client.listDevices(), (e) => e instanceof cls && e.status === status && e.name === cls.name);
  });
}

test("rate limit upgrade flag", async () => {
  const { client } = make([{ status: 429, body: { error: "Daily message limit reached.", upgrade: true } }]);
  await assert.rejects(client.sendMessage({ phone: "+15551234567", message: "hi" }), (e) => e instanceof RateLimitError && e.upgrade === true);
});

test("non-JSON error body", async () => {
  const { client } = make([{ status: 502, text: "<html>Bad Gateway</html>", statusText: "Bad Gateway" }]);
  await assert.rejects(client.listDevices(), (e) => e instanceof InternalServerError && e.status === 502 && /Bad Gateway/.test(e.error));
});

test("connection error", async () => {
  const { client } = make([{ throw: new TypeError("fetch failed") }]);
  await assert.rejects(client.listDevices(), (e) => e instanceof APIConnectionError);
});

test("timeout becomes APIConnectionError", async () => {
  const slow = (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const client = new AndroidTexter({ apiKey: "atx_x", fetch: slow, timeoutMs: 10 });
  await assert.rejects(client.me(), (e) => e instanceof APIConnectionError && /timed out/.test(e.message));
});

test("global fetch guard is active", async () => {
  const client = new AndroidTexter({ apiKey: "atx_x", baseUrl: "http://127.0.0.1:9" });
  await assert.rejects(client.me(), (e) => e instanceof APIConnectionError && /disabled in tests/.test(e.message));
});

// ------------------------------------------------------------ messages

test("sendMessage minimal", async () => {
  const { client, f } = make([{ body: { status: 200, message_id: "m1", device_id: "d1", device_name: "Pixel" } }]);
  const out = await client.sendMessage({ phone: "+15551234567", message: "Hello" });
  assert.equal(f.last.method, "POST");
  assert.equal(f.last.url, BASE + "/api/messages/send");
  assert.equal(f.last.headers["Content-Type"], "application/json");
  assert.deepEqual(f.last.body, { phone: "+15551234567", message: "Hello" });
  assert.equal(out.message_id, "m1");
});

test("sendMessage all options", async () => {
  const { client, f } = make();
  await client.sendMessage({
    phone: ["+15551234567", " +15557654321"],
    message: "Group hi",
    device_id: "d1",
    media_url: "https://example.com/a.jpg",
    scheduled_at: new Date(Date.UTC(2026, 11, 1, 14, 0, 0, 123)),
    thread_id: "42",
    sim_slot: 0,
    country: "GB",
  });
  assert.deepEqual(f.last.body, {
    phone: "+15551234567,+15557654321",
    message: "Group hi",
    device_id: "d1",
    media_url: "https://example.com/a.jpg",
    scheduled_at: "2026-12-01T14:00:00Z",
    thread_id: "42",
    sim_slot: 0,
    country: "GB",
  });
});

test("sendMessage scheduled string passes through", async () => {
  const { client, f } = make();
  await client.sendMessage({ phone: "+15551234567", message: "x", scheduled_at: "2026-12-01T09:00:00-05:00" });
  assert.equal(f.last.body.scheduled_at, "2026-12-01T09:00:00-05:00");
});

test("sendSms alias", async () => {
  const { client, f } = make();
  await client.sendSms({ phone: "+15551234567", message: "x" });
  assert.equal(f.last.url, BASE + "/api/messages/send");
});

test("getMessageStatus", async () => {
  const { client, f } = make([{ body: { id: "m1", status: "sent", phone: "+15551234567" } }]);
  const out = await client.getMessageStatus("m1");
  assert.equal(f.last.method, "GET");
  assert.equal(f.last.url, BASE + "/api/v1/messages/status/m1");
  assert.equal(out.status, "sent");
});

test("sendBroadcast", async () => {
  const { client, f } = make([{ body: { sent: 2, failed: 0, total: 2, results: [] } }]);
  const out = await client.sendBroadcast({ phones: ["+15551234567", "+15557654321"], message: "Hi {{first_name|there}}" });
  assert.equal(f.last.url, BASE + "/api/messages/broadcast");
  assert.deepEqual(f.last.body, { phones: ["+15551234567", "+15557654321"], message: "Hi {{first_name|there}}" });
  assert.equal(out.sent, 2);
});

test("sendBroadcast device_id implies specific", async () => {
  const { client, f } = make();
  await client.sendBroadcast({ phones: ["+15551234567"], message: "x", device_id: "d1" });
  assert.equal(f.last.body.device_mode, "specific");
  assert.equal(f.last.body.device_id, "d1");
});

test("sendBroadcast round-robin", async () => {
  const { client, f } = make();
  await client.sendBroadcast({ phones: ["+15551234567"], message: "x", device_mode: "round-robin", media_url: "https://e.com/a.png", country: "CA" });
  assert.equal(f.last.body.device_mode, "round-robin");
  assert.equal(f.last.body.media_url, "https://e.com/a.png");
  assert.equal(f.last.body.country, "CA");
});

for (const [direction, path] of [
  [undefined, "/api/messages"],
  ["inbound", "/api/messages/received"],
  ["outbound", "/api/messages/sent"],
]) {
  test(`listMessages direction=${direction}`, async () => {
    const { client, f } = make([{ body: { messages: [{ id: "a" }], page: 2, limit: 10 } }]);
    const out = await client.listMessages({ direction, page: 2, limit: 10 });
    assert.equal(f.last.url, `${BASE}${path}?page=2&limit=10`);
    assert.deepEqual(out, [{ id: "a" }]);
  });
}

test("listMessages bad direction", async () => {
  const { client } = make();
  await assert.rejects(client.listMessages({ direction: "sideways" }), TypeError);
});

test("listMessages without params has no query string", async () => {
  const { client, f } = make();
  await client.listMessages();
  assert.equal(f.last.url, BASE + "/api/messages");
});

test("searchMessages", async () => {
  const { client, f } = make([{ body: { messages: [], total: 0, page: 1, query: "invoice due" } }]);
  const out = await client.searchMessages("invoice due", { limit: 5 });
  assert.equal(f.last.url, BASE + "/api/messages/search?q=invoice+due&limit=5");
  assert.equal(out.query, "invoice due");
});

// ------------------------------------------------------------ conversations

test("listConversations", async () => {
  const { client, f } = make([{ body: { conversations: [{ thread_ref: "t1" }] } }]);
  const out = await client.listConversations({ view: "inbox", limit: 100 });
  assert.equal(f.last.url, BASE + "/api/messages/conversations?view=inbox&limit=100");
  assert.equal(out[0].thread_ref, "t1");
});

test("listConversations legacy filter", async () => {
  const { client, f } = make();
  await client.listConversations({ filter: "spam" });
  assert.equal(f.last.url, BASE + "/api/messages/conversations?filter=spam");
});

test("getConversationHistory", async () => {
  const { client, f } = make([{ body: { messages: [{ id: "x" }], thread_ref: "t1", phone: "+15551234567", page: 1, limit: 20 } }]);
  const out = await client.getConversationHistory({ phone: "+15551234567", thread_ref: "t1", limit: 20 });
  assert.equal(f.last.url, BASE + "/api/messages/thread?phone=%2B15551234567&thread_ref=t1&limit=20");
  assert.equal(out.thread_ref, "t1");
  assert.equal(out.messages[0].id, "x");
});

test("getConversationHistory group with thread_id, null messages", async () => {
  const { client, f } = make([{ body: { messages: null, thread_ref: "" } }]);
  const out = await client.getConversationHistory({ phone: ["+15551234567", "+15557654321"], thread_id: "42" });
  assert.equal(f.last.url, BASE + "/api/messages/thread?phone=%2B15551234567%2C%2B15557654321&thread_id=42");
  assert.deepEqual(out.messages, []);
});

test("getConversationCounts", async () => {
  const { client, f } = make([{ body: { counts: { all: 3, inbox: 1, outbox: 2, archived: 0, spam: 0 } } }]);
  assert.equal((await client.getConversationCounts()).outbox, 2);
  assert.equal(f.last.url, BASE + "/api/messages/conversations/counts");
});

test("archiveConversation", async () => {
  const { client, f } = make([{ body: { success: true, thread_ref: "t1", archived: false } }]);
  await client.archiveConversation({ thread_ref: "t1", archived: false });
  assert.equal(f.last.method, "POST");
  assert.equal(f.last.url, BASE + "/api/messages/conversations/archive");
  assert.deepEqual(f.last.body, { thread_ref: "t1", archived: false });
});

test("archiveConversation defaults to archived true", async () => {
  const { client, f } = make();
  await client.archiveConversation({ phone: "+15551234567" });
  assert.deepEqual(f.last.body, { phone: "+15551234567", archived: true });
});

test("archiveConversation requires an identity", () => {
  const { client } = make();
  assert.throws(() => client.archiveConversation({}), TypeError);
});

// ------------------------------------------------------------ scheduled

test("listScheduledMessages turns null into []", async () => {
  // The server answers {"scheduled_messages": null} when there are none.
  const { client, f } = make([{ body: { scheduled_messages: null } }]);
  assert.deepEqual(await client.listScheduledMessages(), []);
  assert.equal(f.last.url, BASE + "/api/messages/scheduled");
});

test("cancelScheduledMessage", async () => {
  const { client, f } = make([{ body: { message: "Scheduled message cancelled" } }]);
  await client.cancelScheduledMessage("m/1");
  assert.equal(f.last.method, "DELETE");
  assert.equal(f.last.url, BASE + "/api/messages/scheduled/m%2F1");
});

test("cancelScheduledMessage not found", async () => {
  const { client } = make([{ status: 404, body: { error: "message not found or not pending" } }]);
  await assert.rejects(client.cancelScheduledMessage("m1"), NotFoundError);
});

// ------------------------------------------------------------ devices

test("listDevices", async () => {
  const { client, f } = make([{ body: { devices: [{ id: "d1", status: "online" }] } }]);
  assert.deepEqual(await client.listDevices(), [{ id: "d1", status: "online" }]);
  assert.equal(f.last.url, BASE + "/api/devices");
});

test("getDevice", async () => {
  const { client, f } = make([{ body: { device: { id: "d1" } } }]);
  assert.deepEqual(await client.getDevice("d1"), { id: "d1" });
  assert.equal(f.last.url, BASE + "/api/devices/d1");
});

// ------------------------------------------------------------ contacts

test("listContacts", async () => {
  const { client, f } = make([{ body: { contacts: [], total: 0, page: 1 } }]);
  const out = await client.listContacts({ search: "jane", tag: "vip" });
  assert.equal(f.last.url, BASE + "/api/contacts?search=jane&tag=vip");
  assert.equal(out.total, 0);
});

test("getContact encodes plus", async () => {
  const { client, f } = make([{ body: { contact: { id: "c1" } } }]);
  assert.equal((await client.getContact("+15551234567")).id, "c1");
  assert.equal(f.last.url, BASE + "/api/contacts/%2B15551234567");
});

test("upsertContact", async () => {
  const { client, f } = make([{ status: 201, body: { contact: { id: "c1", phone: "+15551234567" } } }]);
  const out = await client.upsertContact({ phone: "+15551234567", name: "Jane", tags: ["vip"] });
  assert.equal(f.last.method, "POST");
  assert.equal(f.last.url, BASE + "/api/contacts");
  assert.deepEqual(f.last.body, { phone: "+15551234567", name: "Jane", tags: ["vip"] });
  assert.equal(out.id, "c1");
});

test("updateContact sends a full body", async () => {
  const { client, f } = make([{ body: { contact: { id: "c1" } } }]);
  await client.updateContact("c1", { phone: "+15551234567", name: "Jane" });
  assert.equal(f.last.method, "PUT");
  assert.equal(f.last.url, BASE + "/api/contacts/c1");
  assert.deepEqual(f.last.body, { phone: "+15551234567", name: "Jane", email: null, company: null, notes: null, tags: [] });
});

test("deleteContact", async () => {
  const { client, f } = make();
  await client.deleteContact("c1");
  assert.equal(f.last.method, "DELETE");
  assert.equal(f.last.url, BASE + "/api/contacts/c1");
});

test("bulkUpsertContacts", async () => {
  const { client, f } = make([{ body: { message: "Bulk import complete", imported: 2, total: 2 } }]);
  const out = await client.bulkUpsertContacts([{ phone: "+15551234567", name: null }, { phone: "+15557654321", tags: ["a"] }]);
  assert.equal(f.last.url, BASE + "/api/contacts/bulk");
  assert.deepEqual(f.last.body, { contacts: [{ phone: "+15551234567" }, { phone: "+15557654321", tags: ["a"] }] });
  assert.equal(out.imported, 2);
});

test("listContactTags", async () => {
  const { client, f } = make([{ body: { tags: ["a", "b"] } }]);
  assert.deepEqual(await client.listContactTags(), ["a", "b"]);
  assert.equal(f.last.url, BASE + "/api/contacts/tags");
});

// ------------------------------------------------------------ webhooks

test("createWebhook", async () => {
  const { client, f } = make([{ status: 201, body: { webhook: { id: "w1" }, secret: "whsec_abc", message: "Save this secret" } }]);
  const out = await client.createWebhook({ url: "https://example.com/hook", events: ["message.received"] });
  assert.equal(f.last.method, "POST");
  assert.equal(f.last.url, BASE + "/api/v1/webhooks");
  assert.deepEqual(f.last.body, { url: "https://example.com/hook", events: ["message.received"] });
  assert.equal(out.secret, "whsec_abc");
});

test("createWebhook leaves default events to the server", async () => {
  const { client, f } = make();
  await client.createWebhook({ url: "https://example.com/hook" });
  assert.deepEqual(f.last.body, { url: "https://example.com/hook" });
});

test("listWebhooks", async () => {
  const { client, f } = make([{ body: { webhooks: [{ id: "w1" }] } }]);
  assert.deepEqual(await client.listWebhooks(), [{ id: "w1" }]);
  assert.equal(f.last.url, BASE + "/api/v1/webhooks");
});

test("deleteWebhook", async () => {
  const { client, f } = make([{ body: { success: true } }]);
  await client.deleteWebhook("w1");
  assert.equal(f.last.method, "DELETE");
  assert.equal(f.last.url, BASE + "/api/v1/webhooks/w1");
});

// ------------------------------------------------------------ escape hatch

test("request escape hatch", async () => {
  const { client, f } = make([{ body: { quick_replies: [] } }]);
  await client.request("GET", "/api/quick-replies", { query: { x: true, y: undefined, z: null } });
  assert.equal(f.last.url, BASE + "/api/quick-replies?x=true");
});
