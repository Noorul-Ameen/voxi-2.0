# VOXi end-to-end validation report

Test date: 17 July 2026, UAE

Build under test: local working tree, production build from `pnpm run build`

Current working branch: `concierge-inline`

Local URL: <http://127.0.0.1:4173/>

Hosted URL: <https://voxi-ai.pages.dev/>

Hosted status: the changes covered by this report are not yet deployed.

## Executive result

| Area | Status | Result |
| --- | --- | --- |
| Bank-offer catalogue and details | PASS | 21 promotions across 20 offer groups, 42 card profiles, detailed English and Arabic content, official links, and truthful eligibility states. |
| Typed bank-offer conversation | PASS LOCALLY | Specific bank and card questions work without microphone or external transport and open the same rich offer panel. |
| Bank-offer search | PASS | Exact issuer searches are narrow and generic card or benefit searches remain broad. |
| 420 px visual layout | PASS | English LTR and Arabic RTL fit the protected widget width without widget-level horizontal overflow. |
| Core booking regression suite | PASS | Discovery, seat-derived ticket count, checkout return, cancellation continuation, FAQ continuity, history, and handover validators passed. |
| Repository ElevenLabs contract | PASS | Prompt, protected transport, first message, languages, variables, and eight client tools match the versioned contract. |
| Published ElevenLabs dashboard | PASS | The exact target agent returns HTTP 200 from the EU token endpoint and matches the repository prompt, first message, languages, and eight client tools. The widget supplies all 13 journey variables at runtime. |
| Live ElevenLabs text | PASS LOCAL AND HOSTED | Text chat connected locally and on Cloudflare. English and Arabic identity responses passed, and the local FAB offer follow-up passed. |
| Live spoken voice audio | ENVIRONMENT BLOCKED | The controlled in-app browser and Chrome did not expose a microphone permission state. Voice startup timed out safely and returned to text chat without losing the conversation. |
| Cloudflare published-agent compatibility | PASS | The current hosted widget connected to the newly published agent in English and Arabic with no console warnings or errors. Remaining local code changes still require an authorized deployment. |
| Live customer transactions | BLOCKED | Production inventory, payment, ticket, cancellation, refund, and related provider APIs are unavailable. |

## What changed

### Complete bank-offer knowledge

- Added structured offer facts for every current issuer shown on the official VOX UAE bank-deals page.
- Grouped 21 promotions under 20 offer cards. Citi has two separately sourced campaigns.
- Added 42 card or card-tier profiles.
- Added English and Arabic content for summary, cards, experiences, formats, seat categories, monthly and booking limits, membership rules, exclusions, location rules, redemption, food and drink benefits, expiry, and complete terms.
- Added official catalogue, detail, and terms links for each promotion when those pages publish information.
- Added explicit source-boundary warnings where an official page is blank or one campaign must not inherit another campaign's terms.
- Added contextual guidance that evaluates non-sensitive facts only. The code never accepts card numbers, CVV, OTP, passwords, or bank credentials.

### Search and conversation behavior

- Exact issuer and strong alias matches now narrow to the intended bank.
- Generic card-tier and benefit searches still return all relevant issuers.
- Typed issuer or card questions in English and Arabic use the existing `show_offers` tool handler while disconnected.
- Local typed fallback is limited to specific offer questions. It does not take over generic FAQ, cancellation, refund, booking history, cinema selection, seat selection, checkout return, or language commands.
- A clean card selection with no showtime context now requests a showtime experience instead of incorrectly returning ineligible.
- Checkout remains resumable after viewing or refining offers.

### Offer interface

- Catalogue cards start compact, while a targeted bank or card match opens automatically. Cards progressively reveal tiers, limits, experiences, redemption, food and drink details, full terms, and official sources.
- Search, membership status, and card-selection controls meet the 44 px touch-target goal.
- Long card names and condition text wrap inside the 420 px widget.
- Focus states, disclosure indicators, RTL layout, reduced-motion handling, and readable body text are present.
- Duplicate list keys, blank expiry spacing, and disclosure-state reset issues are fixed.

## Official sources and boundaries

Primary sources:

- [VOX UAE bank deals](https://uae.voxcinemas.com/offers/bank-deals)
- [FAB buy one ticket get one free](https://uae.voxcinemas.com/offers/bank-deals/fab-buy-one-ticket-get-one-free)
- [FAB terms and conditions](https://uae.voxcinemas.com/offers/bank-deals/fab-buy-one-ticket-get-one-free/terms-conditions)

Source limitations found during validation:

- Sharjah Islamic Bank is listed as a 50 percent offer, but its detail and terms pages do not publish eligible cards or conditions. VOXi reports that limitation and requires checkout verification.
- The standalone Citi BOGO page has no detailed terms. The separately published Citi 30 percent or BOGO campaign contains card-tier information and is displayed as a separate source.
- Conflicting or incomplete published terms are surfaced as caveats. They are not silently resolved in favor of eligibility.

## Automated validation

Command: `pnpm run validate`

Result: PASS

The aggregate suite validated:

- 9,668 schedule sessions, 37 films, 22 cinemas, and 20 dates.
- Snapshot manifest integrity, 283 on-demand shards, cache reuse, seat metadata, and source-session deduplication.
- Progressive discovery, retained criteria, exact-time and nearest-time behavior, bare-date progression, and current programming-day filtering.
- Text and voice transcript routing parity.
- Versioned booking persistence, duplicate merge safety, cancellation state, and explicit clearing.
- Cancellation by exact displayed movie title or booking reference without escaping into movie discovery.
- Seat routing, invalid-seat rejection, idempotent confirmation, and seat-derived ticket count.
- Checkout FAQ continuity, return to seat map, edit-seat repricing, payment lock, and completion cleanup.
- 21 promotions, 20 offer groups, 42 card profiles, 882 bilingual offer answers, official links, unpublished-detail boundaries, and tri-state eligibility.
- Specific English and Arabic offer fallback, detail topics, cancellation priority, checkout return, and voice-path isolation.
- Exact bank search regressions for SIB, FAB, Citibank, Emirates NBD, HSBC, and ADCB.
- Broad card and benefit search regressions for Visa Infinite and buy one get one free.
- English and Arabic UI matching, explicit language switching, and confirmation-only language changes.
- Protected WebRTC voice, WebSocket typed chat, EU residency, bounded startup, worklet assets, and safe recovery.
- The versioned ElevenLabs prompt, first message, 13 variables, and eight exact client tools.
- FAQ knowledge, conversation routing, handover threshold, redaction, and unified rendering.
- Customer-facing punctuation across 398 repository text files, including the prohibition on Unicode em dash and en dash characters.
- Fresh schedule coverage from 17 July through 5 August 2026.

## Production build and load budget

Command: `pnpm run build`

Result: PASS

| Measurement | Result |
| --- | --- |
| Initial requests | 2 |
| Initial JavaScript raw | 773,130 bytes |
| Initial JavaScript gzip | 218,599 bytes |
| Initial JavaScript Brotli | 199,055 bytes |
| Initial CSS gzip | 623 bytes |
| Largest schedule shard raw | 54,533 bytes |
| Largest schedule shard gzip | 2,249 bytes |
| Cold-load budget | PASS |

Vite reports its advisory warning for chunks over 500 kB. Both enforced initial-load budgets pass, and the ElevenLabs transport remains deferred until text or voice startup.

## Mounted 420 px browser validation

The production build was reloaded at `http://127.0.0.1:4173/` and tested through its visible interface.

| Scenario | Expected | Actual | Status |
| --- | --- | --- | --- |
| FAB typed question while disconnected | A concise answer and FAB rich panel | Correct answer and only First Abu Dhabi Bank displayed | PASS |
| FAB card selected without experience | Ask for missing showtime experience | `More details needed` and showtime guidance displayed | PASS |
| ENBD card question | List cards and open ENBD | Card summary plus Emirates NBD panel displayed | PASS |
| Arabic FAB question | Arabic answer and Arabic panel | Correct Arabic answer, RTL panel, official source retained | PASS |
| SIB exact search | One issuer | One Sharjah Islamic Bank issuer card | PASS |
| FAB exact search | One issuer | One First Abu Dhabi Bank issuer card | PASS |
| Citibank exact search | One issuer with two campaigns | One Citibank card with two-campaign summary | PASS |
| Emirates NBD exact search | One issuer | One Emirates NBD issuer card | PASS |
| HSBC exact search | One issuer | One HSBC issuer card | PASS |
| ADCB exact search | One issuer | One Abu Dhabi Commercial Bank result | PASS |
| Visa Infinite broad search | Multiple relevant issuers | Eight issuer cards | PASS |
| BOGO broad search | Multiple relevant issuers | Fourteen issuer cards | PASS |
| SIB unpublished conditions | No invented card details | Clear missing-publication warning and checkout verification | PASS |
| Citi source separation | No cross-campaign assumption | Explicit standalone BOGO and separate campaign boundary | PASS |
| FAB complete details | Cards, limits, experiences, redemption, terms, sources | All sections expanded and correct official links displayed | PASS |
| Offer artwork | No failed rendered images | 19 of 19 rendered official images loaded | PASS |
| English layout | 420 px and no widget overflow | Widget width 420 px, content stays inside widget | PASS |
| Arabic layout | RTL, 420 px, no widget overflow | `lang=ar`, `dir=rtl`, widget width 420 px | PASS |
| Runtime logs | No browser errors or warnings | Empty runtime log | PASS |

Screenshots:

These screenshots predate the final subtitle terminology correction from issuers to offer groups. The final build contains the corrected label; layout and offer content are unchanged.

- [FAB compact offer](../evidence/screenshots/local-bank-offers-fab-2026-07-17.png)
- [Arabic FAB offer](../evidence/screenshots/local-bank-offers-arabic-2026-07-17.png)
- [Captured mounted browser results](../evidence/logs/bank-offers-mounted-browser-results-2026-07-17.json)

## Core journey regression matrix

These paths are covered by deterministic validators. The stated live text smokes were replayed through the published target agent, but the complete matrix and live voice audio were not replayed through a remote session.

| Area | Scenario | Status | Evidence basis |
| --- | --- | --- | --- |
| Discovery | Cinema already supplied is not asked again | PASS | Discovery preference and annotated journey validators |
| Discovery | Date already supplied is not asked again | PASS | Discovery prompt validator |
| Discovery | Time filters exact or nearest showtimes | PASS | Discovery and showtime validators |
| Discovery | Genre, kids, family, language, experience, and specific movie filters combine | PASS | Discovery preference validator |
| Discovery | Changing criteria refreshes results | PASS | Preference invalidation validator |
| Seats | One selected seat equals one ticket | PASS | Seat journey validator |
| Seats | No quantity stage or plus and minus control | PASS | Invariant and seat validators |
| Seats | Changing cinema, date, movie, or showtime clears incompatible seats | PASS | Journey state validator |
| Checkout | Return to seats and reprice | PASS | Checkout continuity validator |
| Checkout | FAQ or offers do not destroy checkout | PASS | Checkout continuity validator |
| Booking | Completed local summary persists and displays reference QR | PASS | Booking and unified conversation validators |
| Cancellation | Movie title continues displayed cancellation candidates | PASS | Cancellation journey validator |
| Cancellation | Duplicate title is handled conservatively | PASS | Cancellation safety validator |
| FAQ | Answers remain inline without duplicating rich panels | PASS | FAQ and unified conversation validators |
| Language | English and Arabic preserve journey state | PASS | Language and conversation-mode validators |
| Handover | Explicit request and two distinct failed clarifications | PASS | Handover validator |
| Browser navigation | Document Back and Forward safely exit and restore the standalone page. Transient rich stages use in-widget controls instead of browser history. | PARTIAL BY DESIGN | [Annotated mounted evidence](../evidence/logs/annotated-end-to-end-validation-2026-07-16.md) |
| Punctuation | Customer-facing text contains no prohibited Unicode dash | PASS | Punctuation validator |

## ElevenLabs contract validation

Repository contract: [config/elevenlabs-agent-contract.json](../config/elevenlabs-agent-contract.json)

Setup guide: [ELEVENLABS_AGENT_SETUP.md](../ELEVENLABS_AGENT_SETUP.md)

Contract version: `2026-07-17.2`

Expected public agent ID: `agent_2701kxvmnje2fnf9qfm1fayfc4eb`

Prompt hash: `cd7e157c550647ba23d87073e57800ac083acc04caa4a4bf8a5aa134d52351ac`

Expected client tools:

1. `show_movie_selection`
2. `show_showtimes`
3. `show_seat_map`
4. `select_seats`
5. `show_booking_summary`
6. `show_booking_for_cancellation`
7. `show_offers`
8. `handover_to_agent`

Static contract result: PASS.

Published dashboard result: PASS.

Published findings:

- The isolated target is published as `VOXi Live API Widget` in EU residency.
- Its EU public token endpoint returns HTTP 200.
- Its prompt matches the repository `VOXI_AGENT_PROMPT` after ignoring editor-only surrounding whitespace.
- Its first message is exactly `{{voxi_session_opening}}`.
- Its dashboard test default is set for `voxi_session_opening`. The widget supplies the complete 13-variable journey payload at session start, including values that the dashboard does not list as prompt placeholders.
- It supports English and Arabic, and Detect language is off.
- All eight exact client-tool names and descriptions are present, with Wait for response enabled on every tool.
- First-message override is off and text-only override is on.
- ElevenLabs forces Agent language override on and disables its toggle when Arabic is configured. The widget intentionally sends no language override, so compatibility is preserved.

### Live text smoke

- Status reached: `Text chat`.
- Voxi identity response: "I'm Voxi, the warm, confident bilingual AI assistant for VOX Cinemas UAE."
- FAB follow-up response: "The FAB offer is for 2D tickets only."
- The Cloudflare widget also returned a grounded English Voxi identity and the Arabic response: "أنا ڤوكسي، المساعد الافتراضي ثنائي اللغة الواثق والودود لڤوكس سينما الإمارات."
- Local and hosted text checks recorded 0 console errors and 0 console warnings.

Voice startup reached the microphone permission gate, but the controlled in-app browser and Chrome test surface both reported the permission state as unavailable. The bounded timeout returned safely to text chat, so no live audio was captured. Manual English and Arabic voice validation remains required in a normal browser with an available microphone. Preserve WebRTC, WebSocket text-only startup, `select_seats`, all client-tool names, and `serverLocation: "eu-residency"`.

## Required provider API and knowledge actions

### Required for customer transactions

- Licensed current film, session, seat inventory, and seat-hold APIs.
- Authoritative price, fee, and bank-offer application APIs.
- Secure payment authorization.
- Provider booking confirmation and official ticket or QR issuance.
- Cross-device booking lookup.
- Provider cancellation eligibility, cancellation mutation, refund outcome, and refund-reference APIs.
- Confirmed human-contact connector if live transfer is required.

### Required for sustained bank-offer accuracy

- A VOX-owned structured offer feed or CMS API with promotion ID, issuer, cards, benefit, limits, locations, experiences, expiry, and terms URL.
- A named business owner for offer-copy approval and conflict resolution.
- A scheduled source-diff alert for blank, changed, expired, or conflicting official offer pages.
- A policy decision for whether expired offers stay visible as historical information or disappear immediately.

### Current safe fallback

- Showtimes use the refreshed official public-site snapshot and versioned shards.
- Bank offers use the official public pages captured on 17 July 2026.
- Final ticket and offer eligibility is deferred to VOX checkout.
- Device-only booking and cancellation records are labeled truthfully and never presented as provider-confirmed transactions.

## Evidence files

- [Bank-offer and ElevenLabs validation log](../evidence/logs/bank-offers-elevenlabs-validation-2026-07-17.md)
- [Production readiness summary](../PRODUCTION_READINESS_REPORT.md)
- [ElevenLabs setup guide](../ELEVENLABS_AGENT_SETUP.md)
- [Versioned ElevenLabs contract](../config/elevenlabs-agent-contract.json)
- [FAB screenshot](../evidence/screenshots/local-bank-offers-fab-2026-07-17.png)
- [Arabic screenshot](../evidence/screenshots/local-bank-offers-arabic-2026-07-17.png)
- [Mounted browser result capture](../evidence/logs/bank-offers-mounted-browser-results-2026-07-17.json)

## Final status

The repository-level bank-offer work is complete and no remaining reproducible bank-offer or local layout defect was found. The exact ElevenLabs target is published, and local plus hosted English and Arabic text passed.

Hosted compatibility with the published agent passed. Deployment of the remaining local repository changes, live microphone and voice-audio validation, and customer transactions remain external boundaries. The report does not represent those paths as complete.
