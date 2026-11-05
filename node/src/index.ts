export { AndroidTexter, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "./client.js";
export type { ClientOptions, RequestOptions } from "./client.js";
export {
  AndroidTexterError,
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "./errors.js";
export {
  EVENT_HEADER,
  SIGNATURE_HEADER,
  WebhookSignatureError,
  computeSignature,
  parseWebhook,
  verifyWebhookSignature,
} from "./webhooks.js";
export type { WebhookPayload } from "./webhooks.js";
export * from "./types.js";
export { VERSION } from "./version.js";

import { AndroidTexter } from "./client.js";
/** Alias of AndroidTexter. */
export const Client = AndroidTexter;
export type Client = AndroidTexter;
