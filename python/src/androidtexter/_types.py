"""Response shapes returned by the Android Texter API.

These are ``TypedDict`` hints for editors and type checkers. At runtime every
value is a plain ``dict`` decoded from JSON, so fields the server adds later
are still there even if they are not listed here.
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional, TypedDict

MessageDirection = Literal["inbound", "outbound"]
ConversationView = Literal["inbox", "outbox", "archived", "spam", "all"]
DeviceMode = Literal["auto", "specific", "round-robin"]
WebhookEventName = Literal["message.received", "message.sent"]


class DeviceSim(TypedDict, total=False):
    slot: int
    label: str
    number: str
    country: str


class Device(TypedDict, total=False):
    id: str
    user_id: str
    device_name: str
    friendly_name: Optional[str]
    phone_number: Optional[str]
    status: str
    battery_level: Optional[int]
    last_seen: str
    created_at: str
    sims: List[DeviceSim]
    is_default_sms: Optional[bool]


class Message(TypedDict, total=False):
    id: str
    user_id: str
    device_id: str
    direction: str
    phone: str
    body: str
    status: str
    media_url: str
    media_type: str
    api_key_id: str
    scheduled_at: str
    scheduler_status: str
    thread_id: str
    thread_type: str
    participants: List[str]
    thread_ref: str
    created_at: str
    sim_slot: int
    sim_label: str


class SendMessageResult(TypedDict, total=False):
    status: int
    message_id: str
    device_id: str
    device_name: str
    phone_number: str
    message: str
    scheduled_at: str
    scheduler_status: str


class MessageStatus(TypedDict, total=False):
    id: str
    status: str
    phone: str


class BroadcastRecipientResult(TypedDict, total=False):
    phone: str
    message_id: str
    status: str
    device_id: str
    error: str


class BroadcastResult(TypedDict, total=False):
    sent: int
    failed: int
    total: int
    results: List[BroadcastRecipientResult]


class Conversation(TypedDict, total=False):
    thread_ref: str
    thread_id: str
    phone: str
    participants: List[str]
    contact_name: str
    last_message: str
    last_direction: str
    last_at: str
    message_count: int
    device_id: Optional[str]
    device_name: Optional[str]
    device_phone: Optional[str]
    thread_type: str
    archived: bool
    archived_at: str
    has_inbound: bool


class ConversationHistory(TypedDict, total=False):
    messages: List[Message]
    page: int
    limit: int
    phone: str
    thread_ref: str
    preferred_sim_slot: Optional[int]


class ConversationCounts(TypedDict, total=False):
    all: int
    inbox: int
    outbox: int
    archived: int
    spam: int


class ArchiveResult(TypedDict, total=False):
    success: bool
    thread_ref: str
    archived: bool


class SearchResult(TypedDict, total=False):
    messages: List[Message]
    total: int
    page: int
    query: str


class Contact(TypedDict, total=False):
    id: str
    user_id: str
    phone: str
    name: Optional[str]
    email: str
    company: str
    notes: str
    tags: List[str]
    line_type: str
    carrier_name: str
    dnc_status: str
    city: str
    state: str
    country: str
    lr_checked_at: str
    created_at: str
    updated_at: str


class ContactList(TypedDict, total=False):
    contacts: List[Contact]
    total: int
    page: int


class BulkContactResult(TypedDict, total=False):
    message: str
    imported: int
    total: int


class Webhook(TypedDict, total=False):
    id: str
    user_id: str
    url: str
    events: List[str]
    active: bool
    created_at: str


class CreatedWebhook(TypedDict, total=False):
    webhook: Webhook
    secret: str
    message: str


# Functional syntax because "from" is a Python keyword. For message.received
# "from" is the sender. For message.sent it is the recipient: the server uses
# the same field name for both events.
WebhookEventData = TypedDict(
    "WebhookEventData",
    {
        "id": str,
        "from": str,
        "body": str,
        "device_id": str,
        "device_name": str,
        "device_phone": str,
        "media_url": str,
        "media_type": str,
        "received_at": str,
    },
    total=False,
)


class WebhookEvent(TypedDict, total=False):
    event: str
    timestamp: str
    data: WebhookEventData


class Account(TypedDict, total=False):
    user: Dict[str, object]
    subscription: Dict[str, object]
    usage_today: Dict[str, int]
    device_count: int
