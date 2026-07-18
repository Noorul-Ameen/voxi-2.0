import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveFilmCandidate } from "../src/lib/fuzzyResolvers.js";
import { resolveProgrammingDateSelection, resolveVisibleSelectionProgrammingDate } from "../src/lib/programmingDateSelection.js";
import { FILMS, SESSIONS } from "../src/mockVistaData.js";
import * as vista from "../src/vistaClient.js";
import { installPublicAssetFetch } from "./lib/installPublicAssetFetch.mjs";

installPublicAssetFetch();

const published = ["2026-07-14", "2026-07-15"];

assert.deepEqual(
  resolveProgrammingDateSelection({
    availableDates: published,
    userRequestedDate: "2026-07-13",
    toolRequestedDate: "2026-07-14",
    selectedDate: "2026-07-14",
  }),
  {
    date: null,
    unavailableDate: "2026-07-13",
    source: "user",
    blocked: true,
  },
  "an unavailable guest request must outrank an agent-proposed fallback date",
);

assert.deepEqual(
  resolveProgrammingDateSelection({
    availableDates: ["2026-07-13", ...published],
    userRequestedDate: "2026-07-13",
    toolRequestedDate: "2026-07-14",
    selectedDate: "2026-07-14",
  }),
  {
    date: "2026-07-13",
    unavailableDate: null,
    source: "user",
    blocked: false,
  },
  "the retained guest date must be used when a newly selected cinema publishes it",
);

assert.deepEqual(
  resolveProgrammingDateSelection({
    availableDates: published,
    toolRequestedDate: "2026-07-13",
    selectedDate: "2026-07-14",
  }),
  {
    date: null,
    unavailableDate: "2026-07-13",
    source: "tool",
    blocked: true,
  },
  "an explicitly requested unpublished tool date must not fall back to the selected date",
);

assert.equal(
  resolveProgrammingDateSelection({ availableDates: published, selectedDate: "2026-07-14" }).date,
  "2026-07-14",
  "a normal date-less browse may retain the selected published date",
);

assert.equal(
  resolveProgrammingDateSelection({ availableDates: published }).date,
  "2026-07-14",
  "a normal date-less browse may use the first published date when no date was selected",
);

assert.deepEqual(
  resolveVisibleSelectionProgrammingDate({
    availableDates: ["2026-07-15", "2026-07-16"],
    toolRequestedDate: "2026-07-16",
    selectedDate: "2026-07-15",
    visibleDate: "2026-07-15",
    hasVisibleSelection: true,
  }),
  { date: "2026-07-15", unavailableDate: null, source: "visible", blocked: false },
  "an agent date must not move a movie away from the visible tomorrow list before resolving it",
);

assert.equal(
  resolveVisibleSelectionProgrammingDate({
    availableDates: ["2026-07-15", "2026-07-16"],
    userRequestedDate: "2026-07-16",
    toolRequestedDate: "2026-07-15",
    selectedDate: "2026-07-15",
    visibleDate: "2026-07-15",
    hasVisibleSelection: true,
  }).date,
  "2026-07-16",
  "a fresh explicit guest date must remain stronger than the old visible list",
);

const sourceSession = SESSIONS[0];
assert.ok(sourceSession, "the refreshed snapshot needs a selectable source session");
const sourceFilm = FILMS.find((film) => (
  film.CinemaId === sourceSession.CinemaId && film.ScheduledFilmId === sourceSession.ScheduledFilmId
));
assert.ok(sourceFilm?.Title, "the source session must resolve to its displayed film metadata");
const visibleMovies = await vista.getScheduledFilms(sourceSession.CinemaId, sourceSession.SourceProgrammingDate);
const visibleFilm = resolveFilmCandidate(visibleMovies, sourceFilm.Title);
assert.equal(visibleFilm?.id, sourceFilm.ScheduledFilmId, "an exact title must resolve from the currently displayed cinema/date list");
const sourceKidsSession = SESSIONS.find((session) => (
  Array.isArray(session.SessionAttributesNames)
  && session.SessionAttributesNames.some((label) => String(label).toUpperCase() === "KIDS")
));
if (sourceKidsSession) {
  const kidsDateMovies = await vista.getScheduledFilms(sourceKidsSession.CinemaId, sourceKidsSession.SourceProgrammingDate);
  const kidsFormatMovie = kidsDateMovies.find((movie) => movie.id === sourceKidsSession.ScheduledFilmId);
  assert.ok(kidsFormatMovie?.experiences?.includes("KIDS"), "scheduled-film metadata must expose its verified KIDS session format for family filtering");
}
const visibleSessions = await vista.getSessions(sourceSession.CinemaId, visibleFilm.id, sourceSession.SourceProgrammingDate);
assert.ok(
  visibleSessions.some((session) => session.sessionIds.includes(String(sourceSession.SessionId))),
  "the selected film must retain its authoritative source session on the visible programming date",
);

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const requestedDateParser = app.slice(app.indexOf("function requestedProgrammingDate"), app.indexOf("function programmingDatesForCinema"));
assert.match(requestedDateParser, /ordinalDay\s*=\s*raw\.match/, "the shared typed/voice date capture must recognize context-bound spoken ordinal dates such as on 17th");
assert.match(requestedDateParser, /\(\?=\\s\*\(\?:\$\|\[,\.\!\?;:\]/, "an ordinal embedded in a movie, screen, row, seat, or option phrase must not be treated as a date");
assert.match(requestedDateParser, /ordinalText\.match\(\/\^\(\?:the/, "a standalone ordinal must be accepted only as a complete date reply, not inside a movie or seat choice");
assert.match(requestedDateParser, /\(\?:st\|nd\|rd\|th\)\?/, "month-name dates must accept an ordinal suffix such as July 17th");
assert.match(requestedDateParser, /validCalendarDate/, "month-name requests must reject impossible calendar dates");
assert.match(app, /const userRequestedDateRef = useRef\(null\)/, "the widget must retain an unresolved guest date across client-tool calls");
assert.equal((app.match(/resolveClientToolProgrammingDate\(/g) || []).length, 1, "movie-list loading must use the guarded general date resolver");
assert.equal((app.match(/resolveVisibleSelectionProgrammingDate\(/g) || []).length, 2, "movie and session selection must bind to their visible list date");
assert.equal(
  (app.match(/captureUserProgrammingDate\(/g) || []).length,
  2,
  "typed and voice-transcribed guest messages must capture the same explicit date constraint",
);
const cinemaSelection = app.slice(app.indexOf("const chooseCinema"), app.indexOf("const chooseDate"));
assert.match(cinemaSelection, /const retainedDate = userRequestedDateRef\.current \|\| discoveryPreferencesRef\.current\.date/, "tapping a cinema must retain an unresolved guest date");
assert.match(cinemaSelection, /routeDiscoveryTurn\("", \{ cinemaOverride: nextCinema, dateOverride: retainedDate/, "cinema taps must delegate retained-date validation to the shared discovery router");
const discoveryRouter = app.slice(app.indexOf("const routeDiscoveryTurn"), app.indexOf("const clearConversationState"));
assert.match(discoveryRouter, /!availableDates\.includes\(preferences\.date\)[\s\S]*showUnavailableProgrammingDate\(preferences\.date\)/, "the shared discovery router must block unavailable dates without substitution");
const unavailablePresentation = app.slice(app.indexOf("const showUnavailableProgrammingDate"), app.indexOf("const resolveClientToolProgrammingDate"));
assert.match(unavailablePresentation, /view:\s*"movies",\s*movies:\s*\[\],\s*error:/, "an unavailable date must replace stale movie or showtime results with an explicit empty state");
assert.match(unavailablePresentation, /errorCode:\s*"date_unavailable"/, "the date-unavailable state must remain distinguishable from a provider loading error");
const showShowtimesTool = app.slice(app.indexOf("show_showtimes:"), app.indexOf("show_seat_map:"));
assert.match(showShowtimesTool, /const requestedDateText = toolDate \|\| displayDate \|\| date;/, "show_showtimes must derive its optional date only from declared date fields");
assert.match(showShowtimesTool, /const visibleMovie = resolveFilm\(movieId\) \|\| resolveFilm\(movieTitle\)/, "show_showtimes must resolve the requested title from the visible list before loading another date");
assert.match(showShowtimesTool, /resolveVisibleSelectionProgrammingDate\(\{[\s\S]*visibleDate:\s*filmsDateRef\.current[\s\S]*hasVisibleSelection/, "show_showtimes must retain the displayed movie list date");
assert.ok(showShowtimesTool.indexOf("const visibleMovie") < showShowtimesTool.indexOf("await ensureFilms"), "visible title resolution must happen before any film-list reload");
const typedMessageFlow = app.slice(app.indexOf("const sendText"), app.indexOf("const sendUiTurn"));
assert.match(typedMessageFlow, /if \(unavailableDate\) \{[\s\S]*sendContextualUpdate/, "a deterministic unavailable typed request must provide authoritative no-substitution context");
assert.match(typedMessageFlow, /bookingContext && !resumeOnlyTurn && !unavailableDate/, "an unavailable typed date must not launch fallback discovery while the conversational turn can still be answered");

console.log("Validated explicit programming-date precedence and no-substitution behavior.");
