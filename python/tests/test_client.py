import datetime as dt

import pytest
import requests

import androidtexter
from androidtexter import (
    APIConnectionError,
    AndroidTexterError,
    AuthenticationError,
    BadRequestError,
    Client,
    InternalServerError,
    NotFoundError,
    RateLimitError,
)

BASE = "https://androidtexter.com"


# ---------------------------------------------------------------- setup


def test_reads_api_key_from_env(monkeypatch, session):
    monkeypatch.setenv("ANDROIDTEXTER_API_KEY", "atx_from_env")
    c = Client(session=session)
    c.me()
    assert session.last["headers"]["X-API-Key"] == "atx_from_env"


def test_missing_api_key_raises():
    with pytest.raises(AndroidTexterError, match="ANDROIDTEXTER_API_KEY"):
        Client()


def test_base_url_variants(session):
    for given in ["https://example.test", "https://example.test/", "https://example.test/api", "https://example.test/api/"]:
        c = Client(api_key="atx_x", base_url=given, session=session)
        c.me()
        assert session.last["url"] == "https://example.test/api/me"


def test_base_url_from_env(monkeypatch, session):
    monkeypatch.setenv("ANDROIDTEXTER_BASE_URL", "http://localhost:8080")
    Client(api_key="atx_x", session=session).list_devices()
    assert session.last["url"] == "http://localhost:8080/api/devices"


def test_headers_and_timeout(client, session):
    client.me()
    h = session.last["headers"]
    assert h["X-API-Key"] == "atx_test"
    assert h["User-Agent"] == "androidtexter-python/" + androidtexter.__version__
    assert session.last["timeout"] == 30.0


def test_alias_and_context_manager(session):
    with androidtexter.AndroidTexter(api_key="atx_x", session=session) as c:
        assert isinstance(c, Client)


# ---------------------------------------------------------------- errors


def test_error_carries_status_and_server_message(client, session):
    session.queue(400, {"error": "Phone and message are required"})
    with pytest.raises(BadRequestError) as ei:
        client.send_message("", "")
    e = ei.value
    assert e.status == 400
    assert e.message == "Phone and message are required"
    assert e.body == {"error": "Phone and message are required"}
    assert str(e) == "[400] Phone and message are required"


@pytest.mark.parametrize(
    "status,cls",
    [(401, AuthenticationError), (404, NotFoundError), (429, RateLimitError), (500, InternalServerError), (503, InternalServerError)],
)
def test_error_classes(client, session, status, cls):
    session.queue(status, {"error": "nope"})
    with pytest.raises(cls) as ei:
        client.list_devices()
    assert isinstance(ei.value, androidtexter.APIError)
    assert ei.value.status == status


def test_rate_limit_upgrade_flag(client, session):
    session.queue(429, {"error": "Daily message limit reached. Upgrade to Pro for unlimited.", "upgrade": True})
    with pytest.raises(RateLimitError) as ei:
        client.send_message("+15551234567", "hi")
    assert ei.value.upgrade is True


def test_non_json_error_body(client, session):
    session.queue(502, text="<html>Bad Gateway</html>", reason="Bad Gateway")
    with pytest.raises(InternalServerError) as ei:
        client.list_devices()
    assert ei.value.status == 502
    assert "Bad Gateway" in ei.value.message


def test_connection_error(client, session):
    session.raise_exc = requests.ConnectionError("boom")
    with pytest.raises(APIConnectionError):
        client.list_devices()


# ---------------------------------------------------------------- messages


def test_send_message_minimal(client, session):
    session.queue(200, {"status": 200, "message_id": "m1", "device_id": "d1", "device_name": "Pixel"})
    out = client.send_message("+15551234567", "Hello")
    call = session.last
    assert call["method"] == "POST"
    assert call["url"] == BASE + "/api/messages/send"
    assert call["json"] == {"phone": "+15551234567", "message": "Hello"}
    assert out["message_id"] == "m1"


def test_send_message_all_options(client, session):
    when = dt.datetime(2026, 12, 1, 9, 0, 0, 123456, tzinfo=dt.timezone(dt.timedelta(hours=-5)))
    client.send_message(
        ["+15551234567", "+15557654321"],
        "Group hi",
        device_id="d1",
        media_url="https://example.com/a.jpg",
        scheduled_at=when,
        thread_id="42",
        sim_slot=1,
        country="GB",
    )
    assert session.last["json"] == {
        "phone": "+15551234567,+15557654321",
        "message": "Group hi",
        "device_id": "d1",
        "media_url": "https://example.com/a.jpg",
        "scheduled_at": "2026-12-01T14:00:00Z",
        "thread_id": "42",
        "sim_slot": 1,
        "country": "GB",
    }


def test_send_message_sim_slot_zero_is_sent(client, session):
    client.send_message("+15551234567", "x", sim_slot=0)
    assert session.last["json"]["sim_slot"] == 0


def test_send_message_scheduled_string_passthrough(client, session):
    client.send_message("+15551234567", "x", scheduled_at="2026-12-01T09:00:00Z")
    assert session.last["json"]["scheduled_at"] == "2026-12-01T09:00:00Z"


def test_send_message_naive_datetime_rejected(client, session):
    with pytest.raises(ValueError):
        client.send_message("+15551234567", "x", scheduled_at=dt.datetime(2026, 12, 1, 9))
    assert session.calls == []


def test_send_sms_alias(client, session):
    client.send_sms("+15551234567", "x")
    assert session.last["url"] == BASE + "/api/messages/send"


def test_get_message_status(client, session):
    session.queue(200, {"id": "m1", "status": "sent", "phone": "+15551234567"})
    out = client.get_message_status("m1")
    assert session.last["method"] == "GET"
    assert session.last["url"] == BASE + "/api/v1/messages/status/m1"
    assert out["status"] == "sent"


def test_send_broadcast(client, session):
    session.queue(200, {"sent": 2, "failed": 0, "total": 2, "results": []})
    out = client.send_broadcast(["+15551234567", "+15557654321"], "Hi {{first_name|there}}")
    assert session.last["url"] == BASE + "/api/messages/broadcast"
    assert session.last["json"] == {"phones": ["+15551234567", "+15557654321"], "message": "Hi {{first_name|there}}"}
    assert out["sent"] == 2


def test_send_broadcast_device_id_implies_specific(client, session):
    client.send_broadcast(["+15551234567"], "x", device_id="d1")
    assert session.last["json"]["device_mode"] == "specific"
    assert session.last["json"]["device_id"] == "d1"


def test_send_broadcast_round_robin(client, session):
    client.send_broadcast(("+15551234567",), "x", device_mode="round-robin", media_url="https://e.com/a.png", country="CA")
    j = session.last["json"]
    assert j["device_mode"] == "round-robin"
    assert j["media_url"] == "https://e.com/a.png"
    assert j["country"] == "CA"


@pytest.mark.parametrize(
    "direction,path", [(None, "/api/messages"), ("inbound", "/api/messages/received"), ("outbound", "/api/messages/sent")]
)
def test_list_messages(client, session, direction, path):
    session.queue(200, {"messages": [{"id": "a"}], "page": 2, "limit": 10})
    out = client.list_messages(direction=direction, page=2, limit=10)
    assert session.last["url"] == BASE + path
    assert session.last["params"] == {"page": 2, "limit": 10}
    assert out == [{"id": "a"}]


def test_list_messages_bad_direction(client):
    with pytest.raises(ValueError):
        client.list_messages(direction="sideways")


def test_list_messages_omits_unset_params(client, session):
    client.list_messages()
    assert not session.last["params"]


def test_search_messages(client, session):
    session.queue(200, {"messages": [], "total": 0, "page": 1, "query": "invoice"})
    out = client.search_messages("invoice", limit=5)
    assert session.last["url"] == BASE + "/api/messages/search"
    assert session.last["params"] == {"q": "invoice", "limit": 5}
    assert out["query"] == "invoice"


# ---------------------------------------------------------------- conversations


def test_list_conversations(client, session):
    session.queue(200, {"conversations": [{"thread_ref": "t1"}]})
    out = client.list_conversations(view="inbox", limit=100)
    assert session.last["url"] == BASE + "/api/messages/conversations"
    assert session.last["params"] == {"view": "inbox", "limit": 100}
    assert out[0]["thread_ref"] == "t1"


def test_list_conversations_legacy_filter(client, session):
    client.list_conversations(filter="spam")
    assert session.last["params"] == {"filter": "spam"}


def test_get_conversation_history(client, session):
    session.queue(200, {"messages": [{"id": "x"}], "thread_ref": "t1", "phone": "+15551234567", "page": 1, "limit": 200})
    out = client.get_conversation_history("+15551234567", thread_ref="t1", limit=20)
    assert session.last["url"] == BASE + "/api/messages/thread"
    assert session.last["params"] == {"phone": "+15551234567", "thread_ref": "t1", "limit": 20}
    assert out["thread_ref"] == "t1"
    assert out["messages"][0]["id"] == "x"


def test_get_conversation_history_group_and_thread_id(client, session):
    session.queue(200, {"messages": None, "thread_ref": ""})
    out = client.get_conversation_history(["+15551234567", "+15557654321"], thread_id="42")
    assert session.last["params"] == {"phone": "+15551234567,+15557654321", "thread_id": "42"}
    assert out["messages"] == []


def test_get_conversation_counts(client, session):
    session.queue(200, {"counts": {"all": 3, "inbox": 1, "outbox": 2, "archived": 0, "spam": 0}})
    assert client.get_conversation_counts()["outbox"] == 2
    assert session.last["url"] == BASE + "/api/messages/conversations/counts"


def test_archive_conversation(client, session):
    session.queue(200, {"success": True, "thread_ref": "t1", "archived": False})
    client.archive_conversation(thread_ref="t1", archived=False)
    assert session.last["method"] == "POST"
    assert session.last["url"] == BASE + "/api/messages/conversations/archive"
    assert session.last["json"] == {"thread_ref": "t1", "archived": False}


def test_archive_conversation_requires_identity(client):
    with pytest.raises(ValueError):
        client.archive_conversation()


# ---------------------------------------------------------------- scheduled


def test_list_scheduled_messages_null_becomes_list(client, session):
    # The server answers {"scheduled_messages": null} when there are none.
    session.queue(200, {"scheduled_messages": None})
    assert client.list_scheduled_messages() == []
    assert session.last["url"] == BASE + "/api/messages/scheduled"


def test_cancel_scheduled_message(client, session):
    session.queue(200, {"message": "Scheduled message cancelled"})
    client.cancel_scheduled_message("m/1")
    assert session.last["method"] == "DELETE"
    assert session.last["url"] == BASE + "/api/messages/scheduled/m%2F1"


def test_cancel_scheduled_message_not_found(client, session):
    session.queue(404, {"error": "message not found or not pending"})
    with pytest.raises(NotFoundError, match="not pending"):
        client.cancel_scheduled_message("m1")


# ---------------------------------------------------------------- devices


def test_list_devices(client, session):
    session.queue(200, {"devices": [{"id": "d1", "status": "online"}]})
    assert client.list_devices() == [{"id": "d1", "status": "online"}]
    assert session.last["url"] == BASE + "/api/devices"


def test_get_device(client, session):
    session.queue(200, {"device": {"id": "d1"}})
    assert client.get_device("d1") == {"id": "d1"}
    assert session.last["url"] == BASE + "/api/devices/d1"


# ---------------------------------------------------------------- contacts


def test_list_contacts(client, session):
    session.queue(200, {"contacts": [], "total": 0, "page": 1})
    out = client.list_contacts(search="jane", tag="vip")
    assert session.last["url"] == BASE + "/api/contacts"
    assert session.last["params"] == {"search": "jane", "tag": "vip"}
    assert out["total"] == 0


def test_get_contact_encodes_plus(client, session):
    session.queue(200, {"contact": {"id": "c1"}})
    assert client.get_contact("+15551234567")["id"] == "c1"
    assert session.last["url"] == BASE + "/api/contacts/%2B15551234567"


def test_upsert_contact(client, session):
    session.queue(201, {"contact": {"id": "c1", "phone": "+15551234567"}})
    out = client.upsert_contact("+15551234567", name="Jane", tags=["vip"])
    assert session.last["method"] == "POST"
    assert session.last["url"] == BASE + "/api/contacts"
    assert session.last["json"] == {"phone": "+15551234567", "name": "Jane", "tags": ["vip"]}
    assert out["id"] == "c1"


def test_update_contact_sends_full_body(client, session):
    session.queue(200, {"contact": {"id": "c1"}})
    client.update_contact("c1", phone="+15551234567", name="Jane")
    assert session.last["method"] == "PUT"
    assert session.last["url"] == BASE + "/api/contacts/c1"
    assert session.last["json"] == {
        "phone": "+15551234567",
        "name": "Jane",
        "email": None,
        "company": None,
        "notes": None,
        "tags": [],
    }


def test_delete_contact(client, session):
    client.delete_contact("c1")
    assert session.last["method"] == "DELETE"
    assert session.last["url"] == BASE + "/api/contacts/c1"


def test_bulk_upsert_contacts(client, session):
    session.queue(200, {"message": "Bulk import complete", "imported": 2, "total": 2})
    out = client.bulk_upsert_contacts([{"phone": "+15551234567", "name": None}, {"phone": "+15557654321", "tags": ["a"]}])
    assert session.last["url"] == BASE + "/api/contacts/bulk"
    assert session.last["json"] == {"contacts": [{"phone": "+15551234567"}, {"phone": "+15557654321", "tags": ["a"]}]}
    assert out["imported"] == 2


def test_list_contact_tags(client, session):
    session.queue(200, {"tags": ["a", "b"]})
    assert client.list_contact_tags() == ["a", "b"]
    assert session.last["url"] == BASE + "/api/contacts/tags"


# ---------------------------------------------------------------- webhooks


def test_create_webhook(client, session):
    session.queue(201, {"webhook": {"id": "w1"}, "secret": "whsec_abc", "message": "Save this secret"})
    out = client.create_webhook("https://example.com/hook", events=["message.received"])
    assert session.last["method"] == "POST"
    assert session.last["url"] == BASE + "/api/v1/webhooks"
    assert session.last["json"] == {"url": "https://example.com/hook", "events": ["message.received"]}
    assert out["secret"] == "whsec_abc"


def test_create_webhook_default_events_left_to_server(client, session):
    client.create_webhook("https://example.com/hook")
    assert session.last["json"] == {"url": "https://example.com/hook"}


def test_list_webhooks(client, session):
    session.queue(200, {"webhooks": [{"id": "w1"}]})
    assert client.list_webhooks() == [{"id": "w1"}]
    assert session.last["url"] == BASE + "/api/v1/webhooks"


def test_delete_webhook(client, session):
    session.queue(200, {"success": True})
    client.delete_webhook("w1")
    assert session.last["method"] == "DELETE"
    assert session.last["url"] == BASE + "/api/v1/webhooks/w1"


# ---------------------------------------------------------------- escape hatch


def test_request_escape_hatch(client, session):
    session.queue(200, {"quick_replies": []})
    client.request("GET", "/api/quick-replies", params={"x": True, "y": None})
    assert session.last["url"] == BASE + "/api/quick-replies"
    assert session.last["params"] == {"x": "true"}


def test_network_guard_is_active():
    # Proves the conftest guard: a real Session cannot connect anywhere.
    c = Client(api_key="atx_x", base_url="http://127.0.0.1:9")
    with pytest.raises((APIConnectionError, RuntimeError)):
        c.me()
