import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isDirectCinemaSelectionUtterance,
  isCinemaSelectionTurn,
  resolveCinemaCandidate,
} from "../src/lib/cinemaRouting.js";
import { normalizeElevenLabsMessageEvent } from "../src/lib/conversationMessage.js";
import * as vista from "../src/vistaClient.js";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const richMedia = fs.readFileSync(new URL("../src/components/RichMedia.jsx", import.meta.url), "utf8");
const cancellationSafety = fs.readFileSync(new URL("../src/lib/cancellationSafety.js", import.meta.url), "utf8");
const voiceCancellationDecision = fs.readFileSync(new URL("../src/lib/voiceCancellationDecision.js", import.meta.url), "utf8");
const vistaClient = fs.readFileSync(new URL("../src/vistaClient.js", import.meta.url), "utf8");
const cinemas = vista.getCinemas();

function sliceBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `${label} start marker must exist`);
  assert.notEqual(end, -1, `${label} end marker must exist`);
  assert.ok(end > start, `${label} markers must be ordered`);
  return source.slice(start, end);
}

const mallOfTheEmirates = cinemas.find((cinema) => cinema.id === "0002");
assert.ok(mallOfTheEmirates, "the Mall of the Emirates cinema fixture must exist");
const observedLiveVoiceEvent = {
  source: "user",
  message: "I want to choose Mall of the Emirates Cinema.",
};
assert.deepEqual(normalizeElevenLabsMessageEvent(observedLiveVoiceEvent), {
  role: "user",
  source: "user",
  text: observedLiveVoiceEvent.message,
}, "the public ElevenLabs v0.7 onMessage voice-transcript shape must normalize as a user turn");
assert.equal(
  isDirectCinemaSelectionUtterance({
    text: normalizeElevenLabsMessageEvent(observedLiveVoiceEvent).text,
    view: "cinemas",
    cinemaMatch: resolveCinemaCandidate(cinemas, observedLiveVoiceEvent.message),
  }),
  true,
  "the observed live voice transcript must override generic cinema FAQ tags and select the visible cinema",
);
assert.equal(normalizeElevenLabsMessageEvent({ source: "ai", message: "Selected." })?.role, "agent", "ElevenLabs ai replies must map to the agent transcript role");
for (const utterance of [
  "Mall of the Emirates",
  "Mall of Emirates",
  "MOE",
  "model Emirates",
  "I want to choose Mall of the Emirates Cinema.",
  "مول الإمارات",
  "show movies at mall emirates",
]) {
  assert.equal(
    resolveCinemaCandidate(cinemas, utterance)?.id,
    mallOfTheEmirates.id,
    `voice/text cinema resolver must recognize: ${utterance}`,
  );
}

for (const unrelatedEmiratesPhrase of ["Emirates NBD", "ENBD card", "Emirates NBD offer"]) {
  assert.equal(
    resolveCinemaCandidate(cinemas, unrelatedEmiratesPhrase),
    null,
    `bank/offer language must not be mistaken for Mall of the Emirates: ${unrelatedEmiratesPhrase}`,
  );
}

for (const broadCityRequest of [
  "I want to book in Abu Dhabi",
  "Show me movies in Dubai",
  "Book two tickets in Sharjah",
  "I want Ajman",
  "VOX Fujairah please",
  "أريد الحجز في أبوظبي",
  "أريد أفلام في دبي",
]) {
  assert.equal(
    resolveCinemaCandidate(cinemas, broadCityRequest),
    null,
    `a city-level request must ask for a venue instead of silently selecting a cinema: ${broadCityRequest}`,
  );
}

for (const [explicitVenue, expectedId] of [
  ["Abu Dhabi Mall", "0036"],
  ["I want to book at Abu Dhabi Mall", "0036"],
  ["City Centre Sharjah", "0035"],
  ["City Centre Ajman", "0004"],
  ["Citizen and Data", "0001"],
  ["City Centre Fujairah", "0006"],
  ["Dubai Festival City", "0105"],
  ["أبوظبي مول", "0036"],
  ["سيتي سنتر الشارقة", "0035"],
]) {
  assert.equal(
    resolveCinemaCandidate(cinemas, explicitVenue)?.id,
    expectedId,
    `an explicit cinema venue must continue to resolve: ${explicitVenue}`,
  );
}

for (const cinema of cinemas) {
  assert.equal(resolveCinemaCandidate(cinemas, cinema.id)?.id, cinema.id, `${cinema.id} must resolve by ID`);
  assert.equal(resolveCinemaCandidate(cinemas, cinema.name)?.id, cinema.id, `${cinema.name} must resolve by full picker label`);
}
assert.match(app, /\.replace\(\/\\bcitizen\\s\+\(\?:and\\s\+\)\?data\\b\/giu, cinema\.name\)/, "the known City Centre Deira speech-recognition alias must be normalized before a typed turn reaches the agent");
assert.match(app, /\.replace\(\/\\bdcc\\b\/giu, cinema\.name\)/, "the DCC speech-recognition alias must be normalized before a typed turn reaches the agent");
assert.match(app, /const agentFacingValue = normalizeCinemaAsrForAgent\(value, details\.cinema\)[\s\S]*queuePendingEcho\(agentFacingValue\)[\s\S]*conversation\.sendUserMessage\(agentFacingValue\)/, "typed cinema aliases must use the same normalized value for SDK echo suppression and agent input");
assert.match(app, /pendingTypedMessagesRef\.current\.filter\(\(item\) => item\.text !== agentFacingValue\)/, "a failed normalized text send must remove the matching pending SDK echo");

assert.equal(isCinemaSelectionTurn({
  view: "movies",
  intent: "booking",
  actionIntent: null,
  hasFaq: false,
  cinemaMatch: mallOfTheEmirates,
}), true, "a bare cinema reply must advance an active movie-selection journey");
assert.equal(isCinemaSelectionTurn({
  view: "cinemas",
  intent: null,
  actionIntent: null,
  hasFaq: false,
  cinemaMatch: mallOfTheEmirates,
}), true, "a bare cinema reply must advance the cinema picker");
assert.equal(isCinemaSelectionTurn({
  view: "cinemas",
  intent: null,
  actionIntent: null,
  hasFaq: true,
  cinemaMatch: mallOfTheEmirates,
}), true, "an explicit cinema-picker reply must advance even when broad FAQ keywords also match");
assert.equal(isCinemaSelectionTurn({
  view: "empty",
  intent: null,
  actionIntent: null,
  hasFaq: false,
  cinemaMatch: mallOfTheEmirates,
}), true, "an unambiguous bare cinema reply must start the journey from the home state");
assert.equal(isCinemaSelectionTurn({
  view: "empty",
  intent: null,
  actionIntent: "booking",
  hasFaq: false,
  cinemaMatch: mallOfTheEmirates,
}), true, "an explicit first-turn booking request may select its named cinema");
assert.equal(isCinemaSelectionTurn({
  view: "movies",
  intent: "booking",
  actionIntent: null,
  hasFaq: true,
  cinemaMatch: mallOfTheEmirates,
}), false, "an FAQ answer must not silently reroute the active cinema");
assert.equal(isCinemaSelectionTurn({
  view: "movies",
  intent: "booking",
  actionIntent: null,
  hasFaq: false,
  cinemaMatch: null,
}), false, "a journey must not advance without an unambiguous cinema match");

for (const informationQuestion of [
  "What time does Mall of the Emirates cinema open?",
  "Does Mall of the Emirates cinema have parking?",
  "Tell me about Mall of the Emirates cinema",
]) {
  assert.equal(isDirectCinemaSelectionUtterance({
    text: informationQuestion,
    view: "cinemas",
    cinemaMatch: resolveCinemaCandidate(cinemas, informationQuestion),
  }), false, `cinema information must remain on the FAQ path: ${informationQuestion}`);
}

assert.doesNotMatch(app, /const routeRecognizedCinema/, "the obsolete direct-cinema router must not bypass the shared retained-criteria filter path");
const discoveryRouter = sliceBetween(app, "const routeDiscoveryTurn", "const clearConversationState", "shared discovery router");
const discoveryLoader = sliceBetween(app, "const loadDiscoveryForCinema", "const findAvailableCinemasForMovie", "filtered discovery loader");
assert.match(discoveryRouter, /discoveryMissingCriteria\(/, "the shared discovery router must ask only for missing requirements");
assert.match(discoveryRouter, /loadDiscoveryForCinema\(target,\s*preferences\.date,\s*preferences,\s*combinedRawTurn\)/, "the shared discovery router must apply retained cinema, date, and narrowing criteria together");
assert.match(discoveryRouter, /requestEpochRef\.current\s*!==\s*scanEpoch/, "cross-cinema discovery must suppress obsolete async results");
assert.match(discoveryLoader, /const unresolvedSignal = extractDiscoveryPreferencePatch\(unresolvedTitleTurn,[\s\S]*cinemas:\s*CINEMAS,[\s\S]*movies,[\s\S]*unresolvedMovieTitleCandidate\(unresolvedTitleTurn,\s*unresolvedSignal\)/, "deferred fuzzy-title resolution must subtract the retained cinema, date, time, and experience before matching the loaded catalog");

const voiceMessageFlow = sliceBetween(app, "onMessage: async (message) =>", "onError:", "SDK voice message flow");
const typedMessageFlow = sliceBetween(app, "const sendText", "const sendUiTurn", "typed message flow");
const typedCancellationDecisionStart = typedMessageFlow.indexOf("const decision =");
const typedCancellationDecisionEnd = typedMessageFlow.indexOf("const historyRequest", typedCancellationDecisionStart);
assert.ok(typedCancellationDecisionStart >= 0 && typedCancellationDecisionEnd > typedCancellationDecisionStart, "typed cancellation decision branch must precede general typed routing");
const typedCancellationDecisionFlow = typedMessageFlow.slice(typedCancellationDecisionStart, typedCancellationDecisionEnd);
assert.match(typedCancellationDecisionFlow, /const cancellationOutcome = publishCancellationDecision\([\s\S]*handleCancellationDecision\(decision,\s*\{\s*source:\s*["']conversation["']\s*\}\)[\s\S]*if \(cancellationOutcome\?\.handled\) \{[\s\S]*setInput\(["']["']\);[\s\S]*return;/, "a locally handled typed yes/no cancellation decision must stop before general routing");
assert.doesNotMatch(typedCancellationDecisionFlow, /sendUserMessage|queuePendingEcho|startTextSession/, "a locally handled typed cancellation decision must not be forwarded to ElevenLabs");
assert.match(voiceMessageFlow, /normalizeElevenLabsMessageEvent\(message\)/, "SDK events must be normalized from the documented ElevenLabs onMessage contract");
for (const [label, flow] of [["SDK voice", voiceMessageFlow], ["typed", typedMessageFlow]]) {
  assert.match(flow, /isDirectCinemaSelectionUtterance\(/, `${label} must identify a direct cinema reply before FAQ rendering`);
  assert.match(flow, /directCinemaSelection\s*\|\|\s*directCancellation\s*\|\|\s*directSeatSelection\s*\|\|\s*discoveryFilterTurn\s*\?\s*\{\s*matches:\s*\[\],\s*context:\s*""\s*\}\s*:\s*prepareFaqContext/, `${label} must not let generic FAQ tags swallow direct cinema, seat, cancellation, or filter actions`);
  assert.match(flow, /dismissStaleTransactionalView\(/, `${label} turns must dismiss a stale booking/history panel when the turn is unrelated`);
  assert.ok(flow.indexOf("dismissStaleTransactionalView(") < flow.indexOf("prepareFaqContext("), `${label} turns must clear hidden transactional context before an FAQ panel replaces it`);
  assert.match(flow, /classifyBookingHistoryRequest\(/, `${label} must use the shared bilingual current/history classifier`);
  assert.match(flow, /openHistory\(\{\s*notifyAgent:\s*false,\s*forceOpen:\s*true,\s*activeOnly:\s*historyRequest\.activeOnly,\s*preserveReturn:\s*bookingOpenedFromHistoryRef\.current\s*\}\)/, `${label} must apply active-only scope while preserving the original parent of a history-selected booking`);
  assert.match(flow, /cancellationReply:\s*decision\s*!==\s*null/, `${label} cancellation confirmations must keep the active booking panel`);
  assert.match(flow, /const bookingContext = decision === null && !directCancellation && !faq\.matches\.length/, `${label} cancellation replies and target selections must not fall through into retained movie discovery`);
  assert.match(flow, /isDirectCancellationRequest\(/, `${label} must classify contextual cancellation before stale-view cleanup`);
  assert.match(flow, /resolveCancellationContinuation\(\{\s*text:\s*(?:safeMessage|value),\s*stage:\s*stageRef\.current,\s*storedBookings:\s*readBookings\(\)\s*\}\)/, `${label} must resolve a title or reference only against the displayed cancellation candidates`);
  assert.match(flow, /cancellationContinuation\.handled\s*\|\|\s*isDirectCancellationRequest/, `${label} must keep a displayed target selection in cancellation routing without requiring the cancellation keyword again`);
  assert.ok(flow.indexOf("isDirectCancellationRequest(") < flow.indexOf("dismissStaleTransactionalView("), `${label} must recognize contextual cancellation before stale booking context can be dismissed`);
  assert.ok(flow.indexOf("resolveCancellationContinuation(") < flow.indexOf("dismissStaleTransactionalView("), `${label} must resolve cancellation continuation before transactional or discovery cleanup`);
  assert.match(flow, /actionIntent:\s*directCancellation\s*\?\s*["']cancellation["']\s*:\s*actionIntent/, `${label} must preserve the visible booking while shared cancellation routing begins`);
  assert.match(flow, /routeCancellationTurn\((?:safeMessage|value),\s*\{\s*continuation:\s*cancellationContinuation\s*\}\)/, `${label} must route displayed cancellation context through the shared conversational resolver`);
  if (label === "typed") {
    assert.match(flow, /handleCancellationDecision\(decision,\s*\{\s*source:\s*["']conversation["']\s*\}\)/, "typed cancellation decisions must continue through the shared local decision handler");
  } else {
    assert.match(flow, /capturePendingVoiceCancellationDecision\(decision\)[\s\S]*show_booking_for_cancellation exactly once[\s\S]*return;/, "microphone cancellation decisions must pause local mutation and direct the agent to the existing cancellation tool");
    assert.doesNotMatch(flow, /publishCancellationDecision\(handleCancellationDecision\(decision/, "microphone cancellation decisions must not mutate locally before the agent tool call");
    assert.doesNotMatch(flow, /source:\s*["']voice_local["']/, "microphone cancellation decisions must never create a competing local transcript response");
  }
  assert.match(flow, /applyDiscoveryPreferencesFromText\([^,]+,\s*details\.cinema\s*\?\s*\{\s*cinemaId:\s*details\.cinema\.id,\s*cinemaName:\s*details\.cinema\.name\s*\}\s*:\s*\{\}\)/, `${label} must retain a cinema already recognized in the guest's turn`);
  assert.match(flow, /routeDiscoveryTurn\((?:safeMessage|value),\s*\{\s*cinemaOverride:\s*details\.cinema,\s*dateOverride:\s*requestedDate,\s*preferencesAlreadyApplied:\s*true/, `${label} must use the same all-criteria discovery router for text and speech transcripts`);
  assert.match(flow, /isDiscoveryRequest\((?:safeMessage|value)\)/, `${label} must recognize progressive discovery replies without requiring an agent tool round-trip`);
  assert.match(flow, /Ask only the first missing item and do not list unfiltered movies/, `${label} must constrain the agent response to the widget's filtered result`);
  assert.match(flow, /buildMovieSelectionGroundingContext\(/, `${label} must ground ambiguous movie references in the visible selection state`);
  const groundingIndex = flow.indexOf("buildMovieSelectionGroundingContext(");
  const groundingUpdateIndex = flow.indexOf("conversation.sendContextualUpdate?.(movieSelectionGrounding)", groundingIndex);
  const discoveryRouteIndex = flow.indexOf("routeDiscoveryTurn(");
  const userDeliveryIndex = label === "typed" ? flow.indexOf("conversation.sendUserMessage(") : Number.POSITIVE_INFINITY;
  assert.ok(groundingUpdateIndex > groundingIndex, `${label} must publish the visible movie-selection state immediately after classification`);
  assert.ok(discoveryRouteIndex === -1 || groundingUpdateIndex < discoveryRouteIndex, `${label} grounding must precede asynchronous discovery routing`);
  assert.ok(userDeliveryIndex === -1 || groundingUpdateIndex < userDeliveryIndex, `${label} grounding must precede typed user-message delivery`);
}

const showShowtimesTool = sliceBetween(app, "show_showtimes: async", "show_seat_map: async", "showtimes tool");
assert.doesNotMatch(showShowtimesTool, /filmsRef\.current\[0\]/, "show_showtimes must never silently select the first cached film");
assert.match(showShowtimesTool, /No movie has been selected[\s\S]*generic reference does not identify a title/, "show_showtimes must reject a title-free ambiguous selection");
assert.match(showShowtimesTool, /VOXi showtime request failed[\s\S]*operation:\s*"getSessions"[\s\S]*programmingDate:\s*requestedDate/, "showtime failures must log structured, non-secret request context");
assert.match(showShowtimesTool, /showStage\(\{\s*view:\s*"showtimes"[\s\S]*error:\s*loadingErrorMessage\("showtimes"\)[\s\S]*retryAvailable:\s*true/, "showtime failures must preserve the selected movie in a retryable showtime panel");
const showSeatMapTool = sliceBetween(app, "show_seat_map: async", "select_seats: async", "seat-map tool");
assert.doesNotMatch(showSeatMapTool, /filmsRef\.current\[0\]/, "show_seat_map must never silently select the first cached film");

const staleViewHandler = sliceBetween(app, "const dismissStaleTransactionalView", "const prepareFaqContext", "stale transactional-view handler");
assert.match(staleViewHandler, /\["booking",\s*"history"\]\.includes\(current\.view\)/, "only completed booking/history views should be automatically dismissed");
assert.match(staleViewHandler, /historyRequested[\s\S]*actionIntent === "booking_history"[\s\S]*actionIntent === "cancellation"/, "booking-history and cancellation turns must preserve their active panel");
assert.match(staleViewHandler, /cancellationReply[\s\S]*Boolean\(cancellationFlowRef\.current\)/, "pending yes/no cancellation turns must preserve the active booking panel");
assert.match(staleViewHandler, /startsNewBooking[\s\S]*return false[\s\S]*pauseRichRenderingForTopicChange/, "an unrelated booking/history turn must hide the panel without clearing its resumable state");
assert.doesNotMatch(staleViewHandler, /clearSeatSelection|clearPendingOrder|bookingRef\.current\s*=\s*null/, "topic-only cleanup must not discard valid booking context");
assert.match(app, /import \{ isResumeCheckoutTurn, isResumeOnlyTurn, pausedResumeTarget \} from "\.\/lib\/pausedJourneyRouting\.js"/, "App must use the executable paused-stage continuation router");
assert.match(app, /bookingContext && !resumeOnlyTurn[\s\S]*routeDiscoveryTurn/, "a continuation turn must not restart movie discovery");
assert.match(app, /const restorePausedJourney[\s\S]*selectRestorableRichStage[\s\S]*restorePausedRichStage/, "text and voice continuation turns must restore the correct saved rich step");

const offersTool = sliceBetween(app, "show_offers: async", "handover_to_agent:", "offers tool");
assert.match(offersTool, /const origin = current\.view === "offers" \? offersReturnRef\.current[\s\S]*: current/, "offer refinements must retain one explicit return-view origin");
assert.match(offersTool, /const activeBooking = origin\.view === "booking" \? bookingRef\.current : null/, "offers must use booking context only when the visible origin is a booking");
assert.match(offersTool, /const order = origin\.view === "checkout" \? preservedCheckout\?\.order \|\| pendingOrderRef\.current : null/, "offers must use the exact suspended order when checkout is the origin");
assert.match(offersTool, /buildOfferEvaluationContext\(\{[\s\S]*checkout: order[\s\S]*booking: activeBooking/, "offers must build one canonical, non-mixed evaluation context");
assert.match(offersTool, /current\.view !== "offers"[\s\S]*offersReturnRef\.current = current[\s\S]*pauseRichRenderingForTopicChange/, "repeated offer queries must preserve one paused return target");
const activeCancellationToolGuard = sliceBetween(app, "const preserveActiveCancellationForTool", "const commitDiscoveryPreferences", "active cancellation tool guard");
assert.match(activeCancellationToolGuard, /\["checking", "route_confirmation", "final_confirmation", "processing"\]/, "every active cancellation phase must block unrelated display tools");
assert.doesNotMatch(activeCancellationToolGuard, /showStage|clearSeatSelection|clearPendingOrder/, "the cancellation tool guard must preserve the current panel and booking state");
assert.equal((app.match(/const cancellationGuard = preserveActiveCancellationForTool\(/g) || []).length, 5, "all booking discovery, seat, and summary tools must respect an active cancellation while offers may replace rendering without clearing it");

const mainRender = sliceBetween(app, "<main ref={scrollRef}", "</main>", "inline stage render");
const guardedPanels = [
  ["CinemaPicker", "cinemas"],
  ["MovieGrid", "movies"],
  ["Showtimes", "showtimes"],
  ["SeatMap", "seatmap"],
  ["Checkout", "checkout"],
  ["BookingCard", "booking"],
  ["BookingHistory", "history"],
  ["OffersPanel", "offers"],
  ["HandoverPanel", "handover"],
];
for (const [component, view] of guardedPanels) {
  assert.equal((mainRender.match(new RegExp(`<${component}\\b`, "g")) || []).length, 1, `${component} must have one render site`);
  assert.match(mainRender, new RegExp(`visibleStageView === ["']${view}["'][\\s\\S]{0,2400}<${component}\\b`), `${component} must be guarded by its exclusive visible stage`);
}
assert.doesNotMatch(app, /function FaqPanel|stage\.view === ["']faq["']/, "FAQ answers must stay in chat and must not append a stale panel");
const faqPreparation = sliceBetween(app, "const prepareFaqContext", "useEffect(() =>", "FAQ context preparation");
assert.doesNotMatch(faqPreparation, /showStage\(/, "FAQ context preparation must preserve logical rich-panel state");
assert.match(faqPreparation, /preserveBookingIntent[\s\S]*\["movies", "showtimes", "seatmap", "checkout", "booking", "history"\]/, "FAQ interruptions must preserve the active booking intent");
assert.match(mainRender, /visibleStageView === "booking" && displayedBooking && <BookingCard\b/, "a stored booking must not render unless booking is the visible active view");
assert.match(mainRender, /visibleStageView === "history" && <BookingHistory\b/, "booking history must not render unless history is the visible active view");
assert.match(mainRender, /<BookingCard\b[\s\S]{0,1200}cancellation=\{displayedCancellationState\}/, "BookingCard must render the synchronized booking-scoped cancellation state used by text, voice, and touch");
assert.match(mainRender, /<BookingCard\b[\s\S]{0,1200}onRequestCancel=\{/, "BookingCard must initiate cancellation through its parent-owned router");
assert.match(mainRender, /<BookingCard\b[\s\S]{0,1200}onConfirm=\{/, "BookingCard confirmation must use the shared cancellation decision handler");

assert.match(app, /const routeCancellationTurn\s*=\s*/, "App must define one shared local cancellation initiation router");
assert.ok((app.match(/routeCancellationTurn\(/g) || []).length >= 2, "the shared cancellation router must be used by both SDK voice and typed turns");
assert.match(app, /const IDLE_CANCELLATION_STATE\s*=\s*Object\.freeze\(\{\s*phase:\s*["']idle["']/, "cancellation rendering must begin from an explicit idle phase");
const cancellationTool = sliceBetween(app, "show_booking_for_cancellation:", "show_offers:", "cancellation tool");
assert.match(voiceCancellationDecision, /VOICE_CANCELLATION_DECISION_TTL_MS = 90_000/, "voice cancellation decisions must remain available for the full confirmation timeout");
assert.match(voiceCancellationDecision, /userTurn:[\s\S]*confirmationNonce:[\s\S]*decisionNonce:[\s\S]*expiresAt:/, "a captured decision must bind to monotonic turn, confirmation, decision, and expiry state");
assert.match(voiceCancellationDecision, /phase === "error" && decision !== false[\s\S]*destructive_error_decision_rejected/, "the voice decision state must reject destructive yes decisions during an error");
assert.match(voiceCancellationDecision, /error:retryable[\s\S]*decision,[\s\S]*confirmationKey: contextKey[\s\S]*userTurn:[\s\S]*confirmationNonce:/, "an eligible retryable error decline must bind the exact flow, turn, and confirmation nonce");
assert.match(voiceCancellationDecision, /if \(paused\)[\s\S]*cancellation_paused/, "a paused cancellation must fail closed before consumption");
assert.match(voiceCancellationDecision, /if \(!bookingKey\(requestedRef\)\)[\s\S]*booking_ref_required[\s\S]*booking_ref_mismatch[\s\S]*pending: null[\s\S]*status: "consumed"/, "only a non-empty exact booking reference may consume once");
assert.match(app, /pendingVoiceCancellationDecisionRef = useRef\(createVoiceCancellationDecisionState\(\)\)/, "App must keep the executable voice-decision state in one synchronous ref");
assert.match(app, /syncVoiceCancellationConfirmation\(currentDecisionState, customerSafe \|\| \{\}\)/, "booking and phase changes must advance the confirmation nonce and invalidate stale decisions");
assert.match(app, /const beginMeaningfulCancellationUserTurn = \(\) => \{[\s\S]*advanceVoiceCancellationUserTurn/, "meaningful turns must advance the monotonic cancellation turn");
assert.equal((app.match(/beginMeaningfulCancellationUserTurn\(\);/g) || []).length, 2, "both microphone and typed meaningful turns must invalidate an older voice decision");
assert.match(app, /pendingVoiceCancellationDecisionRef\.current\.pending\?\.decisionNonce === pending\.decisionNonce/, "timer expiry must be nonce-safe against a newer captured decision");
assert.match(cancellationTool, /consumePendingVoiceCancellationDecision\(\{ requestedRef, flow: existingFlow \}\)[\s\S]*handleCancellationDecision\(pendingVoiceDecision\.decision, \{ source: "voice_tool" \}\)[\s\S]*outcome\?\.completion \? await outcome\.completion[\s\S]*voiceDecisionHandled: true[\s\S]*message/, "the next idempotent cancellation tool call must consume the matching voice decision, await completion, and return one authoritative message");
assert.match(cancellationTool, /voiceDecisionConsumption\.reason !== "no_pending_decision"[\s\S]*No change was confirmed[\s\S]*do not retry the decision without a new guest answer/, "missing, wrong, expired, paused, or stale voice decisions must fail closed instead of replaying a prior confirmation");
assert.ok(
  cancellationTool.indexOf('if (voiceDecisionConsumption.reason !== "no_pending_decision")')
    < cancellationTool.indexOf("const idempotentActiveFlow"),
  "paused or stale voice decisions must be rejected before any idempotent confirmation replay",
);
assert.match(cancellationTool, /let message = authoritativeResult\?\.message \|\| outcome\?\.message[\s\S]*message,/, "the voice cancellation tool must return the executor's authoritative message unchanged when supplied");
assert.match(cancellationTool, /requestedRef[\s\S]*pendingVoiceDecision\.bookingRef/, "the cancellation tool must bind a captured voice decision to the same active booking reference");
assert.match(cancellationTool, /Speak the returned message exactly once[\s\S]*Do not repeat an earlier confirmation/, "the voice tool result must prohibit stale confirmation replay");
assert.match(cancellationTool, /setHistoryFilter\(["']active["']\)/, "zero or multiple cancellation targets must render the active-bookings list with matching current-booking copy");
assert.match(cancellationTool, /cancellationIntentAuthorizationRef\.current[\s\S]*cancellationIntentAuthorizationRef\.current\s*=\s*null/, "the private cancellation authorization must be consumed synchronously and cleared");
assert.match(cancellationTool, /reason:\s*["']cancellation_intent_required["']/, "an unapproved agent tool call must be rejected without opening cancellation");
const cancellationAuthorizationRejection = cancellationTool.indexOf("cancellation_intent_required");
for (const marker of ["readBookings(", "resolveCancellationTarget(", "showStage(", "setCancellationFlow(", "vista.searchBooking("]) {
  assert.ok(cancellationAuthorizationRejection >= 0 && cancellationAuthorizationRejection < cancellationTool.indexOf(marker), `cancellation intent authorization must precede ${marker}`);
}
const authorizedCancellationWrapper = sliceBetween(app, "const showBookingForAuthorizedCancellation", "const resolveVisibleSeatTurn", "authorized cancellation wrapper");
assert.match(authorizedCancellationWrapper, /cancellationIntentAuthorizationRef\.current\s*=\s*\{ source \}[\s\S]*clientTools\.show_booking_for_cancellation\(args\)[\s\S]*finally[\s\S]*cancellationIntentAuthorizationRef\.current\s*=\s*null/, "only the local wrapper may grant one-shot cancellation authorization");
assert.equal((app.match(/clientTools\.show_booking_for_cancellation\(/g) || []).length, 1, "only the trusted local wrapper may invoke the cancellation client tool directly");
const unresolvedCancellationTarget = sliceBetween(cancellationTool, "if (!target.bookingRef)", "if ([\"already_cancelled\", \"not_current_booking\"]", "unresolved cancellation target");
assert.match(unresolvedCancellationTarget, /dismissPendingCancellation\(["']target_selection_required["']\)/, "zero or multiple targets must clear pending cancellation state before showing history");
assert.doesNotMatch(unresolvedCancellationTarget, /setCancellationFlow\(/, "a target-selection outcome must not create a hidden confirmation or error flow");
assert.match(unresolvedCancellationTarget, /purpose:\s*CANCELLATION_TARGET_SELECTION_PURPOSE[\s\S]*candidateRefs/, "multiple targets must mark the history stage with an explicit cancellation purpose and displayed candidate references");
assert.match(unresolvedCancellationTarget, /phase:\s*multiple\s*\?\s*["']target_selection["']\s*:\s*["']idle["']/, "multiple targets must return an explicit target-selection phase");
const cancellationRouter = sliceBetween(app, "const routeCancellationTurn", "const cancellationResultContext", "shared cancellation continuation router");
assert.match(cancellationRouter, /resolveConversationalCancellation\(\{[\s\S]*displayedBookingRefs[\s\S]*conversationContext/, "cancellation must resolve natural selectors against displayed history and conversation context");
assert.match(cancellationRouter, /resolution\.status === "ambiguous"[\s\S]*focusedCancellationChoice[\s\S]*phase:\s*"target_selection"/, "ambiguous matches must retain a focused target-selection list");
assert.match(cancellationRouter, /resolution\.bookingRef[\s\S]*showBookingForAuthorizedCancellation/, "a unique conversational match must route using its exact booking reference");
assert.match(cancellationRouter, /showBookingForAuthorizedCancellation\([\s\S]*["']direct_user_turn["']/, "typed and voice cancellation turns must grant explicit direct-user authorization");
const inactiveCancellationTarget = sliceBetween(cancellationTool, "if ([\"already_cancelled\", \"not_current_booking\"]", "if (existingFlow?.bookingRef", "inactive cancellation target");
assert.match(inactiveCancellationTarget, /dismissPendingCancellation\(target\.reason\)/, "known cancelled or past bookings must end the shared flow without confirmation");
assert.match(inactiveCancellationTarget, /eligible:\s*false[\s\S]{0,180}confirmationRequired:\s*false/, "known past bookings must be returned as ineligible without confirmation");
assert.ok(cancellationTool.indexOf("if (!isCurrentBooking(displayed))") < cancellationTool.indexOf("if (demoOnly)"), "a provider or fixture result must be rejected as past before any local cancellation confirmation is offered");
assert.match(cancellationTool, /cancellationRequestIsStale = \(\) => cancellationOperationRef\.current !== cancellationRequestId/, "only an invalidated cancellation operation may obsolete an in-flight lookup");
assert.match(cancellationTool, /keepCancellationHidden[\s\S]*capturePausedRichStage[\s\S]*cancellation_continued_while_hidden/, "a lookup completing after a topic change must stay hidden and resumable");
assert.doesNotMatch(cancellationTool, /clearPendingOrder\(\)/, "cancellation lookup and review must preserve a resumable checkout instead of leaving a blank stage");
assert.match(app, /const bookingHistoryTurnContext[\s\S]{0,900}no active bookings saved on this device[\s\S]{0,300}Do not ask them to select a booking/, "an empty current-booking result must not ask the guest to select a missing booking");
assert.match(app, /The guest selected on-device booking summary[\s\S]{0,900}movie \$\{localBooking\.movie[\s\S]{0,900}seats \$\{\(localBooking\.seats \|\| \[\]\)\.join[\s\S]{0,900}Never invent or substitute a time, seat, screen, or amount/, "history selection context must give the agent exact booking fields instead of allowing stale-detail invention");
assert.match(app, /cancellationFlowRef\.current[\s\S]{0,120}scroller\.scrollTop\s*=\s*scroller\.scrollHeight/, "new conversation messages must keep an active cancellation confirmation in view");
assert.match(app, /\["empty", "booking"\]\.includes\(stageRef\.current\.view\)[\s\S]{0,120}scroller\.scrollTop\s*=\s*scroller\.scrollHeight/, "booking completion and follow-up copy must keep the QR/footer in view");
const cancellationDismissHandler = sliceBetween(app, "const dismissPendingCancellation", "const clearPendingOrder", "cancellation dismissal handler");
assert.match(cancellationDismissHandler, /providerMutationActive[\s\S]*!force[\s\S]*return false/, "ordinary navigation must not unlock or invalidate an active provider cancellation mutation");
assert.match(cancellationSafety, /CANCELLATION_JOURNAL_TTL_MS[\s\S]*state === "reconciliation_required"[\s\S]*now - normalized\.startedAt >= CANCELLATION_JOURNAL_TTL_MS/, "an unresolved provider cancellation must age or transition into reconciliation-required state rather than silently unlock");
assert.match(app, /CANCELLATION_JOURNAL_KEY[\s\S]*normalizeCancellationJournal\(stored\)[\s\S]*stored\?\.bookingRef[\s\S]*privacySanitizationFailed[\s\S]*writeCancellationJournal[\s\S]*markCancellationJournalForReconciliation[\s\S]*clearCancellationJournal/, "persisted cancellation safety must sanitize legacy references and retain explicit pending/reconciliation lifecycle operations");
assert.match(app, /CANCELLATION_JOURNAL_EVENT[\s\S]*notifyCancellationJournalChanged[\s\S]*clearCancellationJournal[\s\S]*finally \{[\s\S]{0,120}notifyCancellationJournalChanged\("cleared"\)/, "same-document journal completion must notify a replacement widget instance immediately");
assert.match(app, /addEventListener\(CANCELLATION_JOURNAL_EVENT, onLocalCancellationJournalChange\)[\s\S]{0,300}removeEventListener\(CANCELLATION_JOURNAL_EVENT, onLocalCancellationJournalChange\)/, "a mounted replacement widget must subscribe to and clean up same-document journal notifications");
assert.match(app, /onLocalCancellationJournalChange[\s\S]{0,180}syncCancellationJournalUi\(\)[\s\S]{0,120}refreshBookingStateFromStorage\(\)/, "same-document journal completion must refresh both cancellation UI and durable booking state");
assert.match(app, /mountedRef\.current = false[\s\S]{0,300}if \(!readCancellationJournal\(\) && !cancellationLockPendingRef\.current\) dismissPendingCancellation\("widget_unmounted"/, "widget unmount must not invalidate a journalled or lock-pending provider mutation");
const activeCancellationMutation = sliceBetween(app, "const activeCancellationMutation", "const beginAsyncRequest", "active cancellation mutation guard");
assert.match(activeCancellationMutation, /readCancellationJournal\(\)[\s\S]*pendingJournal[\s\S]*cancellationInFlightRef\.current[\s\S]*phase !== "processing"[\s\S]*!pendingJournal[\s\S]*phase: "processing"/, "all cancellation targets and remounted widgets must share one global provider-mutation guard");
assert.match(activeCancellationMutation, /bookingRef: flow\?\.bookingRef \|\| null/, "a remounted mutation lock must not expose a prior guest's booking reference");
assert.match(activeCancellationMutation, /cancellationReconciliationRequired[\s\S]*journal\?\.orphaned[\s\S]*provider_reconciliation_required[\s\S]*no new request was sent/i, "an orphaned mutation journal must require official provider reconciliation instead of allowing a retry");
assert.match(activeCancellationMutation, /const cancellationReconciliationRequired = \(\) => \{[\s\S]*if \(!journal\?\.orphaned\) return null;[\s\S]*All new cancellation requests on this device are paused/, "an orphaned journal must pause every cancellation target, not only the booking recorded in the journal");
assert.doesNotMatch(activeCancellationMutation, /journal\.bookingRef/, "reconciliation copy must not reveal a prior guest's booking reference");
const conversationResetHandler = sliceBetween(app, "const clearConversationState", "REAL ELEVENLABS CONNECTION", "conversation reset handler");
assert.match(conversationResetHandler, /activeCancellationMutation\(\)[\s\S]*return false[\s\S]*sessionEpochRef\.current \+= 1/, "conversation reset must remain blocked until an active provider cancellation settles");
const restartHandler = sliceBetween(app, "const restartConversation", "useEffect(() =>", "manual restart handler");
assert.match(restartHandler, /activeCancellationMutation\(\)[\s\S]*Wait for it to finish before starting a new conversation[\s\S]*return false/, "new conversation must not end the transport or unlock an active cancellation");
assert.match(app, /const onLogout = async \(\) => \{[\s\S]{0,500}activeCancellationMutation\(\)[\s\S]{0,500}Wait for it to finish before logging out[\s\S]{0,200}return;/, "logout must not clear booking data while a provider cancellation is unresolved");
assert.match(app, /const onLogout = async \(\) => \{[\s\S]{0,1300}readCancellationJournal\(\)\?\.privacySanitizationFailed[\s\S]{0,500}logout was stopped/, "logout must fail closed if a legacy plaintext journal cannot be sanitized");
assert.doesNotMatch(app, /const onLogout = async \(\) => \{[\s\S]{0,1800}clearCancellationJournal\(/, "logout must preserve an orphaned provider journal until trusted reconciliation is possible");
assert.match(app, /Date\.now\(\) - lastActivityRef\.current < CONVERSATION_IDLE_MS[\s\S]{0,300}activeCancellationMutation\(\)[\s\S]{0,160}lastActivityRef\.current = Date\.now\(\)[\s\S]{0,80}return;/, "idle timeout must defer reset until an active provider cancellation settles");
const cancellationDecisionHandler = sliceBetween(app, "const handleCancellationDecision", "const publishCancellationDecision", "cancellation decision handler");
assert.match(cancellationDecisionHandler, /flow\.phase === ["']error["'][\s\S]{0,450}dismissPendingCancellation\(["']error_dismissed["']\)/, "the error-panel keep action must dismiss the failed flow while leaving the booking unchanged");
const cancellationContext = sliceBetween(app, "const cancellationResultContext", "const bookingHistoryTurnContext", "cancellation result context");
assert.match(cancellationContext, /result\.reason === ["']no_active_booking["'][\s\S]{0,360}Do not ask for a booking reference/, "an empty current-booking cancellation must not ask for a missing reference");
assert.match(cancellationContext, /result\.reason === ["']not_current_booking["'][\s\S]{0,360}Do not ask for confirmation/, "a past booking must be explained without reopening confirmation");
const historyCancelHandler = sliceBetween(app, "const cancelHistoryBooking", "const toggleSeat", "history cancellation handler");
assert.ok(historyCancelHandler.indexOf("activeCancellationMutation()") < historyCancelHandler.indexOf("selectHistoryBooking(selected)"), "a different history booking must not replace an active provider cancellation mutation");
assert.ok(historyCancelHandler.indexOf("existingFlow") < historyCancelHandler.indexOf("selectHistoryBooking(selected)"), "a repeated history cancel click must be ignored before it can invalidate the active lookup");
assert.match(historyCancelHandler, /\["checking", "route_confirmation", "final_confirmation", "processing"\]\.includes\(existingFlow\.phase\)/, "history cancellation must guard every active phase against repeated clicks");
assert.match(historyCancelHandler, /showBookingForAuthorizedCancellation\([^\n]*["']ui_action["']\)/, "the visible history cancel action must grant explicit UI authorization");
const bookingCancelHandler = sliceBetween(app, "const cancelBooking", "const changeLanguage", "booking cancel handler");
assert.match(bookingCancelHandler, /showBookingForAuthorizedCancellation\([^\n]*["']ui_action["']\)/, "the visible booking cancel action must grant explicit UI authorization");
const historyOpenHandler = sliceBetween(app, "const openHistory", "const openOffers", "history open handler");
assert.match(historyOpenHandler, /!preserveReturn && stageRef\.current\.view !== "history"[\s\S]*captureHistoryReturn\(\)/, "opening or refreshing history must preserve the original non-history parent view");
assert.match(cancellationTool, /if \(stageRef\.current\.view !== "history"\) captureHistoryReturn\(\)/, "cancellation-driven history must capture the same return context as the history control");
assert.equal((app.match(/activeOnly: historyRequest\.activeOnly, preserveReturn: bookingOpenedFromHistoryRef\.current/g) || []).length, 2, "text and voice history requests from a history-selected booking must preserve the original parent view");
const historyReturnHandler = sliceBetween(app, "const restoreHistoryReturn", "const openHistory", "history return handler");
assert.match(historyReturnHandler, /bookingRef\.current = context\.booking[\s\S]*setBooking\(context\.booking/, "returning to an earlier booking must restore the exact booking used by its actions");
assert.match(historyReturnHandler, /cinemaRef\.current = context\.cinema[\s\S]*setCinema\(context\.cinema/, "all history returns must restore their original cinema context");
assert.match(historyReturnHandler, /planContext\?\.cinemaId === targetCinemaId[\s\S]*planContext\?\.sessionId/, "a stale checkout may restore its seat map only when the saved cinema/session plan matches");
assert.match(historyReturnHandler, /cinemaRef\.current = targetCinema[\s\S]*setCinema\(targetCinema\)/, "restoring a checkout seat map must restore its cinema context first");
assert.match(mainRender, /openHistory\(\{[^}]*preserveReturn:\s*true/, "the booking card's back action must reopen history without overwriting its original return target");
const completionHandler = sliceBetween(app, "const executeCancellationMutation", "const completeCancellation", "cancellation mutation executor");
assert.doesNotMatch(completionHandler, /say\("system"/, "voice-tool mutation results must use the source-aware announcer instead of emitting duplicate system copy");
assert.match(voiceCancellationDecision, /buildCancellationCompletionMessage[\s\S]*!storagePersisted[\s\S]*live refund was confirmed with reference[\s\S]*cancelled status could not be saved on this device/, "a live refund with failed local persistence must produce the complete authoritative warning");
assert.match(completionHandler, /buildCancellationCompletionMessage\(\{[\s\S]*cancellationCompletionOutputOwner\(\{ source, isDemoSimulation \}\)[\s\S]*completionOutputOwner === "local"[\s\S]*message: completionMessage/, "completion must assign one transcript owner and return the same authoritative message");
const completionLockWrapper = sliceBetween(app, "const completeCancellation", "const handleCancellationDecision", "cancellation lock wrapper");
assert.doesNotMatch(completionLockWrapper, /say\("system"/, "completeCancellation failures must not bypass source-aware duplicate suppression");
assert.match(completionLockWrapper, /announceCancellationSystem\(source, message\)/, "completeCancellation failures must announce only when their source permits local copy");
assert.match(voiceMessageFlow, /pendingVoiceDecision\.phase === "error"[\s\S]*declined retry and chose to keep the booking[\s\S]*Call show_booking_for_cancellation exactly once[\s\S]*speak only the returned message once/, "a spoken retryable-error decline must be captured and acknowledged only through the existing client tool");
assert.match(app, /const announceCancellationSystem = \(source, message\)[\s\S]*cancellationDecisionOutputOwner\(\{ source \}\) === "local"/, "voice-tool decisions must suppress local transcript copy so the tool owns the acknowledgement");
assert.doesNotMatch(app, /shouldHandleVoiceCancellationErrorLocally|source:\s*["']voice_local["']/, "retryable microphone declines must not use the removed local response path");
assert.match(cancellationDecisionHandler, /flow\.phase === "route_confirmation"[\s\S]*setCancellationFlow\([\s\S]*announceCancellationSystem\(source, message\)[\s\S]*phase: "final_confirmation"/, "typed and UI route confirmation must render one local final-confirmation response while voice-tool output remains suppressed");
assert.match(completionHandler, /!isCurrentBooking\(current\)/, "final cancellation must re-check that the showtime is still current before any mutation");
assert.match(completionHandler, /const existingJournal = readCancellationJournal\(\);[\s\S]{0,100}const journalBlocksCurrent = Boolean\(existingJournal\);[\s\S]{0,260}if \(journalBlocksCurrent\) \{[\s\S]*provider_reconciliation_required[\s\S]*return/, "no cancellation may overwrite either a pending or orphaned provider journal");
assert.match(completionHandler, /findBooking\(current\.ref, \{ strict: true \}\)[\s\S]{0,1200}latestStoredBooking\?\.cancelled/, "a tab must strictly re-read durable booking state inside the exclusive lock before issuing a refund");
assert.match(completionHandler, /appSessionIsCurrent[\s\S]*bookingContextIsCurrent[\s\S]*bookingPanelIsCurrent/, "cancellation completion must distinguish session validity from the currently visible panel");
assert.match(completionHandler, /!operationIsCurrent \|\| !appSessionIsCurrent/, "a same-session verified result must be reconciled even after panel navigation");
assert.match(completionHandler, /writeCancellationJournal\(\)[\s\S]*await vista\.refundBooking[\s\S]*idempotencyKey: cancellationJournal\.token/, "the opaque journal token must also serve as the stable provider idempotency key");
assert.match(completionHandler, /classifyRefundFailure\(refundError\)[\s\S]*reconciliationRequired[\s\S]*markCancellationJournalForReconciliation[\s\S]*clearCancellationJournal/, "ambiguous refund errors must retain a reconciliation lock while definitive rejections may clear it");
assert.ok(completionHandler.indexOf("appendBooking(updated)") < completionHandler.indexOf("if (storagePersisted) clearCancellationJournal"), "a verified live outcome must be durably saved before its safety journal is cleared");
assert.match(completionHandler, /else if \(liveRefundSucceeded\) markCancellationJournalForReconciliation/, "verified provider success with local persistence failure must retain a reconciliation lock");
assert.match(completionHandler, /!cancellationJournal\.persisted[\s\S]*persistent_mutation_lock_unavailable[\s\S]*no request was sent[\s\S]*return/, "a provider cancellation must not be sent when its durable mutation lock cannot be stored");
assert.match(completionHandler, /if \(!mountedRef\.current\)[\s\S]*storagePersisted/, "an unmounted mutation owner must still persist and return the verified result without issuing UI state updates");
assert.match(completionHandler, /if \(bookingContextIsCurrent\)[\s\S]*bookingRef\.current = updated[\s\S]*cancellationResultShouldRender[\s\S]*stageVisibleRef\.current[\s\S]*renderTopicRef\.current[\s\S]*if \(cancellationResultShouldRender\) showStage/, "background cancellation completion must not replace an unrelated or hidden panel");
assert.match(completionHandler, /historyReturnRef\.current\?\.booking\?\.ref[\s\S]*historyReturnRef\.current = \{ \.\.\.historyReturnRef\.current, booking: updated \}/, "cancelling a history parent booking must refresh its saved return stage");
assert.match(completionHandler, /historyContextRef\.current\?\.booking\?\.ref[\s\S]*historyContextRef\.current = \{ \.\.\.historyContextRef\.current, booking: updated \}/, "cancelling a history parent booking must refresh its action context");
assert.match(completionLockWrapper, /withCancellationMutationLock\([\s\S]*navigator\.locks[\s\S]*executeCancellationMutation[\s\S]*cross_tab_mutation_in_progress[\s\S]*no request was sent/i, "all provider mutations must hold an exclusive browser-wide lock and fail closed when unavailable or busy");
assert.match(completionLockWrapper, /const pendingJournal = readCancellationJournal\(\)[\s\S]{0,180}syncCancellationJournalUi\(\)/, "a pending journal discovered after confirmation must replace the actionable panel with truthful pending-state UI");
assert.match(completionLockWrapper, /catch \(error\)[\s\S]*cancellationInFlightRef\.current = false[\s\S]*markCancellationJournalForReconciliation[\s\S]*retryAllowed: false[\s\S]*dismissAllowed: false[\s\S]*outcomeUnknown: true/, "an unexpected executor failure must release its local latch, settle the processing panel, and fail closed against duplicate provider requests");
assert.match(vistaClient, /idempotencyKey[\s\S]*"Idempotency-Key"[\s\S]*explicitRejection[\s\S]*REFUND_REJECTED[\s\S]*REFUND_OUTCOME_UNVERIFIED/, "the refund adapter must send an idempotency key and distinguish explicit rejection from an ambiguous response");
const cardCancelHandler = sliceBetween(app, "const cancelBooking", "const changeLanguage", "booking-card cancellation handler");
assert.match(cardCancelHandler, /!isCurrentBooking\(current\)/, "the booking-card action must refuse past or cancelled records");
assert.match(cancellationTool, /const processingMutation = activeCancellationMutation\(\)[\s\S]*if \(processingMutation\) \{[\s\S]*return JSON\.stringify\(processingMutation\)/, "text, voice, and booking-card cancellation must reject every new target while a provider mutation is active");
for (const phase of ["checking", "route_confirmation", "final_confirmation", "processing", "error"]) {
  assert.match(app, new RegExp(`phase:\\s*["']${phase}["']`), `App cancellation state must represent the ${phase} phase`);
  assert.match(richMedia, new RegExp(`["']${phase}["']`), `BookingCard must render the ${phase} phase`);
}
assert.doesNotMatch(richMedia, /confirmingCancellation|setConfirmingCancellation/, "BookingCard must not keep a private confirmation state split from text and voice");
assert.match(richMedia, /export function BookingCard\(\{[\s\S]{0,400}\bcancellation\b/, "BookingCard must receive parent-owned cancellation state");
assert.match(richMedia, /const isCurrent = isCurrentBooking\(/, "BookingCard must share the current-showtime predicate used by text and voice routing");
assert.match(richMedia, /\{isCurrent && !cancellationActive \? \(/, "BookingCard must not render a cancellation action for a past showtime");
assert.match(richMedia, /cancellationActive[\s\S]{0,1800}<CancellationPanel\b/, "active cancellation phases must replace the normal card footer with one inline panel");
assert.match(richMedia, /onClick=\{onBack\}\s+disabled=\{cancellationBusy\}/, "booking Back must be disabled while cancellation eligibility or provider mutation is processing");

console.log("Validated live voice-event normalization, text/voice cinema and cancellation routing parity, shared cancellation rendering phases, stale-panel dismissal, and exclusive rich-panel rendering.");
