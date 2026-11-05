/** Base class for every error this package throws. */
export class AndroidTexterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The request never got an HTTP response (DNS, TLS, timeout, refused).
 *
 * When this is thrown for a send, the message may or may not have been
 * queued. Check `listMessages({ direction: "outbound" })` before retrying so
 * the recipient is not texted twice.
 */
export class APIConnectionError extends AndroidTexterError {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/** The server answered with a 4xx or 5xx status. */
export class APIError extends AndroidTexterError {
  /** HTTP status code, for example 400 or 429. */
  readonly status: number;
  /** The decoded JSON body, or the raw text when the body was not JSON. */
  readonly body: unknown;
  /** The server's `error` text, for example "Phone and message are required". */
  readonly error: string;

  constructor(error: string, status: number, body?: unknown) {
    super(`[${status}] ${error}`);
    this.status = status;
    this.body = body;
    this.error = error;
  }
}

/** 400: the request failed validation. `error` names the problem. */
export class BadRequestError extends APIError {}

/** 401: the API key is missing, wrong, or revoked (or is only the 10-character display prefix). */
export class AuthenticationError extends APIError {}

/** 403: the key is valid but the account may not do this (for example, suspended). */
export class PermissionDeniedError extends APIError {}

/** 404: the record does not exist or belongs to another account. */
export class NotFoundError extends APIError {}

/**
 * 429: a rate limit, or the free plan's daily message cap, was hit.
 * `upgrade` is true when the cause is the daily cap; retrying will not help
 * until the next day or an upgrade to Pro.
 */
export class RateLimitError extends APIError {
  get upgrade(): boolean {
    const b = this.body as { upgrade?: unknown } | null;
    return !!(b && typeof b === "object" && b.upgrade);
  }
}

/** 5xx: the server failed. Safe to retry reads; check before retrying sends. */
export class InternalServerError extends APIError {}

export function errorForStatus(status: number, error: string, body: unknown): APIError {
  switch (status) {
    case 400:
      return new BadRequestError(error, status, body);
    case 401:
      return new AuthenticationError(error, status, body);
    case 403:
      return new PermissionDeniedError(error, status, body);
    case 404:
      return new NotFoundError(error, status, body);
    case 429:
      return new RateLimitError(error, status, body);
    default:
      return status >= 500 ? new InternalServerError(error, status, body) : new APIError(error, status, body);
  }
}
