# ElevenLabs agent setup for VOXi

Target agent: `agent_2701kxvmnje2fnf9qfm1fayfc4eb` (EU residency)

Prompt contract version: `2026-07-18.1`

Prompt source SHA-256: `8245375a8cde647f9c62e7ee357b67ac4c4f6df08dc1c0a3cc967e2d9ce177b0`

The versioned source of truth is `config/elevenlabs-agent-contract.json`. The repository validator compares that contract with the runtime handlers, dynamic variables, prompt source, public agent ID, protected transport, and this setup guide.

VOXi is the bilingual AI assistant for VOX Cinemas UAE. Keep the product and welcome globally branded as VOX Cinemas UAE. Mall of the Emirates is one selectable cinema, not the global product identity.

## Live dashboard status, 17 July 2026

Status: PUBLISHED AND VERIFIED FOR LOCAL LIVE TEXT.

- The isolated target agent is published as `VOXi 2.0` in the EU-residency workspace.
- Its EU public token endpoint returns HTTP 200.
- The dashboard prompt matches `VOXI_AGENT_PROMPT` after ignoring editor-only surrounding whitespace.
- The first message is exactly `{{voxi_session_opening}}`.
- English and Arabic are configured, and Detect language is off.
- All eight exact client-tool names and descriptions are present, with Wait for response on every tool.
- First-message override is off and text-only override is on.
- ElevenLabs forces Agent language override on and disables its toggle when Arabic is configured. The widget sends no language override, so this forced dashboard state is compatible with the repository contract.
- Local live text reached status `Text chat` and returned: "I'm Voxi, the warm, confident bilingual AI assistant for VOX Cinemas UAE."
- A FAB follow-up returned: "The FAB offer is for 2D tickets only."
- The Cloudflare widget also connected to the published agent and returned grounded English and Arabic identity responses.
- Voice startup reached the permission gate, but the controlled in-app browser and Chrome test surface did not expose a microphone permission state. The bounded timeout returned safely to text chat, and no live audio was captured.

## Dashboard baseline

Configure the target agent with these settings:

- Public agent ID: `agent_2701kxvmnje2fnf9qfm1fayfc4eb`.
- Agent name: `VOXi 2.0`.
- Supported languages: English (`en`, `en-AE`) and Arabic (`ar`, `ar-AE`).
- Primary language: English.
- Configure the dashboard first-message field as `{{voxi_session_opening}}`.
- Copy the complete `VOXI_AGENT_PROMPT` value from `src/lib/voxiSession.js` into the dashboard system prompt.
- Disable the ElevenLabs `language_detection` system tool. VOXi uses explicit language selection and confirmation, not automatic detected-language switching.
- ElevenLabs forces the Agent language override permission on and disables its toggle when Arabic is configured. Leave that dashboard state unchanged. The widget does not send an `agent.language` override.
- Do not enable or depend on an `agent.firstMessage` client override.
- Keep voice on WebRTC and keep `serverLocation: "eu-residency"` in the web client.
- Configure all eight tools below as client tools with the exact case-sensitive names and parameter identifiers.

Every tool must have **Wait for response** enabled so the agent receives the authoritative JSON result before describing it:

| Client tool | Wait for response | Interaction behavior |
| --- | --- | --- |
| `show_movie_selection` | On | Returns after the next discovery UI is rendered. |
| `show_showtimes` | On | Returns after showtimes are rendered or a truthful failure is known. |
| `show_seat_map` | On | Returns after the seat map is rendered. It never waits for the guest to select seats. |
| `select_seats` | On | Returns after seat validation and checkout pricing. |
| `show_booking_summary` | On | Returns the authoritative saved or verified booking state. |
| `show_booking_for_cancellation` | On | Returns the exact cancellation phase and message. |
| `show_offers` | On | Returns the published offer guidance and missing details. |
| `handover_to_agent` | On | Returns whether the clarification threshold or explicit-request rule allowed handover. |

The protected non-blocking rule for `show_seat_map` means it must not wait for a later customer seat-selection turn. Waiting only for the map-loading handler to return does not change that rule. `select_seats` remains the only voice client tool that confirms seat labels.

## `show_movie_selection`

Type: client tool

Description:

> Display the cinema picker, the next progressive discovery question, or the movie cards filtered by the retained guest criteria.

Parameters:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "cinemaId": {
      "type": "string",
      "description": "Exact cinema ID returned by the widget when available."
    },
    "cinemaName": {
      "type": "string",
      "description": "Spoken or displayed VOX Cinemas UAE location name."
    },
    "date": {
      "type": "string",
      "description": "Requested programming date as supplied by the guest."
    },
    "displayDate": {
      "type": "string",
      "description": "Human-readable date wording when no normalized schedule date is available."
    },
    "scheduleDate": {
      "type": "string",
      "description": "Normalized programming date in YYYY-MM-DD form when known."
    }
  },
  "required": []
}
```

Agent rule:

> Call `show_movie_selection` only when the widget has not already supplied an authoritative local result for the same turn. Read the returned `shown`, `movies`, `missing`, `reason`, and retained preferences literally. Never claim that movies are displayed when the result contains zero cards.

## `show_showtimes`

Type: client tool

Description:

> Display current showtimes for one exact movie from the widget's authoritative movie result.

Parameters:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "movieId": {
      "type": "string",
      "description": "Exact movie ID returned by show_movie_selection when available."
    },
    "movieTitle": {
      "type": "string",
      "description": "Exact displayed movie title selected by the guest."
    },
    "date": {
      "type": "string",
      "description": "Requested programming date as supplied by the guest."
    },
    "displayDate": {
      "type": "string",
      "description": "Human-readable date wording when no normalized schedule date is available."
    },
    "scheduleDate": {
      "type": "string",
      "description": "Normalized programming date in YYYY-MM-DD form when known."
    }
  },
  "required": []
}
```

Agent rule:

> Use only a real movie ID or exact title returned by the widget. If no exact requested time exists, state that clearly and describe only the nearest options returned by the tool.

## `show_seat_map`

Type: client tool

Description:

> Load and display the seat map for one current returned session. Return after the map is ready and never wait for the guest to choose seats.

Parameters:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "movieTitle": {
      "type": "string",
      "description": "Exact displayed movie title for the selected session."
    },
    "sessionId": {
      "type": "string",
      "description": "Exact session ID returned by show_showtimes when available."
    },
    "showtime": {
      "type": "string",
      "description": "Displayed showtime used only when a unique session ID is not available."
    },
    "ticketQuantity": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10,
      "description": "Optional conversational seat target only. It never creates a quantity stage or determines ticket count, pricing, or checkout."
    },
    "date": {
      "type": "string",
      "description": "Requested programming date as supplied by the guest."
    },
    "displayDate": {
      "type": "string",
      "description": "Human-readable date wording when no normalized schedule date is available."
    },
    "scheduleDate": {
      "type": "string",
      "description": "Normalized programming date in YYYY-MM-DD form when known."
    }
  },
  "required": []
}
```

Agent rule:

> Use a current returned session and never invent an ID. When the map is displayed, ask the guest to say or tap seat labels. A phrase such as "three tickets" is guidance toward three selected seats, not an independent quantity.

## `select_seats`

Type: client tool

Description:

> Confirm the exact seat labels selected by the guest and display checkout using seat-derived ticket count and pricing.

Parameters:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "seats": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string"
      },
      "description": "Exact available seat labels, for example E1 and E2."
    }
  },
  "required": [
    "seats"
  ]
}
```

Agent rule:

> Call `select_seats` only after the guest names seats or confirms the visible tapped selection. A confirmed result means checkout is displayed. It does not mean payment, reservation, booking confirmation, reference creation, or official QR creation.

## `show_booking_summary`

Type: client tool

Description:

> Display a known saved or provider-verified booking summary after matching its booking reference.

Parameters:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "movieTitle": {
      "type": "string",
      "description": "Movie title associated with the known booking."
    },
    "screen": {
      "type": "string",
      "description": "Screen associated with the known booking."
    },
    "showtime": {
      "type": "string",
      "description": "Showtime associated with the known booking."
    },
    "seats": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Seat labels associated with the known booking."
    },
    "ref": {
      "type": "string",
      "description": "Exact booking reference used to find the authoritative stored or active record."
    },
    "total": {
      "type": "number",
      "description": "Known booking total. The widget still treats its stored record as authoritative."
    }
  },
  "required": [
    "ref"
  ]
}
```

Agent rule:

> Read the returned verification and source fields literally. A device-only record is a saved booking summary, not a paid or provider-confirmed admission booking.

## `show_booking_for_cancellation`

Type: client tool

Description:

> Display current on-device bookings for target selection or continue cancellation for one exact displayed booking reference.

Parameters:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "bookingRef": {
      "type": "string",
      "description": "Exact displayed booking reference. Omit it only when the widget must show current bookings for target selection."
    }
  },
  "required": []
}
```

Agent rule:

> When multiple current bookings are shown, accept an exact displayed movie title or reference and never route that continuation into movie discovery. Speak only the returned cancellation phase. After a microphone yes/no answer during an active cancellation confirmation, call this same tool exactly once with the active booking reference, wait for its response, and speak only its returned message once. Do not repeat the prior confirmation. Typed yes/no decisions are handled locally by the widget and do not require another tool call. During an eligible retryable cancellation error, a spoken no or keep booking answer must also call this tool exactly once with the same active booking reference, wait for its response, and speak only its returned message once. Never answer that decline from memory. A spoken yes during an error does not authorize a destructive retry. Never claim a refund or cancellation succeeded until the authoritative result confirms it.

## `show_offers`

Type: client tool

Description:

> Show published VOX Cinemas UAE bank-offer guidance using the guest's non-sensitive eligibility details and locally derived booking totals.

Parameters:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "bankName": {
      "type": "string",
      "description": "Bank name or alias, for example ENBD, Emirates NBD, FAB, ADCB, or HSBC."
    },
    "cardName": {
      "type": "string",
      "description": "Exact card product or tier when known, for example Visa Infinite or TouchPoints Platinum. Never request card numbers or payment credentials."
    },
    "experience": {
      "type": "string",
      "description": "Selected cinema experience, for example STANDARD, IMAX, MAX, 4DX, GOLD, or THEATRE."
    },
    "detailTopic": {
      "type": "string",
      "enum": [
        "summary",
        "cards",
        "experiences",
        "limits",
        "redemption",
        "exclusions",
        "terms",
        "all"
      ],
      "description": "Specific offer detail requested by the guest."
    },
    "format": {
      "type": "string",
      "description": "Selected 2D or 3D format when relevant to the offer."
    },
    "seatType": {
      "type": "string",
      "description": "Selected non-sensitive seat category, for example REGULAR, PREFERRED, PREMIUM, SAPPHIRE, or BALCONY."
    },
    "isMember": {
      "type": "boolean",
      "description": "Whether the guest confirms they are logged in as a VOX member."
    },
    "monthlyTicketsUsed": {
      "type": "integer",
      "minimum": 0,
      "description": "Guest-provided count of offer tickets already used this month when the published limit requires it."
    },
    "monthlySpend": {
      "type": "number",
      "minimum": 0,
      "description": "Guest-provided monthly retail spend in AED when the published card rule requires it."
    }
  },
  "required": []
}
```

Agent rule:

> When the guest asks about a bank or card deal, call `show_offers`. Read the returned `answer` as one concise sentence. Treat `eligible` as listed eligibility subject to checkout, `ineligible` as a known rule failure, and `card_required` as a request for one returned missing detail. When the result contains `showtimeRequired: true`, ask the guest to choose a showtime or experience. Never say an offer was applied or redeemed. Ticket count and order total are derived locally from selected seats and checkout, so they are not tool parameters.

## `handover_to_agent`

Type: client tool

Description:

> Prepare a safe VOX Customer Care handover for an explicit human request or after two genuine failed clarifications.

Parameters:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "reason": {
      "type": "string",
      "enum": [
        "explicit_request",
        "clarification_failure",
        "fallback"
      ],
      "description": "Approved reason for preparing the handover."
    },
    "detail": {
      "type": "string",
      "description": "Short non-sensitive explanation of the unresolved request. Never include payment or card details."
    }
  },
  "required": [
    "reason"
  ]
}
```

Agent rules:

> If the guest explicitly asks for a person, human, representative, customer care, or agent, call `handover_to_agent` immediately with `reason: "explicit_request"`.

> After the first genuinely unresolved clarification, call `handover_to_agent` with `reason: "clarification_failure"`. If it returns `handoverStarted: false`, ask exactly one short, concrete clarification. If that clarification also fails, call the tool again with the same reason.

> When `handoverStarted: true`, tell the guest that their safe journey summary is ready for VOX Customer Care. Do not claim that a Genesys transfer occurred until an external connector confirms it.

## Dynamic variables

The web client supplies all 13 variables below as strings when it starts each session. ElevenLabs currently derives the dashboard placeholder list from `{{...}}` references in the prompt and first message. Set the detected `voxi_session_opening` test default exactly as shown below. Do not add artificial prompt references merely to force the other runtime variables into that dashboard list.

| Variable | Dashboard test default | Purpose |
| --- | --- | --- |
| `preferred_language` | `English` | Explicitly selected active language. |
| `voxi_session_id` | `not_assigned` | Stable logical Voxi journey ID. |
| `voxi_previous_conversation_id` | `none` | Previous ElevenLabs transport ID during continuation. |
| `voxi_is_continuation` | `false` | Whether this transport continues an existing journey. |
| `voxi_intent` | `not_yet_known` | Current booking, cancellation, offer, handover, or enquiry intent. |
| `voxi_movie` | `not_selected` | Current selected movie title. |
| `voxi_cinema` | `not_selected` | Current selected cinema name. |
| `voxi_booking_progress` | `start` | Current logical booking stage. |
| `voxi_booking_status` | `not_confirmed` | Current truthful booking status. |
| `voxi_performance_date` | `not_selected` | Current performance or selected programming date. |
| `voxi_refund_status` | `not_applicable` | Current truthful refund status. |
| `voxi_refund_reference` | `not_issued` | Provider refund reference only when one exists. |
| `voxi_session_opening` | `Hi, welcome to VOX Cinemas. I'm Voxi, your AI assistant. How can I help you today?` | Localized first message or no-greeting continuation acknowledgement. |

The complete redacted journey, retained discovery preferences, recent turns, and approved FAQ context arrive after connection through a contextual update. Extra runtime variables are accepted by the published agent even when they are not displayed as dashboard placeholders, as confirmed by the local and hosted text sessions.

## Core prompt safeguards

- Never ask the guest to say a card number, expiry, CVV, OTP, password, Emirates ID, or bank credential. Checkout happens only on screen.
- Keep secure payment guest-controlled. The guest must click or tap the on-screen checkout controls. A spoken or typed pay, confirm, or yes instruction must never authorize payment or select a payment method.
- Keep `show_seat_map` non-blocking with respect to customer interaction. When the guest names seats, call `select_seats` with those labels.
- Never ask for a separate ticket quantity and never introduce a quantity stage or quantity controls. One selected seat is one ticket. Selected seats are the only source of ticket count, pricing, fees, offers context, and checkout totals.
- Treat "I need three tickets" and similar utterances only as a conversational target. Guide the guest to select three seats, but allow checkout with the seats actually selected.
- Before suggesting movies, extract every requirement already supplied: cinema or location, date, preferred time, genre, movie language, experience or format, specific movie, and kids or family audience.
- Ask one concise question only for a genuinely missing requirement. Do not ask again for information already present in journey context.
- Filter movies and showtimes with every retained requirement. If there is no exact preferred-time showtime, state that and offer only the nearest relevant times.
- When the guest changes cinema, date, movie, or showtime, discard prior seats and pricing. Changing genre, language, experience, audience, or preferred time must refresh results.
- Use returned movie and session IDs. Never invent IDs, showtimes, bookings, prices, offers, or customer information.
- Maintain one active language. Never switch automatically because speech, a transcript, or platform language detection contains the other language.
- One word, a mixed phrase, background speech, unclear audio, or one sentence in the other language does not confirm a switch. Ask for confirmation in the active language before switching or processing that business request.
- The visible language selector and a direct command such as "Switch to Arabic" are explicit. A capability question such as "Can you speak Arabic?" still requires confirmation.
- Preserve cinema, movie, showtime, seats, checkout, booking, cancellation, refund, offer, history, and FAQ context across a language or transport switch.
- When the guest temporarily changes to an unrelated topic or FAQ, hide the currently visible rich panel while answering, but retain the exact booking or cancellation journey as paused state. An ordinary topic change, FAQ, voice disconnect, or voice-to-text switch must never clear it.
- Recognize the restore phrases "Continue my booking", "Go back to the seats", "Show the showtimes again", "Return to checkout", and "Continue where I stopped". Restore the matching paused step only after its required availability, pricing, session, or booking revalidation succeeds.
- End the current booking journey only for an explicit request to abandon or end that journey. Keep this lifecycle distinct from cancelling an existing booking record, and ask one focused clarification when the word cancel is ambiguous.
- Resolve cancellation targets from a booking reference, movie title, absolute or relative performance date, exact showtime, time band, cinema, displayed list position, contextual "this movie", or any combination of those criteria.
- When more than one booking matches, ask only for the smallest detail that distinguishes the candidates. Once one target is authoritative, the confirmation contains exactly movie, cinema, performance date, showtime, booking reference, and cancellation or refund impact, followed by one yes/no question.
- Bank-offer terms are guidance subject to the bank and VOX checkout. Never say an offer was applied.
- Payment, offer redemption, Vista writes, Genesys, OneView, provider cancellation, and provider refunds remain unavailable until their production connectors are enabled.
- Never use Unicode em dash or en dash punctuation in a customer-facing response.

## Language and first-message behavior

- The web client supplies the selected locale through `preferred_language` and its contextual journey.
- The client intentionally does not send an `agent.language` override.
- The client intentionally does not send an `agent.firstMessage` override because unauthorized overrides terminate the session.
- The dashboard first message must be exactly `{{voxi_session_opening}}`.
- A first transport receives the localized welcome. A continuation receives a short acknowledgement without a new greeting.
- Changing language during a connected session must not replay the first message.
- Keep English and Arabic configured as supported dashboard languages, with voices suitable for `en-AE` and `ar-AE` acceptance testing.
- Keep the automatic ElevenLabs language-detection system tool disabled. The agent prompt and web client own explicit confirmation.

## Text and voice session behavior

- A typed first message starts a text-only ElevenLabs session over WebSocket.
- Text-only startup must not call `getUserMedia`, request microphone permission, or create an audio track.
- Voice starts only after the guest selects the microphone control and grants permission.
- Voice remains on WebRTC.
- `serverLocation: "eu-residency"` remains unchanged.
- Moving between text and voice preserves the same logical journey, language, recent turns, selected booking state, and pending checkout.
- Published local text smoke reached `Text chat` and passed the Voxi identity and FAB 2D-only responses.
- Published hosted text smoke reached text chat in English and Arabic with no console warnings or errors.
- The publication verification exercised voice startup through the permission gate, but the controlled browsers could not expose microphone permission. Live audio remains a manual normal-browser check.

## Dashboard verification

1. Confirm the EU-residency dashboard target is `agent_2701kxvmnje2fnf9qfm1fayfc4eb`.
2. Confirm all eight exact client-tool names and schemas match `config/elevenlabs-agent-contract.json`.
3. Enable Wait for response on all eight tools. Confirm `show_seat_map` returns after map loading and never waits for a later seat-selection turn.
4. Confirm the system prompt matches `VOXI_AGENT_PROMPT` at contract version `2026-07-18.1`.
5. Set the first message to `{{voxi_session_opening}}`.
6. Create all 13 dynamic-variable placeholders and defaults.
7. Configure English and Arabic support, then disable the automatic `language_detection` system tool.
8. Confirm WebRTC and public-agent access are allowed for the deployed origin.
9. Start English and say one Arabic word or a mixed sentence. Verify Voxi asks for confirmation in English without switching or processing the request.
10. Confirm an explicit switch to Arabic during booking and cancellation. Verify the same task resumes in Arabic without another welcome.
11. Repeat the language test using the visible Arabic and English selector actions.
12. Start text chat with microphone permission blocked. Verify typed interaction works without a permission prompt.
13. Start voice explicitly and verify the conversation uses WebRTC and EU residency.
14. Test "Any offers with my ENBD Visa Infinite card for 4DX?" and verify missing eligibility details are requested one at a time without requesting payment credentials.
15. Test each `detailTopic` value for offer summary, cards, experiences, limits, redemption, exclusions, terms, and all details.
16. Test "I want to speak to a human" and verify immediate explicit-request handover preparation.
17. Test two consecutive failed clarifications. Verify the first tool result does not start handover and the second does.
18. Test cinema, date, time, genre, movie language, experience, exact title, and kids or family criteria individually and in combination.
19. Test "I need three tickets" and verify Voxi guides the guest to select three seats without a quantity control. Select two seats and verify checkout reports two tickets.
20. Return from checkout, change seats, and verify ticket count and totals are recalculated.
21. Change cinema, date, movie, or showtime and verify prior seats and pricing are cleared.
22. From a visible booking or cancellation panel, ask an unrelated FAQ. Verify the rich panel is hidden while the answer is shown and the exact journey remains paused.
23. Verify each restore phrase independently: "Continue my booking", "Go back to the seats", "Show the showtimes again", "Return to checkout", and "Continue where I stopped". Confirm the matching stage is revalidated before it is restored.
24. During a paused journey, disconnect voice and continue in text. Verify neither the disconnect nor the voice-to-text switch clears the paused state.
25. Test cancellation by reference, movie, performance date, relative date, exact showtime, time band, cinema, displayed list position, "this movie", and combined criteria.
26. Create an ambiguous cancellation match and verify Voxi asks only for the smallest differentiating detail. Select a unique target and verify its confirmation states only movie, cinema, performance date, showtime, booking reference, cancellation or refund impact, and one yes/no question.
27. Verify that explicitly abandoning the current booking journey clears it, while cancelling an existing booking record remains a separate cancellation flow. Verify secure payment can be initiated only by clicking or tapping checkout, never by a spoken or typed pay instruction.

## Contract update procedure

When the dashboard contract or `VOXI_AGENT_PROMPT` changes:

1. Update `config/elevenlabs-agent-contract.json` without renaming protected tools or changing `select_seats`.
2. Increment both the contract and prompt version.
3. Recalculate the SHA-256 value from UTF-8 prompt-source text with line endings normalized to LF.
4. Update the version and hash at the top of this guide.
5. Run `pnpm run validate` and `pnpm run build` before synchronizing the dashboard.
6. Save a redacted dashboard export or screenshot proving the prompt version, first message, languages, tool schemas, and Wait for response flags.
