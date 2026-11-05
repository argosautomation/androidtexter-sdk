// The CommonJS build loads and works the same as the ESM one.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const at = require("../dist/index.cjs");

// No network: only the injected fetch below may be called.
globalThis.fetch = () => {
  throw new Error("Network access is disabled in tests");
};

test("cjs exports", () => {
  for (const name of [
    "AndroidTexter",
    "Client",
    "APIError",
    "NotFoundError",
    "RateLimitError",
    "verifyWebhookSignature",
    "parseWebhook",
    "VERSION",
  ]) {
    assert.ok(at[name], name + " is exported");
  }
});

test("cjs client sends with an injected fetch only", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ status: 200, message_id: "m1" }), { status: 200 });
  };
  const client = new at.AndroidTexter({ apiKey: "atx_test", fetch });
  const out = await client.sendMessage({ phone: "+15551234567", message: "hi" });
  assert.equal(out.message_id, "m1");
  assert.equal(calls[0].url, "https://androidtexter.com/api/messages/send");
});

test("cjs errors keep their class", async () => {
  const fetch = async () => new Response(JSON.stringify({ error: "Device not found" }), { status: 404 });
  const client = new at.AndroidTexter({ apiKey: "atx_test", fetch });
  await assert.rejects(client.getDevice("x"), (e) => e instanceof at.NotFoundError && e.status === 404);
});
