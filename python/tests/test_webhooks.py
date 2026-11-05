import hashlib
import hmac
import json

import pytest

from androidtexter import (
    WebhookSignatureError,
    compute_signature,
    parse_webhook,
    verify_webhook_signature,
)

SECRET = "whsec_" + "ab" * 32
BODY = json.dumps(
    {
        "event": "message.received",
        "timestamp": "2026-03-11T20:26:47Z",
        "data": {"id": "m1", "from": "+14155551234", "body": "Hello!", "device_id": "d1", "device_name": "Pixel 7"},
    },
    separators=(",", ":"),
).encode()


def server_signature(body, secret):
    # Same computation as backend/internal/services/webhook.go deliver():
    # HMAC-SHA256 keyed with the whole secret string, hex, "sha256=" prefix.
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_valid_signature_bytes():
    assert verify_webhook_signature(BODY, server_signature(BODY, SECRET), SECRET)


def test_valid_signature_str_payload():
    assert verify_webhook_signature(BODY.decode(), server_signature(BODY, SECRET), SECRET)


def test_compute_matches_server():
    assert compute_signature(BODY, SECRET) == server_signature(BODY, SECRET)


def test_known_vector():
    # Fixed vector so a change to the algorithm cannot pass silently.
    assert (
        compute_signature(b'{"event":"message.received"}', "whsec_test")
        == "sha256=" + hmac.new(b"whsec_test", b'{"event":"message.received"}', hashlib.sha256).hexdigest()
    )


@pytest.mark.parametrize(
    "sig",
    [None, "", "sha256=deadbeef", server_signature(BODY, "whsec_other"), server_signature(BODY, SECRET)[len("sha256="):]],
)
def test_invalid_signatures(sig):
    assert verify_webhook_signature(BODY, sig, SECRET) is False


def test_tampered_body():
    sig = server_signature(BODY, SECRET)
    assert verify_webhook_signature(BODY.replace(b"Hello", b"Hullo"), sig, SECRET) is False


def test_empty_secret_is_false():
    assert verify_webhook_signature(BODY, server_signature(BODY, ""), "") is False


def test_parse_webhook():
    event = parse_webhook(BODY, server_signature(BODY, SECRET), SECRET)
    assert event["event"] == "message.received"
    assert event["data"]["from"] == "+14155551234"


def test_parse_webhook_rejects_bad_signature():
    with pytest.raises(WebhookSignatureError):
        parse_webhook(BODY, "sha256=00", SECRET)
