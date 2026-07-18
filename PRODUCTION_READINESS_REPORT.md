# VOXi production readiness summary

Test date: 17 July 2026, UAE

Local verified build: <http://127.0.0.1:4173/>

Cloudflare URL: <https://voxi-ai.pages.dev/>

StackBlitz URL: <https://stackblitz.com/github/Noorul-Ameen/vox-cinemas-agent>

Branch target: `main`

Current working branch: `concierge-inline`

Deployment status: the changes in this report are verified locally and have not been pushed or deployed in this task.

## Decision

| Scope | Status | Decision |
| --- | --- | --- |
| Repository bank-offer implementation | PASS | The widget contains 21 current promotions across 20 offer groups, 42 card profiles, rich English and Arabic details, official sources, contextual eligibility guidance, and precise search. |
| Local UI, deterministic routing, and bounded bank-offer text | PASS | The production build passed automated validation and mounted 420 px browser inspection in English and Arabic. |
| Hosted Cloudflare parity | PENDING DEPLOYMENT | The local changes are not yet on `voxi-ai.pages.dev`. A post-deployment parity run is required after an authorized push. |
| ElevenLabs static repository contract | PASS | The protected WebRTC, WebSocket, EU residency, prompt, language, variable, and eight client-tool requirements pass repository validation. |
| Published ElevenLabs dashboard contract | PASS | The exact target agent is published, its EU public token endpoint returns HTTP 200, and its prompt, first message, languages, tools, and override settings match the repository contract. The widget supplies all 13 journey variables at runtime. |
| Live ElevenLabs text | PASS LOCAL AND HOSTED | Local and Cloudflare text chat connected to the published agent. English and Arabic identity responses passed, and the local FAB follow-up returned the correct 2D-only condition. |
| Live spoken voice audio | ENVIRONMENT BLOCKED | Voice startup reached the microphone permission gate in the controlled in-app browser and Chrome, but neither test surface exposed a microphone permission state. The bounded timeout returned safely to text chat. No live audio was captured. |
| Leadership end-to-end conversational review | PARTIALLY VERIFIED | Local UI plus hosted English and Arabic text are verified. Live spoken audio still requires a normal browser with an available microphone. |
| Customer production sales | BLOCKED | Live seat holds, authoritative prices, payment, ticket issuance, provider QR, cross-device booking lookup, cancellation, and refund APIs are not enabled. |

## Bank offers now working

- The official VOX UAE catalogue is represented as 21 promotions across 20 offer groups.
- The catalogue covers First Abu Dhabi Bank, Mawarid Finance, National Bank of Fujairah, Emirates NBD, Liv Bank, Sharjah Islamic Bank, Aafaq Finance, HSBC, DEEM Finance, Citibank, Standard Chartered, Arab Bank Signature, Commercial Bank of Dubai, Abu Dhabi Commercial Bank, RAKBANK, United Arab Bank, Arab Bank, Emirates Islamic, Mashreq, and ADCB TouchPoints.
- Published information is organized by benefit, exact card or card tier, eligible experience, format, seat type, limits, membership rules, exclusions, location rules, redemption steps, food and drink benefits, expiry, and official sources.
- English and Arabic answers are available for summary, cards, experiences, limits, redemption, exclusions, terms, and complete-details requests.
- Bank and card aliases resolve naturally. Exact searches such as SIB, FAB, Citibank, Emirates NBD, and HSBC return the intended issuer only. Broad searches such as Visa Infinite and buy one get one free continue to return multiple relevant offers.
- The eligibility result has three truthful states: listed eligibility subject to checkout, known rule failure, or more information required.
- Missing showtime context no longer creates a false ineligible result. The widget asks the guest to select a showtime experience first.
- Card details are initially compact and can be expanded into cards, limits, experiences, redemption, full terms, and official links.
- Typed English and Arabic bank-offer questions work locally even if the ElevenLabs transport is unavailable. The same rich `show_offers` panel is used, so there is no duplicate offer interface.
- Cancellation, refund, seat selection, cinema selection, and checkout-resume intents retain priority over the local bank-offer fallback.
- Checkout remains resumable after opening or refining bank offers.
- The widget never requests card numbers, CVV, OTP, passwords, or payment credentials.
- Offer text states that guidance is not an applied discount and that final validation occurs at VOX checkout.

Official sources used: [VOX UAE bank deals](https://uae.voxcinemas.com/offers/bank-deals), [FAB offer details](https://uae.voxcinemas.com/offers/bank-deals/fab-buy-one-ticket-get-one-free), and [FAB terms](https://uae.voxcinemas.com/offers/bank-deals/fab-buy-one-ticket-get-one-free/terms-conditions).

## Partial official-source coverage

- The current Sharjah Islamic Bank listing advertises a 50 percent offer, but its linked official detail and terms pages do not publish eligible card names or conditions. The widget does not invent them and directs the guest to checkout verification.
- The standalone Citi BOGO listing has no published detailed terms. A separate Citi campaign publishes card-tier guidance for a 30 percent or BOGO benefit. The widget displays both campaigns and explicitly keeps their source boundaries separate.
- Bank-offer redemption is guidance only. The widget cannot apply or reserve an offer without the VOX checkout and payment-provider APIs.

## ElevenLabs live audit

The repository contract is version `2026-07-17.2` and targets `agent_0001kx3xc0b4f6s8dqy9qnejm4qr`.

The repository checks all of the following:

- Prompt source `VOXI_AGENT_PROMPT` with SHA-256 `cd7e157c550647ba23d87073e57800ac083acc04caa4a4bf8a5aa134d52351ac`.
- First message `{{voxi_session_opening}}`.
- English and Arabic only, with explicit language switching and automatic detection disabled.
- Thirteen required dynamic variables.
- Exact client tools: `show_movie_selection`, `show_showtimes`, `show_seat_map`, `select_seats`, `show_booking_summary`, `show_booking_for_cancellation`, `show_offers`, and `handover_to_agent`.
- WebRTC for voice, WebSocket text-only mode for typed chat, and `serverLocation: "eu-residency"`.

The exact target agent is now published and matches that contract:

- Agent ID: `agent_0001kx3xc0b4f6s8dqy9qnejm4qr`.
- Agent name: `VOXi - VOX Cinemas UAE`.
- The EU public token endpoint returns HTTP 200.
- The published prompt matches `VOXI_AGENT_PROMPT` after ignoring editor-only surrounding whitespace.
- The first message is exactly `{{voxi_session_opening}}`.
- The dashboard stores the `voxi_session_opening` default detected from that template. The widget supplies all 13 journey variables when it starts a session; the dashboard does not offer a manual placeholder control for variables that are not referenced directly in the prompt.
- English and Arabic are configured, and Detect language is off.
- All eight exact client-tool names and descriptions are present, with Wait for response on every tool.
- First-message override is off and text-only override is on.
- ElevenLabs forces Agent language override on and disables its toggle when Arabic is configured. The widget sends no language override, so the forced dashboard state remains compatible with the repository contract.

Local live text smoke reached status `Text chat` and returned: "I'm Voxi, the warm, confident bilingual AI assistant for VOX Cinemas UAE." A FAB follow-up returned: "The FAB offer is for 2D tickets only." The Cloudflare widget also reached text chat and returned grounded Voxi identity responses in English and Arabic.

Voice startup was exercised through its permission gate. The controlled in-app browser and Chrome test surface both reported the microphone permission API as unavailable, so no audio was captured and the bounded startup correctly returned to text chat. The required normal-browser verification procedure remains documented in [ELEVENLABS_AGENT_SETUP.md](./ELEVENLABS_AGENT_SETUP.md) and [config/elevenlabs-agent-contract.json](./config/elevenlabs-agent-contract.json).

## Current showtime data

- Official VOX UAE public-site snapshot version: `20260717-af365fd52ea48d1b`.
- 9,668 sessions, 37 films, 22 cinemas, and 20 programming dates.
- Coverage is 17 July through 5 August 2026.
- 1,451 sessions are present for 17 July and 1,442 for 18 July.
- Runtime loading uses 283 versioned cinema and date shards and does not place the full schedule in the initial JavaScript bundle.
- This remains a public-site snapshot fallback until the licensed live inventory API is enabled.

## Validation results

- `pnpm run validate`: PASS.
- `pnpm run build`: PASS.
- Initial JavaScript: 773,130 raw bytes, 218,599 gzip bytes, and 199,055 Brotli bytes.
- Cold-load budget: PASS with two initial requests.
- Offer validation: 21 promotions, 20 offer groups, 42 card profiles, and 882 bilingual topic answers.
- Punctuation validation: PASS across 398 repository text files, including customer-facing text and the ElevenLabs prompt.
- Mounted typed fallback: PASS for FAB in English, FAB in Arabic, and ENBD card-detail requests.
- Exact mounted bank searches: PASS for SIB, FAB, Citibank, Emirates NBD, HSBC, and ADCB.
- Broad mounted searches: PASS with eight Visa Infinite matches and fourteen buy one get one free matches.
- Mounted offer artwork: all 19 rendered official offer images loaded without failure.
- Mounted layout: 420 px widget, no widget-level horizontal overflow, English LTR and Arabic RTL.
- Published ElevenLabs live text smoke: PASS for Voxi identity and the FAB 2D-only follow-up.
- Mounted widget console: 0 errors and 0 warnings.

Evidence:

The retained screenshots were captured before the final subtitle terminology changed from issuers to offer groups. The layout and offer content are unchanged; the final production build contains the corrected label.

- [Detailed bank-offer and ElevenLabs validation log](./evidence/logs/bank-offers-elevenlabs-validation-2026-07-17.md)
- [FAB offer screenshot](./evidence/screenshots/local-bank-offers-fab-2026-07-17.png)
- [Arabic offer screenshot](./evidence/screenshots/local-bank-offers-arabic-2026-07-17.png)
- [Mounted browser result capture](./evidence/logs/bank-offers-mounted-browser-results-2026-07-17.json)
- [Complete end-to-end report](./docs/end-to-end-test-report.md)

## Final production-readiness status

No remaining reproducible repository-level bank-offer issue was found after automated and mounted browser testing. The exact ElevenLabs target is published, and local plus hosted English and Arabic text passed.

The complete leadership conversation still requires a live microphone and voice-audio exercise in a normal browser. Customer transactions require the licensed VOX provider APIs. Hosted compatibility with the published agent passed, while hosted review of the remaining local repository changes still requires an authorized push and Cloudflare deployment.
