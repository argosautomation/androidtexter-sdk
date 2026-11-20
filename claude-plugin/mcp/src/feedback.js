// The two tools that point the other way: the agent telling us something,
// and the agent reading what we already know.
//
// Why these exist. Our error logs say the agents on this server are having a
// perfect time: in the 30 days to 18 November 2026 the MCP clients produced
// exactly one error, a single 404. The failures worth having are the ones
// that never become an HTTP request at all, because the agent worked out
// there was no point making it: "there is no tool for that", "I could not
// tell what this argument wanted", "the customer asked for delivery
// confirmation and I had to tell them no". An agent that gives up leaves no
// trace anywhere. Only the agent can tell us, so here is the way to.
//
// Two things to know before changing anything here.
//
// 1. The account owner holds the switch, per account and per API key, and it
//    is enforced in the endpoint, not here. There is a self-contained copy
//    of this bundle on the dashboard at /downloads/android-texter-mcp.js and
//    people keep those, so a gate in the client is a gate that is one saved
//    file away from being absent. The modes are: off, approve (the default,
//    the report is saved as the owner's own draft and we cannot see it), and
//    unprompted (it reaches us when it is filed).
//
// 2. A refusal is returned as an ordinary successful result, never as an
//    error. server.ts turns a thrown error into isError: true, and clients
//    render those as a red failed tool call that models retry or hide. The
//    whole discovery mechanism for this feature is the agent reading our
//    reply out to its human ("I wrote this up; it will not be sent until you
//    approve it"), and an agent does not read an error out, it works around
//    it. So the refusal has to look like a success and carry its text in the
//    body. Do not "improve" this by throwing on accepted: false.
import { atx, ApiError, json, query, requireStr, str, text } from "./api.js";
import { VERSION } from "./version.js";
const CATEGORIES = [
    "missing_capability",
    "unclear_tool",
    "tool_error",
    "wrong_result",
    "permission_or_plan",
    "docs",
    "other",
];
export const feedbackTools = [
    {
        name: "known_issues",
        title: "Check what Android Texter already knows about",
        description: "Read Android Texter's own list of current limitations, plan limits and known bugs, with the workaround for each. Call this BEFORE telling the user that something is broken, impossible, or a bug, and before using report_issue: a 429 on a send, a status that never reaches 'delivered', and a broadcast that cannot be scheduled all have known explanations, and guessing at them in front of the user gets it wrong. Reads nothing about the account and sends nothing anywhere.",
        inputSchema: {
            type: "object",
            properties: {
                tool: {
                    type: "string",
                    description: "Optional. Only issues affecting this tool (e.g. send_broadcast), plus the ones that affect everything.",
                },
            },
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
        async run(args) {
            const data = await atx(`/agent/known-issues${query({ tool: str(args, "tool") })}`);
            const issues = data.issues ?? [];
            if (issues.length === 0) {
                return text("Android Texter has no known issues published for that. If something is not working, report_issue is how to tell them.");
            }
            return json(issues);
        },
    },
    {
        name: "report_issue",
        title: "Report a problem or limitation to Android Texter",
        description: "Tell Android Texter about something you could not do with these tools: a capability that is missing, a tool whose arguments or behaviour were unclear, a result that looked wrong, or a limit you hit on the user's behalf. Android Texter cannot see this from their logs, because the thing worth reporting is usually the request you decided not to make. Call known_issues first, so you do not report something already known. Use it when you have actually hit the wall, not speculatively, and once per problem: filing the same thing twice adds nothing. " +
            "PRIVACY, and this is not optional: describe the PROBLEM, never the user's data. No message text, no phone numbers, no names, no email addresses, no contact details, not even as an example. The server strips them out and the report is worse for having had them. " +
            "WHAT HAPPENS NEXT depends on a setting the account owner controls, and the reply tells you which: either it is saved as the owner's own draft and Android Texter cannot see it until the owner approves it, or it goes straight to Android Texter, or reports are turned off for this account. Read the reply's message back to the user in your own words, including the link, whichever it says. That reply is how the owner finds out this exists.",
        inputSchema: {
            type: "object",
            properties: {
                category: {
                    type: "string",
                    enum: [...CATEGORIES],
                    description: "missing_capability: there is no tool for what was needed. unclear_tool: the tool exists but its arguments or behaviour were ambiguous. tool_error: it returned an error you could not act on. wrong_result: it succeeded but the result was not right. permission_or_plan: blocked by a limit or permission. docs: the description or documentation is wrong or missing. other: none of these.",
                },
                tool: {
                    type: "string",
                    description: "Optional. The tool this is about, e.g. send_broadcast. Leave out if it is about the API as a whole.",
                },
                goal: {
                    type: "string",
                    description: "One sentence on what you were trying to achieve, in terms of the task, not the data. Good: \"schedule one broadcast to a tagged list for tomorrow morning\". Bad: anything quoting a message, a number or a name.",
                },
                expected: {
                    type: "string",
                    description: "Optional. One sentence on what you expected to be able to do, or what you expected to happen.",
                },
                suggestion: {
                    type: "string",
                    description: "Optional. One sentence on what would have solved it, if you can name it (a tool, an argument, a clearer description).",
                },
                blocked: {
                    type: "boolean",
                    description: "True if you could not complete the user's request at all. False if you got there another way but it was awkward. This is the field that sorts the queue, so be honest about it.",
                },
            },
            required: ["category", "goal"],
        },
        // Not read-only, but it writes nothing of the user's and sends no
        // message to anybody: openWorldHint stays false so a client does not
        // treat it like a send.
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async run(args) {
            const category = requireStr(args, "category");
            if (!CATEGORIES.includes(category)) {
                throw new Error(`category must be one of: ${CATEGORIES.join(", ")}`);
            }
            const body = {
                category,
                goal: requireStr(args, "goal"),
                server_version: VERSION,
            };
            for (const k of ["tool", "expected", "suggestion"]) {
                const v = str(args, k);
                if (v !== undefined)
                    body[k] = v;
            }
            if (typeof args.blocked === "boolean")
                body.blocked = args.blocked;
            let data;
            try {
                data = await atx("/agent/reports", "POST", body);
            }
            catch (e) {
                // A 404 here means this account's API is older than this client, not
                // that the report was rejected. Say so plainly rather than letting
                // it surface as a broken tool, and do not ask the model to retry.
                if (e instanceof ApiError && e.status === 404) {
                    return text("This Android Texter account is on an API version that does not take issue reports yet, so nothing was filed. " +
                        "Tell the user what you ran into directly; there is nothing to retry.");
                }
                throw e;
            }
            // The server's message is the thing the agent must relay, so it goes
            // first and on its own line.
            const lines = [String(data.message ?? "")];
            if (data.redaction_note)
                lines.push("", String(data.redaction_note));
            lines.push("", JSON.stringify({
                accepted: data.accepted ?? false,
                status: data.status,
                report_id: data.report_id,
                duplicate: data.duplicate ?? false,
                mode: data.mode,
            }, null, 2));
            return text(lines.join("\n"));
        },
    },
];
