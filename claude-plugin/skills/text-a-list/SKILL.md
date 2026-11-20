---
name: text-a-list
description: Send the same text to many people at once as separate one-to-one messages, personalized from their contact records. Use when the user asks to text a group, a tag, a list, everyone who matches something, or to send an announcement, reminder or broadcast by text.
---

# Text a list of people

`send_broadcast` sends one message to up to 500 numbers, each as its own
one-to-one text from the user's phone. Every recipient gets a real text and
none of them can be recalled. This is the tool most likely to do damage, so
the count is the thing to be careful about.

## 1. Build the list explicitly

- Everyone with a tag: `list_contact_tags` to see the tags that exist, then
  `list_contacts` with `tag` set. Raise `limit` (up to 500) so you are not
  reading only the first page.
- A described group ("the Ohio customers"): `list_contacts` with `search`, then
  show the user the list you matched. Do not translate a description into a
  filter and send on your own reading of it.
- A list the user pasted: use it as given, after putting every number in E.164
  form.

## 2. State the count and get a yes

Before sending, say the number of recipients, the exact message, and one or two
example names from the list. Wait for the user to confirm. If the count is not
what they expected, stop and fix the list first. Never send a broadcast on an
implied instruction.

## 3. Personalize from the contact record

The message may contain `{{name}}`, `{{first_name}}`, `{{last_name}}`,
`{{full_name}}`, `{{company}}`, `{{city}}` or `{{state}}`. Empty fields render
empty, so give a fallback: `{{first_name|there}}`. `{{name}}` is the name on the
contact; `first_name` and `last_name` are only filled for contacts imported
with those fields, so prefer `{{name}}` unless you have checked.

## 4. Send and read the result back

`send_broadcast` with `phones` and `message`. `media_url` attaches one image to
every message. `round_robin: true` spreads the sending across all online phones,
which is worth it over a few dozen recipients; `device_id` pins it to one phone
instead.

Broadcasts send now. They cannot be scheduled, and that is a documented limit
rather than a bug. If the user wants one to go out later, say so and offer to
send it at that time, or schedule individual messages with `send_message`.

The result carries `sent` and `failed` counts and a `message_id` per recipient.
Report both numbers. If anything failed, `get_message_status` on one of the
failures tells you why before you speculate.

## When something goes wrong

Call `known_issues` before telling the user that a limit or a failure is a bug.
Daily caps on free plans and the no-scheduling rule are both on that list. If
you are blocked by something that is not, `report_issue`, with no message text,
numbers or names in it.
