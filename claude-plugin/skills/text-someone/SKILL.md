---
name: text-someone
description: Send a text message to one person or a small group from the user's own Android phone, or schedule one for later. Use when the user asks to text, SMS, message or MMS somebody, to let someone know something by text, or to send a picture by text.
---

# Text one person

These messages leave the user's real phone on their real number and arrive on
a real person's handset. They cannot be unsent. Work in this order.

## 1. Confirm before you send

Say back who you are about to text and the exact wording, and wait for a yes.
Do this even when the user dictated the message, because a transcription slip
goes out as written. Never invent a recipient from context when the user named
a person but no number.

## 2. Find the number

A number must be in E.164 form, `+15551234567`. A number without a country
code is read in the country of the phone's SIM.

- The user gave a name, not a number: `list_contacts` with `search` set to the
  name. One match, use it. Several matches, show the user the names and
  numbers and ask which. No match, ask for the number; do not guess.
- The user gave a number: use it as typed, after adding the country code.

## 3. Check a phone is online

`list_devices` returns each paired phone with `status`, `battery_level` and its
SIMs. If none is `online`, say so before sending: the message is queued for the
first paired phone and fails if that phone does not come back within 24 hours.
On a dual-SIM phone the user may care which number it goes from, which is
`sim_slot` 0 for SIM 1 and 1 for SIM 2.

## 4. Send

`send_message` with `phone` and `message`. Up to 1600 characters.

- A picture message: `media_url`, a public URL to the image.
- Several numbers in `phone`, comma separated, up to 25, is one group thread
  where everyone sees everyone. That is not how to text a list of people
  separately. For that, use the `text-a-list` skill.
- Later rather than now: `scheduled_at`, an ISO 8601 timestamp with a zone,
  `2026-11-03T09:30:00-05:00`. Resolve "tomorrow morning" to a real time in the
  user's own zone and say the time back before sending.

## 5. Report what happened

The call returns when the message reaches the phone, not when it is delivered.
Tell the user it is on its way, with the `message_id`. If they ask whether it
arrived, `get_message_status`: `queued` means the phone has not taken it yet,
`sent` means the carrier has it, then `delivered` or `failed`.

## When something goes wrong

A 429, a status stuck at `sent`, a free plan limit: call `known_issues` before
telling the user it is broken. These have published explanations and guessing
in front of the user gets it wrong. If what you hit is not on that list and it
stopped you, `report_issue` is how Android Texter hears about it. Never put
message text, phone numbers or names in a report.
