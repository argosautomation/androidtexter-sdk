"""Verify webhook deliveries from Android Texter.

Every delivery is a JSON ``POST`` with these headers:

* ``X-Webhook-Signature``: ``sha256=`` followed by the hex HMAC-SHA256 of the
  raw request body, keyed with the webhook's ``whsec_...`` secret (the whole
  string, prefix included).
* ``X-Webhook-Event``: the event name, ``message.received`` or ``message.sent``.

The body looks like::

    {"event": "message.received", "timestamp": "2026-03-11T20:26:47Z",
     "data": {"id": "...", "from": "+14155551234", "body": "Hello!",
              "device_id": "...", "device_name": "Pixel 7",
              "received_at": "2026-03-11T20:26:47Z"}}
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Optional, Union, cast

from ._errors import AndroidTexterError
from ._types import WebhookEvent

SIGNATURE_HEADER = "X-Webhook-Signature"
EVENT_HEADER = "X-Webhook-Event"

Payload = Union[bytes, bytearray, str]


class WebhookSignatureError(AndroidTexterError):
    """The delivery's signature is missing or does not match the secret."""


def _as_bytes(payload: Payload) -> bytes:
    if isinstance(payload, str):
        return payload.encode("utf-8")
    return bytes(payload)


def compute_signature(payload: Payload, secret: str) -> str:
    """Return the ``sha256=<hex>`` signature the server sends for ``payload``."""
    digest = hmac.new(secret.encode("utf-8"), _as_bytes(payload), hashlib.sha256).hexdigest()
    return "sha256=" + digest


def verify_webhook_signature(payload: Payload, signature: Optional[str], secret: str) -> bool:
    """Return True when ``signature`` is a valid signature of ``payload``.

    Args:
        payload: The raw request body exactly as received. Do not parse and
            re-serialize it first: any change in whitespace or key order
            breaks the signature.
        signature: The ``X-Webhook-Signature`` header value.
        secret: The ``whsec_...`` secret returned when the webhook was created.

    The comparison is constant-time.
    """
    if not signature or not secret:
        return False
    expected = compute_signature(payload, secret)
    return hmac.compare_digest(expected.encode("utf-8"), signature.strip().encode("utf-8"))


def parse_webhook(payload: Payload, signature: Optional[str], secret: str) -> WebhookEvent:
    """Verify the signature, then return the decoded event.

    Raises:
        WebhookSignatureError: if the signature does not match.
    """
    if not verify_webhook_signature(payload, signature, secret):
        raise WebhookSignatureError("Webhook signature does not match")
    return cast(WebhookEvent, json.loads(_as_bytes(payload).decode("utf-8")))
