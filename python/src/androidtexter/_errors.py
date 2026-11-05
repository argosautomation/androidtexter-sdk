"""Exceptions raised by the Android Texter client."""

from __future__ import annotations

from typing import Any, Optional


class AndroidTexterError(Exception):
    """Base class for every error this package raises.

    Catch this to handle any failure from the client in one place.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class APIConnectionError(AndroidTexterError):
    """The request never got an HTTP response (DNS, TLS, timeout, refused).

    When this is raised for a send, the message may or may not have been
    queued. Check ``list_messages(direction="outbound")`` before retrying so
    the recipient is not texted twice.
    """


class APIError(AndroidTexterError):
    """The server answered with a 4xx or 5xx status.

    Attributes:
        status: The HTTP status code, for example 400 or 429.
        message: The server's ``error`` text, for example
            ``"Phone and message are required"``.
        body: The decoded JSON response body, or the raw text when the body
            was not JSON.
    """

    def __init__(self, message: str, status: int, body: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body

    def __str__(self) -> str:
        return "[%d] %s" % (self.status, self.message)

    def __repr__(self) -> str:
        return "%s(status=%d, message=%r)" % (type(self).__name__, self.status, self.message)


class BadRequestError(APIError):
    """400: the request failed validation. ``message`` names the problem."""


class AuthenticationError(APIError):
    """401: the API key is missing, wrong, or revoked.

    Sending the 10-character display prefix from the dashboard instead of the
    full ``atx_...`` key also lands here.
    """


class PermissionDeniedError(APIError):
    """403: the key is valid but the account may not do this (for example, suspended)."""


class NotFoundError(APIError):
    """404: the record does not exist or belongs to another account."""


class RateLimitError(APIError):
    """429: a rate limit, or the free plan's daily message cap, was hit.

    ``upgrade`` is True when the cause is the free plan's daily cap rather
    than request rate. Retrying will not help in that case until the next day
    or an upgrade to Pro.
    """

    @property
    def upgrade(self) -> bool:
        return isinstance(self.body, dict) and bool(self.body.get("upgrade"))


class InternalServerError(APIError):
    """5xx: the server failed. Safe to retry reads; check before retrying sends."""


def error_for_status(status: int, message: str, body: Any) -> APIError:
    cls: Optional[type] = {
        400: BadRequestError,
        401: AuthenticationError,
        403: PermissionDeniedError,
        404: NotFoundError,
        429: RateLimitError,
    }.get(status)
    if cls is None:
        cls = InternalServerError if status >= 500 else APIError
    return cls(message, status, body)
