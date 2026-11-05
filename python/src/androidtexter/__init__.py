"""Official Python client for the Android Texter SMS API.

Send and receive SMS and MMS through your own Android phone, from your own
number. Docs: https://androidtexter.com/docs
"""

from ._client import DEFAULT_BASE_URL, Client
from ._errors import (
    APIConnectionError,
    APIError,
    AndroidTexterError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
)
from ._version import __version__
from .webhooks import (
    EVENT_HEADER,
    SIGNATURE_HEADER,
    WebhookSignatureError,
    compute_signature,
    parse_webhook,
    verify_webhook_signature,
)

AndroidTexter = Client

__all__ = [
    "AndroidTexter",
    "Client",
    "DEFAULT_BASE_URL",
    "APIConnectionError",
    "APIError",
    "AndroidTexterError",
    "AuthenticationError",
    "BadRequestError",
    "InternalServerError",
    "NotFoundError",
    "PermissionDeniedError",
    "RateLimitError",
    "WebhookSignatureError",
    "EVENT_HEADER",
    "SIGNATURE_HEADER",
    "compute_signature",
    "parse_webhook",
    "verify_webhook_signature",
    "__version__",
]
