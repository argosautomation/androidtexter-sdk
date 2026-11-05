import { createHmac, timingSafeEqual } from "node:crypto";
import { AndroidTexterError } from "./errors.js";
import type { WebhookEvent } from "./types.js";

/** Header carrying `sha256=<hex HMAC-SHA256 of the raw body>`. */
export const SIGNATURE_HEADER = "X-Webhook-Signature";
/** Header carrying the event name, `message.received` or `message.sent`. */
export const EVENT_HEADER = "X-Webhook-Event";

export type WebhookPayload = string | Uint8Array;

/** The delivery's signature is missing or does not match the secret. */
export class WebhookSignatureError extends AndroidTexterError {}

/** Return the `sha256=<hex>` signature the server sends for `payload`. */
export function computeSignature(payload: WebhookPayload, secret: string): string {
  const mac = createHmac("sha256", secret);
  mac.update(typeof payload === "string" ? Buffer.from(payload, "utf8") : payload);
  return "sha256=" + mac.digest("hex");
}

/**
 * True when `signature` (the `X-Webhook-Signature` header) is a valid
 * signature of `payload` under `secret` (the `whsec_...` value returned when
 * the webhook was created). Constant-time.
 *
 * Pass the raw request body exactly as received. Parsing and re-serializing
 * the JSON first changes the bytes and breaks the signature.
 */
export function verifyWebhookSignature(
  payload: WebhookPayload,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(computeSignature(payload, secret), "utf8");
  const given = Buffer.from(signature.trim(), "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** Verify the signature, then return the decoded event. Throws WebhookSignatureError on mismatch. */
export function parseWebhook(
  payload: WebhookPayload,
  signature: string | null | undefined,
  secret: string,
): WebhookEvent {
  if (!verifyWebhookSignature(payload, signature, secret)) {
    throw new WebhookSignatureError("Webhook signature does not match");
  }
  const text = typeof payload === "string" ? payload : Buffer.from(payload).toString("utf8");
  return JSON.parse(text) as WebhookEvent;
}
