// Request and response shapes for the Android Texter API. Field names are the
// API's own (snake_case), so these match the JSON on the wire and the docs at
// https://androidtexter.com/docs. Responses may carry fields added later that
// are not listed here.

export type MessageDirection = "inbound" | "outbound";
export type ConversationView = "inbox" | "outbox" | "archived" | "spam" | "all";
export type LegacyConversationFilter = "inbox" | "spam" | "all";
export type DeviceMode = "auto" | "specific" | "round-robin";
export type WebhookEventName = "message.received" | "message.sent";

export interface DeviceSim {
  slot: number;
  label: string;
  number?: string;
  country?: string;
}

export interface Device {
  id: string;
  user_id: string;
  device_name: string;
  friendly_name: string | null;
  phone_number: string | null;
  status: "online" | "offline" | string;
  battery_level: number | null;
  last_seen: string;
  created_at: string;
  sims?: DeviceSim[];
  is_default_sms?: boolean | null;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  user_id: string;
  device_id: string;
  direction: MessageDirection;
  phone: string;
  body: string;
  status: string;
  media_url?: string;
  media_type?: string;
  api_key_id?: string;
  scheduled_at?: string;
  scheduler_status: string;
  thread_id?: string;
  thread_type: "direct" | "group" | string;
  participants?: string[];
  thread_ref?: string;
  created_at: string;
  sim_slot?: number;
  sim_label?: string;
  [key: string]: unknown;
}

export interface SendMessageParams {
  /** Recipient, ideally E.164. An array of up to 25 numbers sends one group message. */
  phone: string | string[];
  /** Text body, up to 1600 characters. */
  message: string;
  /** Send from this paired phone. Default: the first online one. */
  device_id?: string;
  /** Public HTTPS URL of an image or file. Makes it an MMS. */
  media_url?: string;
  /** Send later: a Date or RFC 3339 string such as "2026-12-01T09:00:00Z". Must be in the future. */
  scheduled_at?: string | Date;
  /** Join an existing group thread (from a received message). */
  thread_id?: string;
  /** Dual-SIM phones only: 0 for SIM 1, 1 for SIM 2. */
  sim_slot?: number;
  /** ISO 3166 alpha-2 country ("GB") a local-format phone is read in. */
  country?: string;
}

export interface SendMessageResult {
  status: number;
  message_id: string;
  device_id: string;
  device_name: string;
  /** The sending phone's own number, when known. */
  phone_number?: string;
  message: string;
  scheduled_at?: string;
  scheduler_status?: string;
  [key: string]: unknown;
}

export interface MessageStatus {
  id: string;
  status: "queued" | "sent" | "failed" | "cancelled" | string;
  phone: string;
}

export interface SendBroadcastParams {
  /** Recipient numbers, at most 500. */
  phones: string[];
  /** Up to 1600 characters. Supports {{first_name}}, {{first_name|there}} and similar tokens. */
  message: string;
  media_url?: string;
  /** Send every message from this phone. Implies device_mode "specific" when device_mode is not set. */
  device_id?: string;
  device_mode?: DeviceMode;
  country?: string;
}

export interface BroadcastRecipientResult {
  phone: string;
  message_id?: string;
  status: "queued" | "failed" | string;
  device_id?: string;
  error?: string;
}

export interface BroadcastResult {
  sent: number;
  failed: number;
  total: number;
  results: BroadcastRecipientResult[];
}

export interface ListMessagesParams {
  /** "inbound", "outbound", or omitted for both. */
  direction?: MessageDirection;
  /** 1-based. Default 1. */
  page?: number;
  /** 1 to 100. Default 50. */
  limit?: number;
}

export interface SearchResult {
  messages: Message[];
  total: number;
  page: number;
  query: string;
}

export interface ListConversationsParams {
  view?: ConversationView;
  /** Legacy, used only when view is not set. */
  filter?: LegacyConversationFilter;
  /** 1 to 2000. Default 50. */
  limit?: number;
}

export interface Conversation {
  thread_ref: string;
  thread_id?: string;
  /** Comma-joined members for a group. */
  phone: string;
  participants?: string[];
  contact_name?: string;
  last_message: string;
  last_direction: MessageDirection;
  last_at: string;
  message_count: number;
  device_id: string | null;
  device_name: string | null;
  device_phone: string | null;
  thread_type: "direct" | "group" | string;
  archived: boolean;
  archived_at?: string;
  has_inbound: boolean;
  [key: string]: unknown;
}

export interface ConversationHistoryParams {
  /** Required by the server. The other party, or a group's members. */
  phone: string | string[];
  /** The conversation id. Preferred when known. */
  thread_ref?: string;
  /** The phone-side thread id of a group. */
  thread_id?: string;
  page?: number;
  /** 1 to 5000. Default 200. */
  limit?: number;
}

export interface ConversationHistory {
  messages: Message[];
  page: number;
  limit: number;
  phone: string;
  thread_ref: string;
  preferred_sim_slot: number | null;
}

export interface ConversationCounts {
  all: number;
  inbox: number;
  outbox: number;
  archived: number;
  spam: number;
}

export interface ArchiveConversationParams {
  thread_ref?: string;
  phone?: string | string[];
  thread_id?: string;
  /** true to archive (default), false to unarchive. */
  archived?: boolean;
}

export interface ArchiveResult {
  success: boolean;
  thread_ref: string;
  archived: boolean;
}

export interface Contact {
  id: string;
  user_id: string;
  phone: string;
  name: string | null;
  email?: string;
  company?: string;
  notes?: string;
  tags: string[];
  line_type?: string;
  carrier_name?: string;
  dnc_status?: string;
  city?: string;
  state?: string;
  country?: string;
  lr_checked_at?: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ContactFields {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
  tags?: string[];
}

export interface UpsertContactParams extends ContactFields {
  phone: string;
}

export interface UpdateContactParams extends ContactFields {
  /** Required by the server, not changed by the update. */
  phone: string;
}

export interface ListContactsParams {
  /** Matches phone, name, email, company or carrier. */
  search?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

export interface ContactList {
  contacts: Contact[];
  total: number;
  page: number;
}

export interface BulkContactResult {
  message: string;
  imported: number;
  total: number;
}

export interface Webhook {
  id: string;
  user_id?: string;
  url: string;
  events: string[];
  active: boolean;
  created_at?: string;
}

export interface CreateWebhookParams {
  /** Public http or https URL (https recommended). Localhost and private IP addresses are refused. */
  url: string;
  /** Default: ["message.received", "message.sent"]. */
  events?: WebhookEventName[];
}

export interface CreatedWebhook {
  webhook: Webhook;
  /** whsec_... Shown only once. Store it to verify deliveries. */
  secret: string;
  message: string;
}

export interface WebhookEventData {
  id: string;
  /** For message.received the sender; for message.sent the recipient. */
  from: string;
  body: string;
  device_id: string;
  device_name: string;
  device_phone?: string;
  media_url?: string;
  media_type?: string;
  received_at: string;
  [key: string]: unknown;
}

export interface WebhookEvent {
  event: WebhookEventName | string;
  timestamp: string;
  data: WebhookEventData;
}

export interface Account {
  user: { id: string; email: string; name: string | null; role: string; [key: string]: unknown };
  subscription: Record<string, unknown>;
  usage_today: { sent: number; received: number };
  device_count: number;
  [key: string]: unknown;
}
