# Voxi concierge interaction implementation

## Outcome

The widget now treats chat, voice and visual booking controls as one logical Voxi conversation. Messages and the current relevant component render in one scrollable window. A new stage replaces the previous interactive stage, while transcript history remains visible. Text chat still starts over WebSocket without microphone access; voice still starts over WebRTC with `serverLocation: "eu-residency"`.

## Root causes found

1. The transcript and the rich stage were rendered in separate scroll regions. A client tool could change the stage, but it could not place that result beside the assistant turn that caused it.
2. Booking context was split across `stage`, independent React state and refs. A newly created ElevenLabs transport received only a short UI summary, so text-to-voice switching lost intent and recent turns.
3. The logical conversation ID was overwritten by each ElevenLabs conversation ID. That made a transport switch look like a new customer journey.
4. Transport disconnects and intentional conversation resets had no distinct lifecycle contract. The UI needs to survive an SDK-only disconnect, while explicit restart, logout and the privacy timeout must still clear transient state.
5. Completed orders stored a movie title and tint but did not always retain the poster URL. Title-only or remote bookings therefore had no deterministic media path.
6. The crawl contained nine programming dates, but the Vista-shaped client always filtered films and sessions to one date.
7. General-enquiry facts were embedded only in prompting, without a versioned bilingual schema, source metadata, static/API distinction or deterministic resolver.
8. Cancellation confirmation could leave a blocking client-tool promise unresolved when the customer declined or stopped responding.

## Implemented architecture

### Logical journey state

`src/lib/conversationJourney.js` defines the transport-independent state passed between text and voice:

```text
sessionId
transportConversationId / previousTransportConversationId
intent and locale
cinema and movie
schedule date and session/showtime
actual ticket count derived from selected seats and an optional conversational seat target
ticket type
experience and selected seats
food items
booking progress and booking reference
last activity time
```

The logical `sessionId` remains stable while ElevenLabs transport IDs are recorded separately. UI state is projected into this snapshot on every relevant change. Changing cinema/date/movie/session cascades later booking fields instead of leaking seats or an earlier booking into a new request.

### Unified rendering

`App.jsx` has one `<main>` conversation scroller. It contains:

- the bounded transcript;
- the one current relevant component (cinemas, dates/movies, showtimes, seats, checkout, booking, history, offers, FAQ or handover);
- no detached 200 px transcript panel.

Because `stage` is singular, replacing it removes earlier interactive cards. The transcript remains as readable history, but stale cards cannot still be clicked.

### Guided booking flow

The current flow is:

```text
intent/requirements → progressively filtered movies → showtime/experience
                    → seats/type → checkout → confirmation → persisted history
```

Cinema, city/location, date, preferred time, genre, language, experience, specific movie and kids/family intent are retained as discovery preferences. Voxi asks only for a missing requirement, applies every available criterion, and presents nearby showtimes when there is no exact preferred-time match. Changing an upstream booking choice invalidates incompatible downstream state.

There is no ticket-quantity stage or plus/minus control. Each selected seat is exactly one ticket, and the selected-seat count is the only source for ticket count, quote, fees and checkout totals. A request such as “three tickets” is retained only as a conversational target so Voxi can guide the guest toward three seat selections; it never gates checkout. Guests can return from checkout to the editable seat map, change seats and receive an updated summary. Seat tier provides the current ticket type, and experience comes from the selected session. Food and beverage guidance is available through the FAQ layer; a transactional F&B step remains dependent on a live menu/order API.

The existing client-tool names and response contracts remain registered, including the non-blocking `show_seat_map` and protected `select_seats` path. Voice and touch call the same handlers.

### Text-to-voice continuation

Before a new transport starts, the app builds a redacted handoff containing:

- logical session ID and previous ElevenLabs conversation ID;
- active language and inferred intent;
- cinema, movie, date, showtime and experience;
- actual ticket count, optional requested-seat target, ticket type and selected seats;
- booking progress/reference;
- the last eight relevant user/assistant turns.

Payment-number patterns and OTP/password/PIN values are removed. At `startSession`, safe scalar values are passed as ElevenLabs dynamic variables:

```text
preferred_language
voxi_session_id
voxi_previous_conversation_id
voxi_is_continuation
voxi_intent
voxi_movie
voxi_cinema
voxi_booking_progress
voxi_session_opening
```

After connection, the complete structured snapshot, recent turns, Voxi prompt and FAQ context are sent with `sendContextualUpdate`. That method does not create a user turn; the typed message is then sent with `sendUserMessage`.

For guaranteed audible no-regreeting, the ElevenLabs dashboard first-message field should reference `{{voxi_session_opening}}`, or the dashboard must enable the First Message override. This agent previously rejected an unauthorized first-message override, so the client intentionally does not send one. The app suppresses duplicate welcome transcripts and supplies the continuation instruction, but it cannot retroactively mute a dashboard-generated first audio message.

### Conversation lifecycle

An unexpected SDK disconnect ends only the text/voice transport. The transcript, selected cinema and current local view (including booking history) remain mounted, and the next text turn reconnects with the same logical journey context.

Transient state is cleared on:

- the header “new conversation” action;
- 15 minutes of inactivity;
- `window` event `voxi:new-conversation`;
- `window` event `voxi:logout`;
- widget unmount (including pending cancellation resolution).

Reset removes transcript, stage, selected cinema/movie/session/seats, pending checkout, offer and handover state, caches and transport IDs. Completed/cancelled bookings in local storage remain intact.

Cancellation decline resolves the pending tool with `{ confirmed: false }`. Unanswered confirmation expires after 90 seconds. A route revision rejects a booking lookup that completes after the guest has moved elsewhere.

## Poster fix

Completed orders now persist `posterUrl`. `getMoviePosterUrl()` resolves media in this order:

1. explicit booking poster/media/images;
2. movie ID in generated film data;
3. Unicode-normalized movie title;
4. compact gradient/film fallback.

Only supported web, blob, image-data and relative image URLs are accepted. Failed or zero-dimension image loads fall back safely. Booking confirmation keeps the 56 × 80 poster size.

## Programming-date API changes

`vistaClient.js` now exports `getProgrammingDates()` and accepts an optional explicit date in:

```js
getScheduledFilms(cinemaId, displayDate)
getSessions(cinemaId, scheduledFilmId, displayDate)
```

The nine extracted dates are selectable inline. Film caching is keyed by cinema and date, and async results are rejected if the selected cinema/date has changed.

## FAQ and knowledge design

`src/knowledge/voxFaqData.js` contains 17 bilingual customer entries across 11 requested topics, plus explicit Voxi product-capability guidance within that catalog:

- locations and hours;
- tickets/e-tickets;
- cinema experiences and availability;
- food and drinks;
- bank/card offers;
- accessibility;
- movie and experience age restrictions;
- booking/cancellation/refunds;
- account/loyalty and VOX Wallet/Credit;
- contact/support.

Each entry includes an ID, topic, priority, English/Arabic utterances and answer, tags, audience, review date, freshness/cadence and `delivery.kind` (`static` or `api`). Policy entries cite official sources; the language/voice/text entry is explicitly marked as current Voxi product behavior rather than VOX policy. High-volatility values are routed to existing providers: cinemas/sessions use the Vista-shaped layer and offers use the current offer resolver. Cinema hours are never invented.

The deterministic resolver supports Arabic normalization and mixed-language queries but always answers in the explicitly selected locale. Query-specific FAQ context is sent before the user message. A bounded catalog is also supplied at session start for voice turns.

Recommended production migration:

1. Keep policy/editorial answers in a customer-approved, versioned CMS or ElevenLabs knowledge base.
2. Keep inventory, prices, showtimes, experience availability, offers, bookings and wallet balance API-driven.
3. Separate `audience: customer` content from internal SOP/escalation material before ingestion.
4. Require source URL, owner, reviewed date, expiry/freshness and locale completeness on every article.
5. Sync by stable entry ID, publish deltas, validate links/schema, and retain the prior approved version for rollback.

Current first-party sources include:

- <https://uae.voxcinemas.com/faq>
- <https://uae.voxcinemas.com/refunds>
- <https://uae.voxcinemas.com/contact-us>
- <https://uae.voxcinemas.com/about>
- <https://uae.voxcinemas.com/promotions>
- <https://uae.voxcinemas.com/share>
- <https://uae.voxcinemas.com/vox-cinemas-app>

## Supporting UX and safety hardening

- Transactional booking, cancellation and booking-history commands now bypass FAQ rendering and continue through the journey/tool router. Policy questions still use curated FAQ answers, and cancellation guidance exposes the routing topic expected by the cancellation UI. English and UAE-colloquial Arabic cases are covered by deterministic tests.
- Offer results are no longer labelled eligible when a material input is unknown. Membership, booking channel, ticket count, order total, monthly usage/spend, cinema, format and seat category are requested when the selected offer depends on them. Generic card tiers such as `Visa Infinite` or `Platinum` no longer guess an issuing bank.
- Checkout starts with no personal/default card. The required add-card/Luhn preview path remains available with the supplied payment-preview card (`4111 1111 1111 1111`). PAN and security code exist only in component memory, are cleared after use, and are never sent to Voxi or a server. Local storage contains only masked display metadata (brand, last four, preview name and expiry). `VITE_VISTA_BASE` controls read data only; checkout remains in the transaction sandbox unless a future hosted payment integration explicitly selects another mode.
- Booking confirmation and history now show cinema, performance date/time and active/cancelled status. Movie, showtime, seat, cinema and offer panels provide explicit empty/error states and optional retry actions.
- Unknown or invalid experience artwork uses the validated Standard experience image as a generic fallback. All new labels and status messages have matching English and Arabic strings.
- `scripts/validateSupportingUx.mjs` protects the checkout data boundary, explicit sandbox default, booking detail fields, retry copy and experience fallback.

## Verification

Automated validation covers extracted data, booking persistence, offers, handover redaction, English/Arabic parity, explicit language switching, protected transport/tool invariants, FAQ schema/resolution, logical journey handoff, lifecycle hooks, unified UI, dates and poster wiring.

The final local 420 px browser run covered:

- clean launch and all 22 cinemas;
- all nine programming dates;
- movie posters and showtimes;
- three-seat selection, automatic reduction to two seats, matching quote updates, checkout Back and a changed-seat checkout;
- completed local booking persistence and confirmation poster rendering;
- FAQ interruption/return and cancellation confirmation cleanup;
- manual reset and retained history;
- live text-only ElevenLabs chat without microphone access;
- sourced English and Arabic FAQ answers;
- explicit English/Arabic RTL/LTR switching;
- combined cinema/date/time, genre, kids/family, experience, exact-title and nearest-time filtering;
- 420 px English and Arabic layouts without document-level horizontal overflow.

The current automated browser voice attempt reached the microphone-permission boundary, timed out and recovered cleanly to text chat. No current-build spoken acceptance is claimed. The public `VITE_AGENT_ID`, microphone-gated WebRTC transport and protected EU-residency configuration remain in place, and the same cinema-selection route is covered for typed and spoken transcripts by the automated regression suite. Human English/Arabic voice acceptance on the deployed origin remains required.

## Remaining production dependencies and risks

- Configure the ElevenLabs dashboard first message to use `voxi_session_opening` for guaranteed audible no-regreeting.
- Provide authenticated production Vista, booking/refund, wallet/loyalty, F&B catalog/order and hosted payment services. The current checkout stays in the transaction sandbox even when live read data is configured; real transaction modes must be introduced explicitly behind server-side adapters. Handover prepares a safe summary until the external connector is enabled.
- Add an explicit date-selection client tool in the ElevenLabs dashboard only if voice-only guests must change dates without tapping. No new tool name was introduced here.
- Live cinema hours and current offer eligibility must remain API-driven.
- The current JavaScript bundle emits Vite’s over-500 kB chunk warning; route/media code splitting is recommended before production rollout.
- Validate microphone permissions and WebRTC on the target deployment origin and supported mobile browsers.
