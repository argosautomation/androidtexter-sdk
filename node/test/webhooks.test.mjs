import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  WebhookSignatureError,
  computeSignature,
  parseWebhook,
  verifyWebhookSignature,
} from "../dist/index.js";

const SECRET = "whsec_" + "ab".repeat(32);
const BODY = JSON.stringify({
  event: "message.received",
  timestamp: "2026-03-11T20:26:47Z",
  data: { id: "m1", from: "+14155551234", body: "Hello!", device_id: "d1", device_name: "Pixel 7" },
});

// Same computation as backend/internal/services/webhook.go deliver():
// HMAC-SHA256 keyed with the whole secret string, hex, "sha256=" prefix.
const serverSignature = (body, secret) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

test("valid signature, string payload", () => {
  assert.equal(verifyWebhookSignature(BODY, serverSignature(BODY, SECRET), SECRET), true);
});

test("valid signature, Buffer and Uint8Array payloads", () => {
  const sig = serverSignature(BODY, SECRET);
  assert.equal(verifyWebhookSignature(Buffer.from(BODY), sig, SECRET), true);
  assert.equal(verifyWebhookSignature(new TextEncoder().encode(BODY), sig, SECRET), true);
});

test("computeSignature matches the server", () => {
  assert.equal(computeSignature(BODY, SECRET), serverSignature(BODY, SECRET));
});

test("fixed vector", () => {
  assert.equal(
    computeSignature('{"event":"message.received"}', "whsec_test"),
    "sha256=" + createHmac("sha256", "whsec_test").update('{"event":"message.received"}').digest("hex"),
  );
});

for (const sig of [undefined, null, "", "sha256=deadbeef", serverSignature(BODY, "whsec_other"), serverSignature(BODY, SECRET).slice(7)]) {
  test(`invalid signature ${String(sig).slice(0, 20)}`, () => {
    assert.equal(verifyWebhookSignature(BODY, sig, SECRET), false);
  });
}

test("tampered body", () => {
  const sig = serverSignature(BODY, SECRET);
  assert.equal(verifyWebhookSignature(BODY.replace("Hello", "Hullo"), sig, SECRET), false);
});

test("empty secret is false", () => {
  assert.equal(verifyWebhookSignature(BODY, serverSignature(BODY, ""), ""), false);
});

test("parseWebhook", () => {
  const event = parseWebhook(BODY, serverSignature(BODY, SECRET), SECRET);
  assert.equal(event.event, "message.received");
  assert.equal(event.data.from, "+14155551234");
});

test("parseWebhook rejects a bad signature", () => {
  assert.throws(() => parseWebhook(BODY, "sha256=00", SECRET), WebhookSignatureError);
});
