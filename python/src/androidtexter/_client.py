"""HTTP client for the Android Texter REST API."""

from __future__ import annotations

import datetime as _dt
import os
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Union, cast
from urllib.parse import quote

import requests

from ._errors import APIConnectionError, AndroidTexterError, error_for_status
from ._types import (
    Account,
    ArchiveResult,
    BroadcastResult,
    BulkContactResult,
    Contact,
    ContactList,
    Conversation,
    ConversationCounts,
    ConversationHistory,
    CreatedWebhook,
    Device,
    Message,
    MessageStatus,
    SearchResult,
    SendMessageResult,
    Webhook,
)
from ._version import __version__

DEFAULT_BASE_URL = "https://androidtexter.com"
DEFAULT_TIMEOUT = 30.0

PhoneArg = Union[str, Sequence[str]]
DateArg = Union[str, _dt.datetime]


def _join_phones(phone: PhoneArg) -> str:
    """A group conversation is named by its members, comma-joined."""
    if isinstance(phone, str):
        return phone
    return ",".join(p.strip() for p in phone)


def _format_time(value: DateArg) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, _dt.datetime):
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise ValueError(
                "scheduled_at must be timezone-aware, for example "
                "datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc)"
            )
        utc = value.astimezone(_dt.timezone.utc).replace(microsecond=0)
        return utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    raise TypeError("scheduled_at must be a str or datetime")


def _drop_none(d: Mapping[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


class Client:
    """Client for the Android Texter API.

    Android Texter sends SMS and MMS from your own Android phone, with your
    own number. Pair a phone in the dashboard, create an API key at
    https://androidtexter.com/dashboard/settings/api-keys, then::

        from androidtexter import Client

        client = Client()  # reads ANDROIDTEXTER_API_KEY
        client.send_message("+15551234567", "Hello from Python")

    Args:
        api_key: Your ``atx_...`` key. Defaults to the ``ANDROIDTEXTER_API_KEY``
            environment variable.
        base_url: Site origin. Defaults to ``ANDROIDTEXTER_BASE_URL`` or
            ``https://androidtexter.com``. A trailing ``/api`` is accepted.
        timeout: Seconds to wait for each request. Default 30.
        session: Optional ``requests.Session`` to reuse connections or add
            proxies, retries, or logging.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        session: Optional[requests.Session] = None,
    ) -> None:
        key = api_key if api_key is not None else os.environ.get("ANDROIDTEXTER_API_KEY")
        if not key:
            raise AndroidTexterError(
                "No API key. Pass Client(api_key='atx_...') or set the "
                "ANDROIDTEXTER_API_KEY environment variable. Create a key at "
                "https://androidtexter.com/dashboard/settings/api-keys"
            )
        self.api_key = key
        url = base_url or os.environ.get("ANDROIDTEXTER_BASE_URL") or DEFAULT_BASE_URL
        url = url.rstrip("/")
        if url.endswith("/api"):
            url = url[: -len("/api")]
        self.base_url = url
        self.timeout = timeout
        self._session = session or requests.Session()

    def __repr__(self) -> str:
        return "Client(base_url=%r)" % self.base_url

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        """Close the underlying HTTP session."""
        self._session.close()

    # ------------------------------------------------------------------
    # Transport
    # ------------------------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json: Any = None,
    ) -> Any:
        """Call any API-key endpoint directly and return the decoded JSON.

        ``path`` starts with ``/api``, for example ``"/api/quick-replies"``.
        Use this for endpoints that do not have a method of their own yet.
        """
        url = self.base_url + path
        headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
            "User-Agent": "androidtexter-python/%s" % __version__,
        }
        clean_params = None
        if params:
            clean_params = {}
            for k, v in params.items():
                if v is None:
                    continue
                if isinstance(v, bool):
                    v = "true" if v else "false"
                clean_params[k] = v
        try:
            resp = self._session.request(
                method,
                url,
                params=clean_params,
                json=json,
                headers=headers,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise APIConnectionError("Request to %s failed: %s" % (url, exc)) from exc

        try:
            body: Any = resp.json()
        except ValueError:
            body = resp.text

        if resp.status_code >= 400:
            message = None
            if isinstance(body, dict):
                message = body.get("error") or body.get("message")
            if not message:
                message = (body if isinstance(body, str) and body else resp.reason) or "HTTP %d" % resp.status_code
            raise error_for_status(resp.status_code, str(message), body)
        return body

    # ------------------------------------------------------------------
    # Account
    # ------------------------------------------------------------------

    def me(self) -> Account:
        """Return the account the key belongs to: user, plan, today's usage.

        Calls ``GET /api/me``. Handy as a connection test.
        """
        return cast(Account, self.request("GET", "/api/me"))

    # ------------------------------------------------------------------
    # Messages
    # ------------------------------------------------------------------

    def send_message(
        self,
        phone: PhoneArg,
        message: str,
        *,
        device_id: Optional[str] = None,
        media_url: Optional[str] = None,
        scheduled_at: Optional[DateArg] = None,
        thread_id: Optional[str] = None,
        sim_slot: Optional[int] = None,
        country: Optional[str] = None,
    ) -> SendMessageResult:
        """Send an SMS, or an MMS when ``media_url`` is set, from your phone.

        Calls ``POST /api/messages/send``. The message is queued and pushed to
        the phone; use :meth:`get_message_status` to follow it.

        Args:
            phone: Recipient, ideally E.164 (``+15551234567``). Local formats
                are read in the sending SIM's country. A list of up to 25
                numbers sends one group message.
            message: Text body, up to 1600 characters.
            device_id: Send from this paired phone. Default: the first online one.
            media_url: Public HTTPS URL of an image or file, which makes it an MMS.
            scheduled_at: Send later. A timezone-aware ``datetime`` or an RFC
                3339 string such as ``"2026-12-01T09:00:00Z"``. Must be in the future.
            thread_id: Join an existing group thread (from a received message).
            sim_slot: Dual-SIM phones only. 0 for SIM 1, 1 for SIM 2.
            country: ISO 3166 alpha-2 code (``"GB"``) to read a local-format
                ``phone`` in. Ignored when ``phone`` has a country code.

        Returns:
            ``message_id``, ``device_id``, ``device_name``, ``phone_number``
            (the sending phone's number, when known), and for scheduled sends
            ``scheduled_at`` and ``scheduler_status``.
        """
        body = _drop_none(
            {
                "phone": _join_phones(phone),
                "message": message,
                "device_id": device_id,
                "media_url": media_url,
                "scheduled_at": _format_time(scheduled_at) if scheduled_at is not None else None,
                "thread_id": thread_id,
                "sim_slot": sim_slot,
                "country": country,
            }
        )
        return cast(SendMessageResult, self.request("POST", "/api/messages/send", json=body))

    #: Alias of :meth:`send_message`.
    send_sms = send_message

    def get_message_status(self, message_id: str) -> MessageStatus:
        """Return ``{id, status, phone}`` for a message you sent.

        ``status`` is ``queued`` until the phone reports back, then ``sent``
        or ``failed``. A message still queued after 24 hours is marked
        ``failed``; a cancelled scheduled message reads ``cancelled``.
        Calls ``GET /api/v1/messages/status/{id}``.
        """
        return cast(
            MessageStatus,
            self.request("GET", "/api/v1/messages/status/%s" % quote(message_id, safe="")),
        )

    def send_broadcast(
        self,
        phones: Iterable[str],
        message: str,
        *,
        media_url: Optional[str] = None,
        device_id: Optional[str] = None,
        device_mode: Optional[str] = None,
        country: Optional[str] = None,
    ) -> BroadcastResult:
        """Send the same message to up to 500 recipients, one text each.

        Calls ``POST /api/messages/broadcast``. The body may use
        ``{{first_name}}``, ``{{last_name}}``, ``{{name}}``, ``{{company}}``,
        ``{{city}}``, ``{{state}}`` and similar tokens, filled from each
        recipient's contact. ``{{first_name|there}}`` supplies a fallback.

        Args:
            phones: Recipient numbers, at most 500.
            message: Text body, up to 1600 characters.
            media_url: Same image for every recipient, which makes it MMS.
            device_id: Send every message from this phone. Setting it implies
                ``device_mode="specific"``; the server ignores ``device_id``
                in any other mode.
            device_mode: ``"auto"`` (first online phone, default),
                ``"specific"`` (needs ``device_id``) or ``"round-robin"``
                (spread across online phones).
            country: ISO 3166 alpha-2 code to read local-format numbers in.

        Returns:
            ``sent``, ``failed``, ``total`` and a per-recipient ``results``
            list of ``{phone, message_id, status, device_id, error}``.
        """
        mode = device_mode
        if device_id is not None and mode is None:
            mode = "specific"
        body = _drop_none(
            {
                "phones": list(phones),
                "message": message,
                "media_url": media_url,
                "device_id": device_id,
                "device_mode": mode,
                "country": country,
            }
        )
        return cast(BroadcastResult, self.request("POST", "/api/messages/broadcast", json=body))

    def list_messages(
        self,
        *,
        direction: Optional[str] = None,
        page: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Message]:
        """List messages, newest first.

        Args:
            direction: ``"inbound"`` (``GET /api/messages/received``),
                ``"outbound"`` (``GET /api/messages/sent``) or ``None`` for
                both (``GET /api/messages``).
            page: 1-based page number. Default 1.
            limit: Page size, 1 to 100. Default 50.
        """
        paths = {None: "/api/messages", "inbound": "/api/messages/received", "outbound": "/api/messages/sent"}
        if direction not in paths:
            raise ValueError('direction must be "inbound", "outbound" or None')
        data = self.request("GET", paths[direction], params={"page": page, "limit": limit})
        return cast(List[Message], (data or {}).get("messages") or [])

    def search_messages(
        self, query: str, *, page: Optional[int] = None, limit: Optional[int] = None
    ) -> SearchResult:
        """Full-text search across every message. Returns ``{messages, total, page, query}``.

        Calls ``GET /api/messages/search``. ``limit`` is 1 to 100, default 50.
        """
        return cast(
            SearchResult,
            self.request("GET", "/api/messages/search", params={"q": query, "page": page, "limit": limit}),
        )

    # ------------------------------------------------------------------
    # Conversations
    # ------------------------------------------------------------------

    def list_conversations(
        self,
        *,
        view: Optional[str] = None,
        limit: Optional[int] = None,
        filter: Optional[str] = None,
    ) -> List[Conversation]:
        """List conversations, most recent activity first.

        Calls ``GET /api/messages/conversations``. Each row carries
        ``thread_ref`` (the conversation id), ``phone`` (comma-joined for
        groups), ``last_message``, ``last_at``, ``message_count`` and more.

        Args:
            view: ``"inbox"`` (someone replied), ``"outbox"`` (no reply yet),
                ``"archived"``, ``"spam"`` or ``"all"`` (all but archived and spam).
            limit: 1 to 2000. Default 50.
            filter: Legacy parameter, used only when ``view`` is not set:
                ``"inbox"`` (default, everything except spam), ``"spam"``, or
                ``"all"`` (everything including spam).
        """
        data = self.request(
            "GET", "/api/messages/conversations", params={"view": view, "filter": filter, "limit": limit}
        )
        return cast(List[Conversation], (data or {}).get("conversations") or [])

    def get_conversation_history(
        self,
        phone: PhoneArg,
        *,
        thread_ref: Optional[str] = None,
        thread_id: Optional[str] = None,
        page: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> ConversationHistory:
        """Return the messages in one conversation, newest first.

        Calls ``GET /api/messages/thread``. ``phone`` is always required by the
        server. For a group, pass ``thread_ref`` (from :meth:`list_conversations`
        or a message) or ``thread_id`` (from a received message) as well, or
        pass the members as a list; otherwise you get the one-to-one thread
        with ``phone``.

        Args:
            phone: The other party's number, or a group's members.
            thread_ref: The conversation id. Preferred when known.
            thread_id: The phone-side thread id of a group.
            page: 1-based page. Default 1.
            limit: Page size, 1 to 5000. Default 200.

        Returns:
            ``messages``, ``thread_ref``, ``phone``, ``page``, ``limit`` and
            ``preferred_sim_slot``.
        """
        data = self.request(
            "GET",
            "/api/messages/thread",
            params={
                "phone": _join_phones(phone),
                "thread_ref": thread_ref,
                "thread_id": thread_id,
                "page": page,
                "limit": limit,
            },
        )
        if isinstance(data, dict) and data.get("messages") is None:
            data["messages"] = []
        return cast(ConversationHistory, data)

    def get_conversation_counts(self) -> ConversationCounts:
        """How many conversations are in each view. Calls ``GET /api/messages/conversations/counts``."""
        data = self.request("GET", "/api/messages/conversations/counts")
        return cast(ConversationCounts, (data or {}).get("counts") or {})

    def archive_conversation(
        self,
        *,
        thread_ref: Optional[str] = None,
        phone: Optional[PhoneArg] = None,
        thread_id: Optional[str] = None,
        archived: bool = True,
    ) -> ArchiveResult:
        """Move a conversation into the Archived view, or out with ``archived=False``.

        Calls ``POST /api/messages/conversations/archive``. Identify the
        conversation by ``thread_ref``, ``phone`` or ``thread_id``. Archiving
        changes only which view it is listed in; a new inbound message
        unarchives it.
        """
        if thread_ref is None and phone is None and thread_id is None:
            raise ValueError("Pass thread_ref, phone or thread_id")
        body = _drop_none(
            {
                "thread_ref": thread_ref,
                "phone": _join_phones(phone) if phone is not None else None,
                "thread_id": thread_id,
                "archived": archived,
            }
        )
        return cast(ArchiveResult, self.request("POST", "/api/messages/conversations/archive", json=body))

    # ------------------------------------------------------------------
    # Scheduled messages
    # ------------------------------------------------------------------

    def list_scheduled_messages(self) -> List[Message]:
        """Messages waiting to go out at a future time, soonest first.

        Calls ``GET /api/messages/scheduled``. Schedule one with
        ``send_message(..., scheduled_at=...)``.
        """
        data = self.request("GET", "/api/messages/scheduled")
        return cast(List[Message], (data or {}).get("scheduled_messages") or [])

    def cancel_scheduled_message(self, message_id: str) -> Dict[str, Any]:
        """Cancel a scheduled message that has not gone out yet.

        Calls ``DELETE /api/messages/scheduled/{id}``. Raises
        :class:`NotFoundError` if it already went, was cancelled, or does not exist.
        """
        return cast(
            Dict[str, Any],
            self.request("DELETE", "/api/messages/scheduled/%s" % quote(message_id, safe="")),
        )

    # ------------------------------------------------------------------
    # Devices
    # ------------------------------------------------------------------

    def list_devices(self) -> List[Device]:
        """Every paired phone with ``status`` (``online``/``offline``), battery and SIMs.

        Calls ``GET /api/devices``.
        """
        data = self.request("GET", "/api/devices")
        return cast(List[Device], (data or {}).get("devices") or [])

    def get_device(self, device_id: str) -> Device:
        """One paired phone. Calls ``GET /api/devices/{id}``."""
        data = self.request("GET", "/api/devices/%s" % quote(device_id, safe=""))
        return cast(Device, data["device"])

    # ------------------------------------------------------------------
    # Contacts
    # ------------------------------------------------------------------

    def list_contacts(
        self,
        *,
        search: Optional[str] = None,
        tag: Optional[str] = None,
        page: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> ContactList:
        """List contacts. Returns ``{contacts, total, page}``.

        Calls ``GET /api/contacts``. ``search`` matches phone, name, email,
        company or carrier; ``tag`` keeps contacts carrying that tag.
        """
        return cast(
            ContactList,
            self.request(
                "GET", "/api/contacts", params={"search": search, "tag": tag, "page": page, "limit": limit}
            ),
        )

    def get_contact(self, phone: str) -> Contact:
        """Look up one contact by phone number. Calls ``GET /api/contacts/{phone}``."""
        data = self.request("GET", "/api/contacts/%s" % quote(phone, safe=""))
        return cast(Contact, data["contact"])

    def upsert_contact(
        self,
        phone: str,
        *,
        name: Optional[str] = None,
        email: Optional[str] = None,
        company: Optional[str] = None,
        notes: Optional[str] = None,
        tags: Optional[Sequence[str]] = None,
    ) -> Contact:
        """Create a contact, or update the one that already has this phone number.

        Calls ``POST /api/contacts``. Safe to retry. On an existing contact,
        fields you pass overwrite, fields you leave out are kept, and
        ``tags`` are added to the existing tags rather than replacing them.
        """
        body = _drop_none(
            {
                "phone": phone,
                "name": name,
                "email": email,
                "company": company,
                "notes": notes,
                "tags": list(tags) if tags is not None else None,
            }
        )
        data = self.request("POST", "/api/contacts", json=body)
        return cast(Contact, data.get("contact", data))

    def update_contact(
        self,
        contact_id: str,
        *,
        phone: str,
        name: Optional[str] = None,
        email: Optional[str] = None,
        company: Optional[str] = None,
        notes: Optional[str] = None,
        tags: Optional[Sequence[str]] = None,
    ) -> Contact:
        """Replace a contact's details by id.

        Calls ``PUT /api/contacts/{id}``. This is a full replace: any of
        ``name``, ``email``, ``company``, ``notes`` you leave out is cleared,
        and ``tags`` is replaced (an omitted ``tags`` clears them). To change
        one field and keep the rest, use :meth:`upsert_contact` instead.

        ``phone`` is required by the server but is not changed by this call.
        """
        body = {
            "phone": phone,
            "name": name,
            "email": email,
            "company": company,
            "notes": notes,
            "tags": list(tags) if tags is not None else [],
        }
        data = self.request("PUT", "/api/contacts/%s" % quote(contact_id, safe=""), json=body)
        return cast(Contact, data.get("contact", data))

    def delete_contact(self, contact_id: str) -> Dict[str, Any]:
        """Delete a contact by id. Calls ``DELETE /api/contacts/{id}``."""
        return cast(Dict[str, Any], self.request("DELETE", "/api/contacts/%s" % quote(contact_id, safe="")))

    def bulk_upsert_contacts(self, contacts: Iterable[Mapping[str, Any]]) -> BulkContactResult:
        """Upsert up to 5000 contacts in one call. Returns ``{imported, total}``.

        Calls ``POST /api/contacts/bulk``. Each item is a dict with ``phone``
        and optionally ``name``, ``email``, ``company``, ``notes``, ``tags``,
        merged the same way as :meth:`upsert_contact`.
        """
        items = [_drop_none(dict(c)) for c in contacts]
        return cast(BulkContactResult, self.request("POST", "/api/contacts/bulk", json={"contacts": items}))

    def list_contact_tags(self) -> List[str]:
        """Every distinct tag in use on your contacts. Calls ``GET /api/contacts/tags``."""
        data = self.request("GET", "/api/contacts/tags")
        return cast(List[str], (data or {}).get("tags") or [])

    # ------------------------------------------------------------------
    # Webhooks
    # ------------------------------------------------------------------

    def create_webhook(self, url: str, *, events: Optional[Sequence[str]] = None) -> CreatedWebhook:
        """Register a public http(s) URL to receive events.

        Calls ``POST /api/v1/webhooks``. ``events`` defaults to
        ``["message.received", "message.sent"]``.

        Returns ``{webhook, secret, message}``. The ``secret`` (``whsec_...``)
        is shown only once: store it and pass it to
        :func:`verify_webhook_signature` for every delivery.
        """
        body: Dict[str, Any] = {"url": url}
        if events is not None:
            body["events"] = list(events)
        return cast(CreatedWebhook, self.request("POST", "/api/v1/webhooks", json=body))

    def list_webhooks(self) -> List[Webhook]:
        """Every webhook on the account. Calls ``GET /api/v1/webhooks``."""
        data = self.request("GET", "/api/v1/webhooks")
        return cast(List[Webhook], (data or {}).get("webhooks") or [])

    def delete_webhook(self, webhook_id: str) -> Dict[str, Any]:
        """Remove a webhook. Calls ``DELETE /api/v1/webhooks/{id}``."""
        return cast(
            Dict[str, Any], self.request("DELETE", "/api/v1/webhooks/%s" % quote(webhook_id, safe=""))
        )
