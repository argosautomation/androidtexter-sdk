import { APIConnectionError, AndroidTexterError, errorForStatus } from "./errors.js";
import type {
  Account,
  ArchiveConversationParams,
  ArchiveResult,
  BroadcastResult,
  BulkContactResult,
  Contact,
  ContactList,
  Conversation,
  ConversationCounts,
  ConversationHistory,
  ConversationHistoryParams,
  CreateWebhookParams,
  CreatedWebhook,
  Device,
  ListContactsParams,
  ListConversationsParams,
  ListMessagesParams,
  Message,
  MessageStatus,
  SearchResult,
  SendBroadcastParams,
  SendMessageParams,
  SendMessageResult,
  UpdateContactParams,
  UpsertContactParams,
  Webhook,
} from "./types.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://androidtexter.com";
export const DEFAULT_TIMEOUT_MS = 30_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type Query = Record<string, string | number | boolean | null | undefined>;

export interface ClientOptions {
  /** Your atx_... key. Defaults to process.env.ANDROIDTEXTER_API_KEY. */
  apiKey?: string;
  /** Site origin. Defaults to ANDROIDTEXTER_BASE_URL or https://androidtexter.com. A trailing /api is accepted. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Custom fetch implementation. Defaults to the global fetch (Node 18+). */
  fetch?: FetchLike;
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
}

function env(name: string): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env[name] : undefined;
}

function joinPhones(phone: string | string[]): string {
  return Array.isArray(phone) ? phone.map((p) => p.trim()).join(",") : phone;
}

function formatTime(value: string | Date): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("scheduled_at is an invalid Date");
    return value.toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  throw new TypeError("scheduled_at must be a string or Date");
}

function dropUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

const enc = encodeURIComponent;

/**
 * Client for the Android Texter API: send and receive SMS and MMS through
 * your own Android phone, from your own number.
 *
 * ```ts
 * import { AndroidTexter } from "androidtexter";
 * const client = new AndroidTexter(); // reads ANDROIDTEXTER_API_KEY
 * await client.sendMessage({ phone: "+15551234567", message: "Hello from Node" });
 * ```
 */
export class AndroidTexter {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: ClientOptions = {}) {
    const key = options.apiKey ?? env("ANDROIDTEXTER_API_KEY");
    if (!key) {
      throw new AndroidTexterError(
        "No API key. Pass new AndroidTexter({ apiKey: 'atx_...' }) or set the ANDROIDTEXTER_API_KEY " +
          "environment variable. Create a key at https://androidtexter.com/dashboard/settings/api-keys",
      );
    }
    this.apiKey = key;
    let url = (options.baseUrl ?? env("ANDROIDTEXTER_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    if (url.endsWith("/api")) url = url.slice(0, -4);
    this.baseUrl = url;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const f = options.fetch ?? (typeof fetch === "function" ? fetch.bind(globalThis) : undefined);
    if (!f) throw new AndroidTexterError("No fetch available. Use Node 18 or newer, or pass options.fetch.");
    this.fetchImpl = f as FetchLike;
  }

  // ------------------------------------------------------------ transport

  /**
   * Call any API-key endpoint directly and return the decoded JSON. `path`
   * starts with /api, for example "/api/quick-replies". Use this for
   * endpoints that do not have a method of their own yet.
   */
  async request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    let url = this.baseUrl + path;
    if (options.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v === undefined || v === null) continue;
        qs.append(k, String(v));
      }
      const s = qs.toString();
      if (s) url += (url.includes("?") ? "&" : "?") + s;
    }
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      Accept: "application/json",
      "User-Agent": `androidtexter-node/${VERSION}`,
    };
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    init.signal = controller.signal;

    let res: Response;
    let text: string;
    try {
      res = await this.fetchImpl(url, init);
      text = await res.text();
    } catch (err) {
      const why = controller.signal.aborted ? `timed out after ${this.timeoutMs} ms` : String(err);
      throw new APIConnectionError(`Request to ${url} failed: ${why}`, err);
    } finally {
      clearTimeout(timer);
    }

    let body: unknown = text;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } else {
      body = null;
    }

    if (res.status >= 400) {
      let msg: string | undefined;
      if (body && typeof body === "object") {
        const b = body as { error?: unknown; message?: unknown };
        msg = (typeof b.error === "string" && b.error) || (typeof b.message === "string" && b.message) || undefined;
      }
      if (!msg) msg = (typeof body === "string" && body) || res.statusText || `HTTP ${res.status}`;
      throw errorForStatus(res.status, msg, body);
    }
    return body as T;
  }

  // ------------------------------------------------------------ account

  /** The account the key belongs to: user, plan, today's usage. GET /api/me. Handy as a connection test. */
  me(): Promise<Account> {
    return this.request<Account>("GET", "/api/me");
  }

  // ------------------------------------------------------------ messages

  /**
   * Send an SMS, or an MMS when `media_url` is set, from your phone.
   * POST /api/messages/send. The message is queued and pushed to the phone;
   * follow it with getMessageStatus(message_id).
   */
  sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const body = dropUndefined({
      phone: joinPhones(params.phone),
      message: params.message,
      device_id: params.device_id,
      media_url: params.media_url,
      scheduled_at: params.scheduled_at !== undefined ? formatTime(params.scheduled_at) : undefined,
      thread_id: params.thread_id,
      sim_slot: params.sim_slot,
      country: params.country,
    });
    return this.request<SendMessageResult>("POST", "/api/messages/send", { body });
  }

  /** Alias of sendMessage. */
  sendSms(params: SendMessageParams): Promise<SendMessageResult> {
    return this.sendMessage(params);
  }

  /**
   * `{ id, status, phone }` for a message you sent. GET /api/v1/messages/status/:id.
   * status is "queued" until the phone reports back, then "sent" or "failed".
   * A message still queued after 24 hours becomes "failed"; a cancelled
   * scheduled message reads "cancelled".
   */
  getMessageStatus(messageId: string): Promise<MessageStatus> {
    return this.request<MessageStatus>("GET", `/api/v1/messages/status/${enc(messageId)}`);
  }

  /**
   * Send the same message to up to 500 recipients, one text each.
   * POST /api/messages/broadcast. Setting `device_id` without `device_mode`
   * sends `device_mode: "specific"`, because the server ignores `device_id`
   * in any other mode.
   */
  sendBroadcast(params: SendBroadcastParams): Promise<BroadcastResult> {
    const mode = params.device_mode ?? (params.device_id !== undefined ? "specific" : undefined);
    const body = dropUndefined({
      phones: [...params.phones],
      message: params.message,
      media_url: params.media_url,
      device_id: params.device_id,
      device_mode: mode,
      country: params.country,
    });
    return this.request<BroadcastResult>("POST", "/api/messages/broadcast", { body });
  }

  /**
   * Messages, newest first. direction "inbound" calls GET /api/messages/received,
   * "outbound" GET /api/messages/sent, omitted GET /api/messages.
   */
  async listMessages(params: ListMessagesParams = {}): Promise<Message[]> {
    const paths: Record<string, string> = {
      all: "/api/messages",
      inbound: "/api/messages/received",
      outbound: "/api/messages/sent",
    };
    const path = paths[params.direction ?? "all"];
    if (!path) throw new TypeError('direction must be "inbound", "outbound" or undefined');
    const data = await this.request<{ messages?: Message[] | null }>("GET", path, {
      query: { page: params.page, limit: params.limit },
    });
    return data?.messages ?? [];
  }

  /** Search every message. GET /api/messages/search. limit 1 to 100, default 50. */
  searchMessages(query: string, params: { page?: number; limit?: number } = {}): Promise<SearchResult> {
    return this.request<SearchResult>("GET", "/api/messages/search", {
      query: { q: query, page: params.page, limit: params.limit },
    });
  }

  // ------------------------------------------------------------ conversations

  /**
   * Conversations, most recent activity first. GET /api/messages/conversations.
   * view: "inbox" (someone replied), "outbox" (no reply yet), "archived",
   * "spam", or "all" (all but archived and spam).
   */
  async listConversations(params: ListConversationsParams = {}): Promise<Conversation[]> {
    const data = await this.request<{ conversations?: Conversation[] | null }>(
      "GET",
      "/api/messages/conversations",
      { query: { view: params.view, filter: params.filter, limit: params.limit } },
    );
    return data?.conversations ?? [];
  }

  /**
   * Messages in one conversation, newest first. GET /api/messages/thread.
   * `phone` is always required by the server. For a group, also pass
   * `thread_ref` or `thread_id`, or pass the members as an array.
   */
  async getConversationHistory(params: ConversationHistoryParams): Promise<ConversationHistory> {
    const data = await this.request<ConversationHistory>("GET", "/api/messages/thread", {
      query: {
        phone: joinPhones(params.phone),
        thread_ref: params.thread_ref,
        thread_id: params.thread_id,
        page: params.page,
        limit: params.limit,
      },
    });
    if (data && data.messages == null) data.messages = [];
    return data;
  }

  /** How many conversations each view holds. GET /api/messages/conversations/counts. */
  async getConversationCounts(): Promise<ConversationCounts> {
    const data = await this.request<{ counts: ConversationCounts }>("GET", "/api/messages/conversations/counts");
    return data.counts;
  }

  /**
   * Archive a conversation, or unarchive it with `archived: false`.
   * POST /api/messages/conversations/archive. Identify it by thread_ref,
   * phone or thread_id. A new inbound message unarchives it.
   */
  archiveConversation(params: ArchiveConversationParams): Promise<ArchiveResult> {
    if (params.thread_ref === undefined && params.phone === undefined && params.thread_id === undefined) {
      throw new TypeError("Pass thread_ref, phone or thread_id");
    }
    const body = dropUndefined({
      thread_ref: params.thread_ref,
      phone: params.phone !== undefined ? joinPhones(params.phone) : undefined,
      thread_id: params.thread_id,
      archived: params.archived ?? true,
    });
    return this.request<ArchiveResult>("POST", "/api/messages/conversations/archive", { body });
  }

  // ------------------------------------------------------------ scheduled

  /** Messages waiting to go out at a future time, soonest first. GET /api/messages/scheduled. */
  async listScheduledMessages(): Promise<Message[]> {
    const data = await this.request<{ scheduled_messages?: Message[] | null }>("GET", "/api/messages/scheduled");
    return data?.scheduled_messages ?? [];
  }

  /**
   * Cancel a scheduled message that has not gone out yet. DELETE /api/messages/scheduled/:id.
   * Throws NotFoundError if it already went, was cancelled, or does not exist.
   */
  cancelScheduledMessage(messageId: string): Promise<{ message: string }> {
    return this.request("DELETE", `/api/messages/scheduled/${enc(messageId)}`);
  }

  // ------------------------------------------------------------ devices

  /** Every paired phone, with status, battery and SIMs. GET /api/devices. */
  async listDevices(): Promise<Device[]> {
    const data = await this.request<{ devices?: Device[] | null }>("GET", "/api/devices");
    return data?.devices ?? [];
  }

  /** One paired phone. GET /api/devices/:id. */
  async getDevice(deviceId: string): Promise<Device> {
    const data = await this.request<{ device: Device }>("GET", `/api/devices/${enc(deviceId)}`);
    return data.device;
  }

  // ------------------------------------------------------------ contacts

  /** Contacts, as `{ contacts, total, page }`. GET /api/contacts. */
  listContacts(params: ListContactsParams = {}): Promise<ContactList> {
    return this.request<ContactList>("GET", "/api/contacts", {
      query: { search: params.search, tag: params.tag, page: params.page, limit: params.limit },
    });
  }

  /** One contact by phone number. GET /api/contacts/:phone. */
  async getContact(phone: string): Promise<Contact> {
    const data = await this.request<{ contact: Contact }>("GET", `/api/contacts/${enc(phone)}`);
    return data.contact;
  }

  /**
   * Create a contact, or update the one that already has this phone number.
   * POST /api/contacts. Safe to retry. On an existing contact, fields you
   * pass overwrite, fields you leave out are kept, and tags are added to the
   * existing tags rather than replacing them.
   */
  async upsertContact(params: UpsertContactParams): Promise<Contact> {
    const body = dropUndefined({
      phone: params.phone,
      name: params.name ?? undefined,
      email: params.email ?? undefined,
      company: params.company ?? undefined,
      notes: params.notes ?? undefined,
      tags: params.tags,
    });
    const data = await this.request<{ contact?: Contact } & Contact>("POST", "/api/contacts", { body });
    return data.contact ?? data;
  }

  /**
   * Replace a contact's details by id. PUT /api/contacts/:id.
   * Full replace: name, email, company and notes you leave out are cleared,
   * and tags are replaced (omitted tags clears them). To change one field and
   * keep the rest, use upsertContact. `phone` is required by the server but
   * is not changed.
   */
  async updateContact(contactId: string, params: UpdateContactParams): Promise<Contact> {
    const body = {
      phone: params.phone,
      name: params.name ?? null,
      email: params.email ?? null,
      company: params.company ?? null,
      notes: params.notes ?? null,
      tags: params.tags ?? [],
    };
    const data = await this.request<{ contact?: Contact } & Contact>("PUT", `/api/contacts/${enc(contactId)}`, {
      body,
    });
    return data.contact ?? data;
  }

  /** Delete a contact by id. DELETE /api/contacts/:id. */
  deleteContact(contactId: string): Promise<{ message: string }> {
    return this.request("DELETE", `/api/contacts/${enc(contactId)}`);
  }

  /** Upsert up to 5000 contacts in one call, merged like upsertContact. POST /api/contacts/bulk. */
  bulkUpsertContacts(contacts: UpsertContactParams[]): Promise<BulkContactResult> {
    const items = contacts.map((c) =>
      dropUndefined({
        phone: c.phone,
        name: c.name ?? undefined,
        email: c.email ?? undefined,
        company: c.company ?? undefined,
        notes: c.notes ?? undefined,
        tags: c.tags,
      }),
    );
    return this.request<BulkContactResult>("POST", "/api/contacts/bulk", { body: { contacts: items } });
  }

  /** Every distinct tag in use on your contacts. GET /api/contacts/tags. */
  async listContactTags(): Promise<string[]> {
    const data = await this.request<{ tags?: string[] | null }>("GET", "/api/contacts/tags");
    return data?.tags ?? [];
  }

  // ------------------------------------------------------------ webhooks

  /**
   * Register a public URL to receive events. POST /api/v1/webhooks.
   * The returned `secret` (whsec_...) is shown only once: store it and pass
   * it to verifyWebhookSignature for every delivery.
   */
  createWebhook(params: CreateWebhookParams): Promise<CreatedWebhook> {
    const body = dropUndefined({ url: params.url, events: params.events });
    return this.request<CreatedWebhook>("POST", "/api/v1/webhooks", { body });
  }

  /** Every webhook on the account. GET /api/v1/webhooks. */
  async listWebhooks(): Promise<Webhook[]> {
    const data = await this.request<{ webhooks?: Webhook[] | null }>("GET", "/api/v1/webhooks");
    return data?.webhooks ?? [];
  }

  /** Remove a webhook. DELETE /api/v1/webhooks/:id. */
  deleteWebhook(webhookId: string): Promise<{ success: boolean }> {
    return this.request("DELETE", `/api/v1/webhooks/${enc(webhookId)}`);
  }
}
