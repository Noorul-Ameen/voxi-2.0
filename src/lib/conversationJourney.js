const VIEW_PROGRESS = Object.freeze({
  empty: "start",
  discovery: "requirements_discovery",
  cinemas: "cinema_selection",
  movies: "movie_selection",
  showtimes: "showtime_selection",
  seatmap: "seat_selection",
  checkout: "payment",
  booking: "confirmation",
  history: "booking_history",
  offers: "offer_enquiry",
  faq: "general_enquiry",
  handover: "human_handover",
});

const cloneSeats = (value) => Array.isArray(value) ? value.map(String) : [];
const normalizeJourneyBookingStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return null;
  if (status === "confirmed_demo" || status === "locally_stored") return "summary_saved";
  return status;
};
const bookingSummaryStatus = (booking) => {
  if (!booking) return null;
  if (booking.cancelled || String(booking.bookingStatus || "").startsWith("cancelled")) {
    return normalizeJourneyBookingStatus(booking.bookingStatus) || "cancelled";
  }
  if (booking.verified !== true
    || booking.demo === true
    || booking.paymentStatus === "simulated_not_charged"
    || ["confirmed_demo", "summary_saved", "locally_stored"].includes(String(booking.bookingStatus || ""))) {
    return "summary_saved";
  }
  return normalizeJourneyBookingStatus(booking.bookingStatus) || "confirmed";
};
const compactMovie = (movie) => movie ? {
  id: movie.id || movie.movieId || null,
  title: movie.title || movie.movieTitle || null,
  posterUrl: movie.posterUrl || null,
} : null;
const compactCinema = (cinema) => cinema ? { id: cinema.id || null, name: cinema.name || null } : null;
const compactSession = (session, fallbackDate) => session ? {
  id: session.sessionId || null,
  date: session.date || fallbackDate || null,
  time: session.time || session.showtime || null,
  experience: session.exp || session.experience || null,
  screen: session.screen || null,
} : null;

export function createConversationJourney(sessionId) {
  return {
    schemaVersion: "1.0",
    sessionId,
    transportConversationId: null,
    previousTransportConversationId: null,
    intent: null,
    locale: "en",
    cinema: null,
    movie: null,
    scheduleDate: null,
    session: null,
    ticketQuantity: null,
    ticketType: null,
    experience: null,
    seats: [],
    foodItems: [],
    bookingProgress: "start",
    bookingRef: null,
    bookingStatus: null,
    refundRoute: null,
    refundStatus: null,
    refundReference: null,
    lastActivityAt: new Date().toISOString(),
  };
}

export function inferIntent({ view, text = "", previousIntent = null } = {}) {
  const query = String(text || "").toLowerCase();
  if (/\b(cancel|refund|void)\b|إلغاء|استرداد/.test(query)) return "cancellation";
  if (/\b(offer|discount|bank|card deal)\b|عرض|خصم|بطاق/.test(query) || view === "offers") return "offers";
  if (/\b(human|person|agent|customer care)\b|موظف|إنسان|خدمة العملاء/.test(query) || view === "handover") return "handover";
  if (/\b(book|movie|film|showtime|cinema|seat|ticket)\b|احجز|حجز|فيلم|سينما|موعد|مقعد|تذكرة/.test(query)
    || ["cinemas", "movies", "showtimes", "seatmap", "checkout", "booking"].includes(view)) return "booking";
  if (view === "faq") return "general_enquiry";
  return previousIntent;
}

export function syncJourney(current, {
  locale,
  cinema,
  scheduleDate,
  stage,
  selectedSeats,
  ticketQuantity,
  pendingOrder,
  booking,
  intent,
  transportConversationId,
  previousTransportConversationId,
} = {}) {
  const view = stage?.view || "empty";
  const activeOrder = stage?.order || pendingOrder || null;
  const activeBooking = stage?.booking || (view === "booking" ? booking : null) || null;
  const clearsMovie = view === "movies";
  const clearsSession = clearsMovie || view === "showtimes";
  const movie = stage?.movie
    || (activeOrder ? { id: activeOrder.movieId, title: activeOrder.movieTitle, posterUrl: activeOrder.posterUrl } : null)
    || (activeBooking ? { id: activeBooking.movieId, title: activeBooking.movieTitle, posterUrl: activeBooking.posterUrl } : null)
    || (clearsMovie ? null : current.movie);
  const session = stage?.session
    || (activeOrder ? { sessionId: activeOrder.sessionId, date: activeOrder.date, time: activeOrder.showtime, experience: activeOrder.experience, screen: activeOrder.screen } : null)
    || (activeBooking ? { sessionId: activeBooking.sessionId, date: activeBooking.date, time: activeBooking.showtime, experience: activeBooking.experience, screen: activeBooking.screen } : null)
    || (clearsSession ? null : current.session);
  const seats = cloneSeats(clearsSession && !activeOrder && !activeBooking
    ? []
    : view === "seatmap" && !activeOrder && !activeBooking
      ? selectedSeats
    : activeOrder?.seats?.length ? activeOrder.seats : activeBooking?.seats?.length ? activeBooking.seats : selectedSeats?.length ? selectedSeats : current.seats);
  // Ticket quantity is an output of seat selection, never an independent
  // booking input. Legacy stored quantities are ignored when seats disagree.
  const quantity = cloneSeats(activeOrder?.seats?.length
    ? activeOrder.seats
    : activeBooking?.seats?.length
      ? activeBooking.seats
      : seats).length || null;
  const ticketType = clearsSession && !activeOrder && !activeBooking
    ? null
    : activeOrder?.ticketType || activeBooking?.ticketType || current.ticketType || null;
  const activeCinema = cinema
    || (activeOrder?.cinemaId || activeOrder?.cinemaName ? { id: activeOrder.cinemaId, name: activeOrder.cinemaName } : null)
    || (activeBooking?.cinemaId || activeBooking?.cinemaName ? { id: activeBooking.cinemaId, name: activeBooking.cinemaName } : null);
  const bookingStatus = activeBooking
    ? bookingSummaryStatus(activeBooking)
    : activeOrder
      ? "payment_pending"
      : (clearsMovie || clearsSession ? null : normalizeJourneyBookingStatus(current.bookingStatus));
  const bookingProgress = view === "booking" && bookingStatus === "summary_saved"
    ? "saved_booking_summary"
    : view === "booking" && bookingStatus?.startsWith("cancelled")
      ? "cancelled_booking_summary"
      : VIEW_PROGRESS[view] || view;

  return {
    ...current,
    locale: locale || current.locale,
    cinema: compactCinema(activeCinema) || current.cinema,
    scheduleDate: session?.date || scheduleDate || current.scheduleDate,
    movie: compactMovie(movie),
    session: compactSession(session, scheduleDate),
    ticketQuantity: quantity,
    ticketType,
    experience: session?.exp || session?.experience || activeOrder?.experience || activeBooking?.experience || (clearsSession ? null : current.experience) || null,
    seats,
    bookingProgress,
    bookingRef: activeBooking?.ref || activeOrder?.ref || (clearsMovie || clearsSession ? null : current.bookingRef) || null,
    bookingStatus,
    refundRoute: activeBooking?.refundRoute || (bookingStatus?.startsWith("cancelled") ? current.refundRoute : null),
    refundStatus: activeBooking?.refundStatus || (bookingStatus?.startsWith("cancelled") ? current.refundStatus : null),
    refundReference: activeBooking?.refundReference || (bookingStatus?.startsWith("cancelled") ? current.refundReference : null),
    intent: intent || inferIntent({ view, previousIntent: current.intent }),
    transportConversationId: transportConversationId === undefined ? current.transportConversationId : transportConversationId,
    previousTransportConversationId: previousTransportConversationId === undefined ? current.previousTransportConversationId : previousTransportConversationId,
    lastActivityAt: new Date().toISOString(),
  };
}

export function journeyReducer(state, action) {
  if (action.type === "reset") return createConversationJourney(action.sessionId);
  if (action.type === "sync") return syncJourney(state, action.payload);
  if (action.type === "intent") return { ...state, intent: action.intent, lastActivityAt: new Date().toISOString() };
  if (action.type === "activity") return { ...state, lastActivityAt: new Date().toISOString() };
  return state;
}

export function relevantConversationHistory(messages, limit = 8) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.text && message.role !== "system")
    .slice(-limit)
    .map((message) => ({
      role: message.role === "agent" ? "assistant" : message.role,
      text: String(message.text)
        .replace(/\b(?:\d[ -]*?){12,19}\b/g, "[payment number removed]")
        .replace(/\b(?:cvv|cvc|otp|password|pin)\s*[:=-]?\s*\S+/gi, "$1 [removed]")
        .slice(0, 500),
    }));
}

export function buildTransportHandoff(journey, messages) {
  const history = relevantConversationHistory(messages);
  const safeBookingStatus = normalizeJourneyBookingStatus(journey.bookingStatus);
  const safe = {
    sessionId: journey.sessionId,
    previousConversationId: journey.transportConversationId || journey.previousTransportConversationId || null,
    intent: journey.intent || "not_yet_known",
    language: journey.locale === "ar" ? "Arabic" : "English",
    cinema: journey.cinema?.name || "not selected",
    movie: journey.movie?.title || "not selected",
    date: journey.session?.date || journey.scheduleDate || "not selected",
    showtime: journey.session?.time || "not selected",
    ticketQuantity: journey.ticketQuantity || "not selected",
    ticketType: journey.ticketType || "not selected",
    seats: journey.seats.length ? journey.seats.join(", ") : "not selected",
    experience: journey.experience || "not selected",
    bookingProgress: journey.bookingProgress,
    bookingRef: journey.bookingRef || "not confirmed",
    bookingStatus: safeBookingStatus || "not confirmed",
    refundRoute: journey.refundRoute || "not applicable",
    refundStatus: journey.refundStatus || "not applicable",
    refundReference: journey.refundReference || "not issued",
  };
  return [
    "CONTINUATION CONTEXT: This is the same guest and the same Voxi journey across a transport change.",
    "Do not greet, introduce yourself, restart the flow, or re-ask details already present below.",
    `Structured journey: ${JSON.stringify(safe)}`,
    `Recent relevant turns: ${JSON.stringify(history)}`,
    "Continue from the current booking/enquiry step and ask only for the next missing detail.",
  ].join("\n");
}

export function journeyDynamicVariables(journey, { continuation = false } = {}) {
  const safeBookingStatus = normalizeJourneyBookingStatus(journey.bookingStatus);
  return {
    preferred_language: journey.locale === "ar" ? "Arabic" : "English",
    voxi_session_id: String(journey.sessionId || ""),
    voxi_previous_conversation_id: String(journey.transportConversationId || journey.previousTransportConversationId || ""),
    voxi_is_continuation: continuation ? "true" : "false",
    voxi_intent: String(journey.intent || "not_yet_known"),
    voxi_movie: String(journey.movie?.title || "not_selected"),
    voxi_cinema: String(journey.cinema?.name || "not_selected"),
    voxi_booking_progress: String(journey.bookingProgress || "start"),
    voxi_booking_status: String(safeBookingStatus || "not_confirmed"),
    voxi_performance_date: String(journey.session?.date || journey.scheduleDate || "not_selected"),
    voxi_refund_status: String(journey.refundStatus || "not_applicable"),
    voxi_refund_reference: String(journey.refundReference || "not_issued"),
  };
}
