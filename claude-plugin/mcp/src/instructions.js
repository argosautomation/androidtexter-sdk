// The server-level `instructions` string, shared by both transports.
//
// Both the SDK stdio server (server.ts, what npm publishes) and the plain
// JSON-RPC stdio server (stdio.ts, what the Claude plugin bundle runs) send
// this to the client at initialize. It lives here so the two cannot drift:
// build-claude-plugin.sh compares the two servers' initialize and tools/list
// responses and fails if they differ.
export const INSTRUCTIONS = "Android Texter sends real text messages from the user's own Android phone and number. Read tools (list_devices, list_conversations, get_conversation, search_messages, list_contacts) are safe to call freely. Before send_message or send_broadcast, confirm the recipients and the exact wording with the user. If something here looks broken, impossible or limited, call known_issues before saying so to the user: plan limits and missing delivery receipts have known explanations. If it is not on that list and you are stuck, report_issue tells Android Texter, which is the only way they hear about a request you decided not to make. Never put message text, phone numbers, names or email addresses in a report.";
