// Tools for Android Texter customers. Every route here is open to any
// account's API key (the APIKeyOrJWT groups in backend/internal/api/router.go)
// and only ever reads or writes the calling account's own data.

import { atx, int, json, query, requireStr, str, text, type ToolDef } from "./api.js";

const PHONE_HELP =
  "Use E.164 format (e.g. +15551234567). A number without a country code is read in the country of the phone's SIM.";

export const customerTools: ToolDef[] = [
  {
    name: "list_devices",
    title: "List paired phones",
    description:
      "List the Android phones paired to your Android Texter account. Each entry has its id, name, phone_number, status (online or offline), battery_level, last_seen, and its SIMs (slot, label, number) on dual-SIM phones. Texts are sent from these phones with their own numbers and carrier plans, so check that one is online before sending.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run() {
      const data = await atx("/v1/devices");
      return json(data.devices ?? []);
    },
  },

  {
    name: "list_conversations",
    title: "List conversations",
    description:
      "List your text conversations, most recent activity first. Each entry has phone (the other party, or a group's members joined by commas), last_message, last_direction, last_at, message_count, thread_type (direct or group), thread_ref, and the device it is on. Use get_conversation to read one in full.",
    inputSchema: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["all", "inbox", "outbox", "archived", "spam"],
          description:
            "Which folder to list. all: everything except archived and spam (default). inbox: conversations where the other side has replied. outbox: nothing has come back yet. archived and spam: those folders only.",
        },
        limit: {
          type: "number",
          description: "How many conversations to return, 1 to 200. Default 20.",
        },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args) {
      const view = str(args, "view") ?? "all";
      const limit = int(args, "limit", 1, 200) ?? 20;
      const data = await atx(`/messages/conversations${query({ view, limit })}`);
      const list = data.conversations ?? [];
      return list.length === 0 ? text(`No conversations in the ${view} view.`) : json(list);
    },
  },

  {
    name: "get_conversation",
    title: "Read a conversation",
    description:
      "Read the messages in the conversation with one phone number, newest first. Each message has direction (inbound or outbound), body, status, created_at, and media_url for picture messages. For a group conversation, pass the thread_ref from list_conversations.",
    inputSchema: {
      type: "object",
      properties: {
        phone: { type: "string", description: `The other party's phone number. ${PHONE_HELP}` },
        thread_ref: {
          type: "string",
          description: "Optional. The conversation's thread_ref from list_conversations or a message. Required to read a group conversation; preferred over phone when known.",
        },
        limit: { type: "number", description: "Messages per page, 1 to 100. Default 50." },
        page: { type: "number", description: "Page number, 1 for the newest messages. Default 1." },
      },
      required: ["phone"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args) {
      const phone = requireStr(args, "phone");
      const data = await atx(
        `/v1/messages/history/${encodeURIComponent(phone)}${query({
          limit: int(args, "limit", 1, 100) ?? 50,
          page: int(args, "page", 1, 100000) ?? 1,
          thread_ref: str(args, "thread_ref"),
        })}`,
      );
      return json(data);
    },
  },

  {
    name: "search_messages",
    title: "Search messages",
    description:
      "Search all of your texts, sent and received, for a word or phrase. Matches the message text, the phone number, and the contact's name. Newest first.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "What to search for (case-insensitive substring)." },
        limit: { type: "number", description: "Results per page, 1 to 100. Default 50." },
        page: { type: "number", description: "Page number. Default 1." },
      },
      required: ["q"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args) {
      const data = await atx(
        `/messages/search${query({
          q: requireStr(args, "q"),
          limit: int(args, "limit", 1, 100) ?? 50,
          page: int(args, "page", 1, 100000) ?? 1,
        })}`,
      );
      return json(data);
    },
  },

  {
    name: "send_message",
    title: "Send a text",
    description:
      "Send a text message from one of your paired Android phones, using that phone's own number and carrier plan, to a real person. Confirm the recipient and wording with the user before sending. The call returns once the message is queued and pushed to the phone, not when it is delivered: use get_message_status with the returned message_id to follow it. Pass scheduled_at to send it later instead of now. Free plans have a daily sending limit.",
    inputSchema: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: `The recipient's phone number. ${PHONE_HELP} Several numbers separated by commas (up to 25) send one group message.`,
        },
        message: { type: "string", description: "The text to send, up to 1600 characters." },
        device_id: {
          type: "string",
          description:
            "Optional id of the phone to send from (see list_devices). If omitted, the first online phone is used. If none is online, it is queued for the first paired phone and fails if that phone does not come back within 24 hours.",
        },
        sim_slot: {
          type: "number",
          description: "Optional, dual-SIM phones only: which SIM to send from, 0 for SIM 1 and 1 for SIM 2. If omitted, the phone uses the SIM chosen for that conversation, else the SIM the recipient last texted, else its default.",
        },
        media_url: {
          type: "string",
          description: "Optional public URL of an image to attach. Makes this a picture message (MMS).",
        },
        scheduled_at: {
          type: "string",
          description:
            "Optional time to send it instead of now, as an ISO 8601 timestamp with a time zone (e.g. 2026-11-03T14:30:00Z or 2026-11-03T09:30:00-05:00). Must be in the future. The server releases it to the phone at that time. Use list_scheduled_messages to see what is pending and cancel_scheduled_message to call one off.",
        },
      },
      required: ["phone", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async run(args) {
      const body: Record<string, unknown> = {
        phone: requireStr(args, "phone"),
        message: requireStr(args, "message"),
      };
      const deviceId = str(args, "device_id");
      if (deviceId) body.device_id = deviceId;
      const sim = int(args, "sim_slot", 0, 7);
      if (sim !== undefined) body.sim_slot = sim;
      const media = str(args, "media_url");
      if (media) body.media_url = media;
      const at = str(args, "scheduled_at");
      if (at) body.scheduled_at = at;
      return json(await atx("/v1/messages/send", "POST", body));
    },
  },

  {
    name: "send_broadcast",
    title: "Send one text to many people",
    description:
      "Send the same text to a list of phone numbers (up to 500), each as its own one-to-one message from your paired phone's own number. Only use this when the user has asked to text a list of people, and confirm the list and wording first: every recipient gets a real text. The message can be personalized from each recipient's contact record with {{name}}, {{first_name}}, {{last_name}}, {{full_name}}, {{company}}, {{city}} or {{state}}, and {{first_name|there}} gives a fallback when the field is empty. {{name}} is the name set by save_contact; first_name and last_name are only filled for contacts imported with those fields. Broadcasts send now and cannot be scheduled. Returns sent and failed counts and a message_id per recipient.",
    inputSchema: {
      type: "object",
      properties: {
        phones: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 500,
          description: `Recipient phone numbers, up to 500. ${PHONE_HELP} To text everyone with a tag, get their numbers from list_contacts first.`,
        },
        message: { type: "string", description: "The text to send, up to 1600 characters. May contain the personalization tokens above." },
        media_url: { type: "string", description: "Optional public URL of an image to attach to every message (MMS)." },
        device_id: {
          type: "string",
          description: "Optional id of the phone to send every message from. If omitted, the first online phone is used.",
        },
        round_robin: {
          type: "boolean",
          description: "Optional. Spread the messages across all of your online phones instead of sending them all from one. Ignored when device_id is set.",
        },
      },
      required: ["phones", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async run(args) {
      const phones = Array.isArray(args.phones)
        ? args.phones.map((p) => String(p).trim()).filter((p) => p !== "")
        : [];
      if (phones.length === 0) throw new Error("phones must be a non-empty array of phone numbers");
      const body: Record<string, unknown> = { phones, message: requireStr(args, "message") };
      const media = str(args, "media_url");
      if (media) body.media_url = media;
      // The handler only honours device_id in "specific" mode; on its own it
      // is ignored and the first online phone is used.
      const deviceId = str(args, "device_id");
      if (deviceId) {
        body.device_id = deviceId;
        body.device_mode = "specific";
      } else if (args.round_robin === true) {
        body.device_mode = "round-robin";
      }
      return json(await atx("/messages/broadcast", "POST", body));
    },
  },

  {
    name: "get_message_status",
    title: "Check a message's status",
    description:
      "Check where an outbound message is: queued (waiting for the phone), sent (the phone handed it to the carrier), delivered, or failed. Pass the message_id returned by send_message or send_broadcast.",
    inputSchema: {
      type: "object",
      properties: { message_id: { type: "string", description: "The message id returned when it was sent." } },
      required: ["message_id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args) {
      const id = requireStr(args, "message_id");
      return json(await atx(`/v1/messages/status/${encodeURIComponent(id)}`));
    },
  },

  {
    name: "list_scheduled_messages",
    title: "List scheduled messages",
    description:
      "List the messages that are scheduled to go out later and have not been sent or cancelled yet, soonest first. Use this before scheduling more, and to get the id needed by cancel_scheduled_message.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run() {
      const data = await atx("/messages/scheduled");
      const pending = data.scheduled_messages ?? [];
      return pending.length === 0 ? text("No messages are scheduled.") : json(pending);
    },
  },

  {
    name: "cancel_scheduled_message",
    title: "Cancel a scheduled message",
    description:
      "Cancel a message that is scheduled for a future send, so it never goes out. Only works while it is still pending; a message that has already been released to the phone cannot be recalled.",
    inputSchema: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The id of the scheduled message, as returned by list_scheduled_messages or by send_message when it was scheduled.",
        },
      },
      required: ["message_id"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async run(args) {
      const id = requireStr(args, "message_id");
      return json(await atx(`/messages/scheduled/${encodeURIComponent(id)}`, "DELETE"));
    },
  },

  {
    name: "list_contacts",
    title: "List contacts",
    description:
      "List or search your Android Texter contacts. Each contact has id, phone, name, email, company, notes, tags, and line type and carrier when a lookup has been run. Filter by tag to build a list for send_broadcast.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Optional. Matches phone, name, email, company, or carrier (case-insensitive substring)." },
        tag: { type: "string", description: "Optional. Only contacts carrying this exact tag. See list_contact_tags." },
        limit: { type: "number", description: "Contacts per page, 1 to 500. Default 50." },
        page: { type: "number", description: "Page number. Default 1." },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(args) {
      const data = await atx(
        `/contacts${query({
          search: str(args, "search"),
          tag: str(args, "tag"),
          limit: int(args, "limit", 1, 500) ?? 50,
          page: int(args, "page", 1, 100000) ?? 1,
        })}`,
      );
      return json(data);
    },
  },

  {
    name: "list_contact_tags",
    title: "List contact tags",
    description: "List every tag used on your contacts, for filtering list_contacts.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run() {
      const data = await atx("/contacts/tags");
      return json(data.tags ?? []);
    },
  },

  {
    name: "save_contact",
    title: "Create or update a contact",
    description:
      "Create a contact, or update the one that already has this phone number. Only the fields you pass are changed; fields you leave out keep their current values. Tags are added to the contact's existing tags, never removed.",
    inputSchema: {
      type: "object",
      properties: {
        phone: { type: "string", description: `The contact's phone number, which identifies the contact. ${PHONE_HELP}` },
        name: { type: "string", description: "Optional name, used for {{name}} in send_broadcast." },
        email: { type: "string", description: "Optional email address." },
        company: { type: "string", description: "Optional company." },
        notes: { type: "string", description: "Optional notes. Replaces any existing notes." },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags to add." },
      },
      required: ["phone"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(args) {
      const body: Record<string, unknown> = { phone: requireStr(args, "phone") };
      for (const k of ["name", "email", "company", "notes"]) {
        const v = str(args, k);
        if (v !== undefined) body[k] = v;
      }
      if (Array.isArray(args.tags)) {
        body.tags = args.tags.map((t) => String(t).trim()).filter((t) => t !== "");
      }
      return json(await atx("/contacts", "POST", body));
    },
  },
];
