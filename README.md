# VOXi: VOX Cinemas conversational booking experience

VOXi is a React and Vite conversational cinema experience for VOX Cinemas UAE. It combines text-first discovery, optional ElevenLabs voice, compact movie and offer media, seat-based checkout, bilingual English and Arabic interaction, device-local booking history, and truthful transaction boundaries.

Hosted app: <https://voxi-ai.pages.dev/>

StackBlitz: <https://stackblitz.com/github/Noorul-Ameen/vox-cinemas-agent>

## Current product coverage

- Official VOX UAE public-site schedule snapshot for 16 to 26 July 2026.
- 9,972 deduplicated sessions, 35 scheduled films, and 22 cinemas.
- 1,450 sessions on 16 July and 1,449 sessions on 17 July.
- Official movie posters, 14 experience-media records, and 21 current offer-media records with source provenance and explicit fallbacks.
- Progressive movie discovery using cinema, city, date, time, genre, language, experience, movie, and audience criteria already supplied by the guest.
- Exact-time and nearest-time showtime handling.
- Text, touch, and optional voice entry through one shared logical journey.
- English and Arabic UI, explicit language selection, RTL rendering, and LTR treatment for seats, times, references, and payment identifiers.
- A protected 420 px widget layout with a white and blue visual system.
- Seat-derived ticket count. One selected seat equals one ticket. There is no quantity step or quantity selector.
- Return from checkout to the seat map, seat replacement, recalculated totals, and stale-selection cleanup.
- Payment preview, device-local booking summary, reference QR, booking history, and device-only cancellation with clear disclosures.
- Inline FAQ answers that preserve the active booking panel. No separate FAQ guidance panel is rendered.
- Daily validated schedule refresh automation and a Thursday supplementary refresh.
- Customer-facing punctuation validation that rejects Unicode em dash and en dash characters.

## Run locally

```bash
npm install
npm run validate
npm run build
npm run dev
```

Open `http://localhost:5173`. Text chat starts without microphone access. The microphone is requested only when the guest selects voice.

An optional public client identifier can be supplied locally:

```dotenv
VITE_AGENT_ID=agent_your_public_agent_id
```

Never commit ElevenLabs API keys, signed conversation tokens, Vista credentials, card data, Cloudflare tokens, or other real secrets. A production Vista integration must use a server-side credential and token gateway.

## Cloudflare Pages

The current site uses Cloudflare Pages Git integration:

- Repository: `Noorul-Ameen/vox-cinemas-agent`
- Production branch: `main`
- Root directory: `/`
- Build command: `npm ci && npm run validate && npm run build`
- Output directory: `dist`

The final application commit tested on 16 July 2026 is `4ab7b23dc96ba461b8d1d411177892f36b4b66e6`.

The deployed bundle is `/assets/index-CSAd90cI.js`, 4,744,533 bytes, SHA-256 `E68AB19B95D15F205DB1F524AAF131331B352EF2D4055A3E28F2E382A1C4EF72`. The Cloudflare bytes match the local production build exactly. The root document is served with no-store behavior and the hashed bundle is immutable.

Snapshot mode requires no secret environment variables. `VITE_VISTA_BASE` is unset in the current deployment. If enabled later, it must point only to a public-safe server gateway. Every `VITE_*` value is embedded in the browser bundle.

## ElevenLabs integration

Protected connection behavior remains unchanged:

- WebRTC voice transport
- `serverLocation: "eu-residency"`
- Existing client-tool names
- `select_seats`
- Fuzzy movie and session resolvers

The original client tools remain:

- `show_movie_selection`
- `show_showtimes`
- `show_seat_map`
- `select_seats`
- `show_booking_summary`
- `show_booking_for_cancellation`

The product also supports:

- `show_offers`
- `handover_to_agent`

Text chat uses the SDK text-only WebSocket path. Voice uses protected WebRTC and self-hosted primary ElevenLabs AudioWorklets under `public/elevenlabs/`. The CSP permits the SDK-required secondary `blob:` worklet and continues to block `data:` scripts.

Repository tests validate transport contracts, startup timeouts, error classification, bilingual copy, state preservation, and protected configuration. The latest automated hosted voice attempt remained pending on Chrome microphone permission and ended in the bounded permission timeout. Actual spoken acceptance therefore remains blocked until the Chrome permission state and ElevenLabs session are verified manually. See [ELEVENLABS_AGENT_SETUP.md](./ELEVENLABS_AGENT_SETUP.md).

## Schedule data and refresh

The current extraction completed at `2026-07-15T22:38:00.344Z`, which is 16 July in the UAE. It uses official VOX UAE public-site routes under:

- `https://uae.voxcinemas.com`
- `https://uae-apife.voxcinemas.com`

The extractor starts on the current UAE date, discovers official advertised programming dates, stops when the official available days are exhausted, removes duplicate source sessions, and fails on authentication or incomplete schedule responses. A 31-day safety cap prevents an unbounded crawl.

Current crawl facts:

- 10,010 raw rows
- 9,972 unique sessions
- 38 duplicates removed
- 11 programming dates, from 16 to 26 July 2026
- 35 films and 22 cinemas
- One source-missing official poster, `HO00015542` for Jana Nayagan
- 1 fresh and 13 retained verified experience-media records because the current experience response was partial
- 21 fresh offer-media records and no retained offer records

The workflow `.github/workflows/refresh-vox-showtimes.yml` runs daily at 01:30 UTC, which is 05:30 UAE, and on Thursday at 06:30 UTC, which is 10:30 UAE. It supports manual dispatch. The transactional refresh validates freshness, coverage, completeness, source IDs, poster and media provenance, generated client imports, all repository validators, and the production build before promoting files.

```bash
npm run refresh:data
```

The hosted customer journey currently uses the validated bundled snapshot. It does not silently cycle to stale dates. When a requested date is not covered, the UI shows an honest unavailable state. Past showtimes are filtered with UAE time and a 06:00 programming-day cutoff.

Live sold-out status, seat inventory, holds, authoritative pricing, payment, official admission QR, refunds, and provider cancellation require a licensed server integration and are not represented as live in snapshot mode.

## Validation

`npm run validate` executes 26 validators covering:

- Extractor behavior, data counts, freshness, deduplication, media provenance, and official source IDs.
- Persistent discovery criteria, specific-movie filtering, genre, audience, language, experience, and nearest-time behavior.
- English and Arabic discovery, including the exact Arabic language, cinema, and date request regression.
- Booking storage, cancellation routing and safety, seat-derived ticket count, quote races, and stale-state invalidation.
- Offers, FAQ knowledge, handover redaction, text and voice journey state, language switching, transport recovery, and voice startup.
- Protected tool names, fuzzy resolvers, WebRTC, EU residency, error boundary, RTL seats, and 420 px layout.
- Static and runtime rejection of customer-facing Unicode em dash and en dash characters, including dynamic provider error fields.

`scripts/validate_converter.py` separately validates the current flat extraction and the legacy compact fixture.

Final validation results:

- `pnpm run validate`: PASS, all 26 validators.
- `pnpm run build`: PASS, Vite production build.
- `scripts/validate_converter.py`: PASS, 9,972 current sessions across 11 dates and 6,500 legacy fixture sessions.
- Cloudflare asset parity: PASS.
- Hosted text booking journey: PASS.
- Hosted 420 px English and Arabic visual inspection: PASS.
- Hosted actual spoken voice: BLOCKED by pending Chrome microphone permission in the automated browser session.
- Live customer transaction readiness: BLOCKED by external inventory, payment, ticket, cancellation, and refund APIs.

The complete evidence and readiness decision are in [docs/end-to-end-test-report.md](./docs/end-to-end-test-report.md).

## Main files

- `src/App.jsx`: journey orchestration, rendering, transport switching, client tools, booking, and cancellation.
- `src/vistaClient.js`: Vista-shaped read layer and snapshot capability boundaries.
- `src/mockVistaData.js`: generated current UAE schedule snapshot.
- `src/bookingStore.js`: versioned device-local booking persistence.
- `src/lib/discoveryPreferences.js`: persistent criteria parsing and filtering.
- `src/lib/customerFacingText.js`: customer-facing punctuation normalization.
- `src/lib/voiceStartup.js`: bounded voice startup and failure classification.
- `src/lib/voxiSession.js`: bilingual agent prompt and session guidance.
- `src/knowledge/`: sourced bilingual FAQ data and resolver.
- `src/offers/`: structured offer catalog and eligibility resolver.
- `scripts/refreshVoxData.mjs`: transactional refresh coordinator.
- `scripts/validateCustomerFacingPunctuation.mjs`: repository and runtime punctuation compliance.

## Production boundaries

- The current checkout is a payment preview. It never submits a charge or reserves a seat.
- The displayed QR contains only the local booking reference and is not an admission ticket.
- Cancellation updates the device-local record and does not contact VOX or issue a refund.
- Offers are display-only and cannot be redeemed.
- Handover creates a redacted payload but does not contact Genesys or OneView.
- Live customer sales remain blocked until approved provider gateways are implemented and validated.
