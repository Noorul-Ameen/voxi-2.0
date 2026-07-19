import assert from "node:assert/strict";
import {
  createDiscoveryPreferences,
  extractDiscoveryPreferencePatch,
  filterDiscoveryResults,
  getMissingDiscoveryCriteria,
  isOpenEndedDiscoveryRequest,
  mergeDiscoveryPreferences,
  parseAndMergeDiscoveryPreferences,
  resolveDiscoveryMovieCandidate,
  shouldTreatAsDiscoveryFilterTurn,
  unresolvedMovieTitleCandidate,
} from "../src/lib/discoveryPreferences.js";
import {
  buildAuthoritativeDiscoveryContext,
  buildMovieSelectionGroundingContext,
  isAmbiguousMovieSelectionUtterance,
} from "../src/lib/discoveryResultContext.js";

const NOW = new Date("2026-07-14T08:00:00Z");

for (const phrase of ["anything", "anything is fine", "whatever", "any movie", "surprise me", "recommend something"]) {
  assert.equal(isOpenEndedDiscoveryRequest(phrase), true, `open-ended discovery must accept: ${phrase}`);
  const signal = extractDiscoveryPreferencePatch(phrase, { now: NOW });
  for (const key of ["movieId", "movieTitle", "preferredTime", "timeBand", "genre", "language", "experience", "audience"]) {
    assert.ok(signal.clear.includes(key), `${phrase} must clear stale ${key}`);
  }
}
assert.equal(isOpenEndedDiscoveryRequest("any time"), false, "any time must clear only the time preference");
const cinemas = [
  { id: "0002", name: "Mall of the Emirates", city: "Dubai" },
  { id: "0012", name: "Yas Mall", city: "Abu Dhabi" },
];
const movies = [
  { id: "toy", title: "Toy Story 5", genres: ["Animation", "Adventure", "Family"], languageName: "English", experiences: ["IMAX", "STANDARD"] },
  { id: "laugh", title: "The Big Laugh", genres: ["Comedy"], languageName: "Arabic", experiences: ["STANDARD"] },
  { id: "race", title: "Desert Race", genres: ["Action", "Sports"], languageName: "English", experiences: ["4DX", "STANDARD"] },
];
const sessions = [
  { sessionId: "t1", scheduledFilmId: "toy", cinemaId: "0002", programmingDate: "2026-07-15", time: "17:40", exp: "STANDARD" },
  { sessionId: "t2", scheduledFilmId: "toy", cinemaId: "0002", programmingDate: "2026-07-15", time: "18:00", exp: "IMAX" },
  { sessionId: "t3", scheduledFilmId: "toy", cinemaId: "0012", programmingDate: "2026-07-15", time: "18:10", exp: "STANDARD" },
  { sessionId: "c1", scheduledFilmId: "laugh", cinemaId: "0002", programmingDate: "2026-07-15", time: "18:35", exp: "STANDARD" },
  { sessionId: "c2", scheduledFilmId: "laugh", cinemaId: "0002", programmingDate: "2026-07-15", time: "20:00", exp: "STANDARD" },
  { sessionId: "r1", scheduledFilmId: "race", cinemaId: "0002", programmingDate: "2026-07-15", time: "21:30", exp: "4DX" },
  { sessionId: "r2", scheduledFilmId: "race", cinemaId: "0002", programmingDate: "2026-07-16", time: "18:00", exp: "STANDARD" },
  { sessionId: "r3", scheduledFilmId: "race", cinemaId: "0002", programmingDate: "2026-07-17", time: "19:15", exp: "KIDS" },
];

const combined = extractDiscoveryPreferencePatch(
  "I want Toy Story 5 at Mall of the Emirates tomorrow at 6:00 PM in IMAX",
  { cinemas, movies, now: NOW },
);
assert.deepEqual(combined.patch, {
  cinemaId: "0002",
  cinemaName: "Mall of the Emirates",
  city: "Dubai",
  date: "2026-07-15",
  dateSignal: "tomorrow",
  preferredTime: "18:00",
  movieId: "toy",
  movieTitle: "Toy Story 5",
  experience: "IMAX",
});
assert.deepEqual(
  getMissingDiscoveryCriteria(createDiscoveryPreferences(combined.patch), ["cinema", "date", "time", "movie"]),
  [],
  "criteria already present in a guest turn must never be requested again",
);

const textResult = parseAndMergeDiscoveryPreferences({}, "Show me kids' movies tomorrow", { cinemas, movies, now: NOW });
const voiceResult = parseAndMergeDiscoveryPreferences({}, "Show me kids' movies tomorrow", { cinemas, movies, now: NOW });
assert.deepEqual(textResult.preferences, voiceResult.preferences, "text and voice transcripts must share deterministic preference parsing");
assert.equal(textResult.preferences.audience, "kids_family");
assert.equal(textResult.preferences.date, "2026-07-15");
const kidsAudienceOnly = parseAndMergeDiscoveryPreferences({}, "Show me kids and family movies", { cinemas, movies, knownExperiences: ["KIDS", "IMAX"], now: NOW });
assert.equal(kidsAudienceOnly.preferences.audience, "kids_family", "kids and family movie wording must be treated as an audience preference");
assert.equal(kidsAudienceOnly.preferences.experience, null, "kids and family movie wording must not silently require the KIDS cinema experience");
const explicitKidsExperience = parseAndMergeDiscoveryPreferences({}, "Show me movies in the KIDS experience", { cinemas, movies, knownExperiences: ["KIDS", "IMAX"], now: NOW });
assert.equal(explicitKidsExperience.preferences.experience, "KIDS", "an explicit KIDS experience request must still filter by the KIDS cinema experience");

const arabicDiscoveryQuery = "ما هي الأفلام العربية في مول الإمارات غداً؟";
const arabicDiscoverySignal = extractDiscoveryPreferencePatch(arabicDiscoveryQuery, { cinemas, movies, now: NOW });
assert.deepEqual(arabicDiscoverySignal.patch, {
  cinemaId: "0002",
  cinemaName: "Mall of the Emirates",
  city: "Dubai",
  date: "2026-07-15",
  dateSignal: "tomorrow",
  language: "Arabic",
}, "an Arabic discovery question must retain its supplied cinema, date, and language");
assert.equal(
  unresolvedMovieTitleCandidate(arabicDiscoveryQuery, arabicDiscoverySignal),
  null,
  "an Arabic discovery question must not become an unresolved movie title",
);
const arabicDiscoveryPreferences = parseAndMergeDiscoveryPreferences({}, arabicDiscoveryQuery, { cinemas, movies, now: NOW }).preferences;
assert.equal(arabicDiscoveryPreferences.movieId, null);
assert.equal(arabicDiscoveryPreferences.movieTitle, null);
const arabicDiscoveryResults = filterDiscoveryResults({ movies, sessions, cinemas, preferences: arabicDiscoveryPreferences });
assert.deepEqual(arabicDiscoveryResults.movies.map((movie) => movie.id), ["laugh"], "Arabic discovery must return only Arabic-language movies");
assert.ok(arabicDiscoveryResults.sessions.every((session) => session.scheduledFilmId === "laugh" && session.cinemaId === "0002" && session.programmingDate === "2026-07-15"));

for (const datePhrase of ["I want to go on 17th", "I'm looking to go on, um, 17th", "17th", "I want to go on July 17th", "I want to go on 2026-07-17"]) {
  const parsedDate = extractDiscoveryPreferencePatch(datePhrase, { now: NOW });
  assert.equal(parsedDate.patch.date, "2026-07-17", `the spoken date must be retained for: ${datePhrase}`);
  assert.equal(parsedDate.patch.dateSignal, "explicit");
}
for (const nonDateOrdinal of [
  "Show me the 2nd movie",
  "I want the 1st row",
  "Select the 3rd seat",
  "Show me the movie on the 2nd screen",
  "We want seats on the 3rd row",
  "Choose the show on the 2nd option",
]) {
  assert.equal(extractDiscoveryPreferencePatch(nonDateOrdinal, { now: NOW }).patch.date, undefined, `an ordinal choice must not become a date: ${nonDateOrdinal}`);
}
assert.equal(extractDiscoveryPreferencePatch("July 32nd", { now: NOW }).patch.date, undefined, "an impossible month date must be rejected");
assert.equal(extractDiscoveryPreferencePatch("31st February", { now: NOW }).patch.date, undefined, "an impossible calendar date must be rejected");
assert.equal(extractDiscoveryPreferencePatch("January 2nd", { now: new Date("2026-12-15T08:00:00Z") }).patch.date, "2027-01-02", "a month-name request after that month has passed must roll into the next year");

assert.equal(unresolvedMovieTitleCandidate("I want to watch a comedy", extractDiscoveryPreferencePatch("I want to watch a comedy", { movies, now: NOW })), null, "a genre request must not be retained as an unknown title");
assert.equal(unresolvedMovieTitleCandidate("I want to watch a movie tomorrow", extractDiscoveryPreferencePatch("I want to watch a movie tomorrow", { movies, now: NOW })), null, "a broad movie request must not become an unknown title");
assert.equal(unresolvedMovieTitleCandidate("I want Toy Storey 5 at Mall of the Emirates tomorrow", extractDiscoveryPreferencePatch("I want Toy Storey 5 at Mall of the Emirates tomorrow", { cinemas, movies: [], now: NOW })), "Toy Storey 5", "live mode must retain a likely title until its cinema/date catalog loads");
assert.equal(unresolvedMovieTitleCandidate("I need Toy Storey 5 at Mall of the Emirates tomorrow", extractDiscoveryPreferencePatch("I need Toy Storey 5 at Mall of the Emirates tomorrow", { cinemas, movies: [], now: NOW })), "Toy Storey 5", "I-need phrasing must retain a plausible title without confusing ticket-count requests");
assert.equal(unresolvedMovieTitleCandidate("Toy Storey 5 at Mall of the Emirates tomorrow", extractDiscoveryPreferencePatch("Toy Storey 5 at Mall of the Emirates tomorrow", { cinemas, movies: [], now: NOW })), "Toy Storey 5", "a bare residual title must survive cinema/date removal in live mode");
assert.equal(unresolvedMovieTitleCandidate("I need three tickets at Mall of the Emirates tomorrow", extractDiscoveryPreferencePatch("I need three tickets at Mall of the Emirates tomorrow", { cinemas, movies: [], now: NOW })), null, "ticket targets must never be mistaken for a movie title");
assert.equal(unresolvedMovieTitleCandidate("Show me movies tomorrow", extractDiscoveryPreferencePatch("Show me movies tomorrow", { cinemas, movies: [], now: NOW })), null, "plural generic movie requests must remain broad discovery requests");
assert.equal(unresolvedMovieTitleCandidate("I want films at Mall of the Emirates tomorrow", extractDiscoveryPreferencePatch("I want films at Mall of the Emirates tomorrow", { cinemas, movies: [], now: NOW })), null, "generic film requests must ask for a preference instead of showing an unknown-title error");
const genericPlayingQuery = "What is playing at Mall of the Emirates tomorrow at 6 PM?";
const genericPlayingSignal = extractDiscoveryPreferencePatch(genericPlayingQuery, { cinemas, movies: [], now: NOW });
assert.deepEqual(genericPlayingSignal.patch, {
  cinemaId: "0002",
  cinemaName: "Mall of the Emirates",
  city: "Dubai",
  date: "2026-07-15",
  dateSignal: "tomorrow",
  preferredTime: "18:00",
}, "a generic playing question must retain its supplied cinema, date, and time");
assert.equal(unresolvedMovieTitleCandidate(genericPlayingQuery, genericPlayingSignal), null, "`What is playing` must remain generic discovery instead of becoming an unknown movie title");
const genericPlayingPreferences = mergeDiscoveryPreferences({}, genericPlayingSignal).preferences;
assert.equal(genericPlayingPreferences.movieTitle, null, "generic discovery must not set movieTitle");
const genericPlayingResults = filterDiscoveryResults({ movies, sessions, cinemas, preferences: genericPlayingPreferences });
assert.equal(genericPlayingResults.time.exactTimeMatch, true, "the supplied 6 PM must drive showtime filtering");
assert.ok(genericPlayingResults.sessions.some((session) => session.sessionId === "t2"), "the exact 6 PM Mall of the Emirates session must be returned");
assert.ok(genericPlayingResults.sessions.every((session) => session.cinemaId === "0002" && session.programmingDate === "2026-07-15"), "all nearby options must retain the supplied cinema and date");
assert.ok(genericPlayingResults.sessions.every((session) => !["c2", "r1", "r2"].includes(session.sessionId)), "distant, wrong-date, and unrelated-time sessions must stay filtered out");
const authoritativeContext = buildAuthoritativeDiscoveryContext({
  cinema: { name: "Mall of the Emirates" },
  selectedDate: "2026-07-15",
  movies: genericPlayingResults.movies.map((movie) => ({
    title: movie.title,
    showtimes: genericPlayingResults.sessions
      .filter((session) => session.scheduledFilmId === movie.id)
      .map((session) => ({ time: session.time, experience: session.exp })),
  })),
});
assert.match(authoritativeContext, /Mall of the Emirates on 2026-07-15/);
assert.match(authoritativeContext, /Toy Story 5: 18:00 IMAX/);
assert.match(authoritativeContext, /Recommend or describe only these supplied movie titles and showtimes by name/);
assert.doesNotMatch(authoritativeContext, /Secret Life of Pets|Rise of Gru/, "agent context must not introduce titles absent from the filtered result");
assert.match(authoritativeContext, /none is selected unless a separate confirmed-selection update/, "displaying cards must not be mistaken for selecting a movie");

const emptyAuthoritativeContext = buildAuthoritativeDiscoveryContext({
  cinema: { name: "Mall of the Emirates" },
  selectedDate: "2026-07-17",
  preferences: { genre: "Action", audience: "kids_family" },
  movies: [],
});
assert.match(emptyAuthoritativeContext, /ZERO matching movie cards/i);
assert.match(emptyAuthoritativeContext, /Retained filters: Action, kids\/family/i);
assert.match(emptyAuthoritativeContext, /Do not say that options, choices, or a movie list are on screen/i);
assert.match(emptyAuthoritativeContext, /do not call show_showtimes/i);
const missingPreferenceContext = buildAuthoritativeDiscoveryContext({
  shown: "discovery question",
  missing: ["preference"],
  movies: [],
});
assert.match(missingPreferenceContext, /required information is missing \(preference\)/i);
assert.match(missingPreferenceContext, /Ask only for preference/i);
assert.equal(isAmbiguousMovieSelectionUtterance("The chosen movies."), true);
assert.equal(isAmbiguousMovieSelectionUtterance("those options"), true);
assert.equal(isAmbiguousMovieSelectionUtterance("this one"), true);
assert.equal(isAmbiguousMovieSelectionUtterance("that one"), true);
assert.equal(isAmbiguousMovieSelectionUtterance("Toy Story 5"), false, "an exact title must remain eligible for normal fuzzy-title resolution");
const emptySelectionGrounding = buildMovieSelectionGroundingContext({
  text: "The chosen movies.",
  stage: { view: "movies", movies: [], error: "No movies match all of your preferences." },
});
assert.match(emptySelectionGrounding, /zero movie cards are visible/i);
assert.match(emptySelectionGrounding, /do not say 'great choice'/i);
assert.match(emptySelectionGrounding, /do not ask for a showtime/i);
const visibleSelectionGrounding = buildMovieSelectionGroundingContext({
  text: "the shown movies",
  stage: { view: "movies", movies: [{ title: "Toy Story 5" }, { title: "Desert Race" }] },
});
assert.match(visibleSelectionGrounding, /Toy Story 5, Desert Race/);
assert.match(visibleSelectionGrounding, /no movie is selected/i);
assert.match(buildMovieSelectionGroundingContext({
  text: "the chosen movies",
  stage: { view: "loading" },
}), /results are still loading/i);
assert.match(buildMovieSelectionGroundingContext({
  text: "the chosen movies",
  stage: { view: "discovery", question: "What kind of movie would you like?" },
}), /more information is required/i);
assert.equal(buildMovieSelectionGroundingContext({
  text: "the shown movies",
  stage: { view: "showtimes", movie: { title: "Toy Story 5" } },
}), "", "a confirmed movie stage must not be overwritten by the ambiguity guard");
assert.equal(unresolvedMovieTitleCandidate("I want Mall of the Emirates tomorrow", extractDiscoveryPreferencePatch("I want Mall of the Emirates tomorrow", { cinemas, movies: [], now: NOW })), null, "a cinema/date-only turn must ask for a preference, not treat the cinema as a title");
assert.equal(unresolvedMovieTitleCandidate("I want Dubai tomorrow", extractDiscoveryPreferencePatch("I want Dubai tomorrow", { cinemas, movies: [], now: NOW })), null, "a city/date-only turn must not become a title");
assert.equal(unresolvedMovieTitleCandidate("I want Toy Story around 6 PM at Mall of the Emirates tomorrow", extractDiscoveryPreferencePatch("I want Toy Story around 6 PM at Mall of the Emirates tomorrow", { cinemas, movies: [], now: NOW })), "Toy Story", "a combined title and preferred-time turn must retain the title");
assert.equal(unresolvedMovieTitleCandidate("I want Toy Story in IMAX", extractDiscoveryPreferencePatch("I want Toy Story in IMAX", { cinemas, movies: [], now: NOW })), "Toy Story", "a combined title and experience turn must retain the title");
assert.equal(unresolvedMovieTitleCandidate("Watch Toy Storey 5 around 8 PM", extractDiscoveryPreferencePatch("Watch Toy Storey 5 around 8 PM", { cinemas, movies: [], now: NOW })), "Toy Storey 5", "an ASR-like title must survive time-criterion subtraction");
assert.equal(unresolvedMovieTitleCandidate("أريد فيلماً في مول الإمارات غداً الساعة 6 مساءً", extractDiscoveryPreferencePatch("أريد فيلماً في مول الإمارات غداً الساعة 6 مساءً", { cinemas, movies: [], now: NOW })), null, "a broad Arabic cinema/date/time request must not become an unknown title");
assert.equal(unresolvedMovieTitleCandidate("أريد فيلم توي ستوري 5 في مول الإمارات غداً", extractDiscoveryPreferencePatch("أريد فيلم توي ستوري 5 في مول الإمارات غداً", { cinemas, movies: [], now: NOW })), "توي ستوري 5", "an Arabic named-title phrase must survive the location boundary for deferred matching");
assert.equal(resolveDiscoveryMovieCandidate(movies, "Toy Story"), movies[0], "partial titles must reuse the protected fuzzy resolver after catalog load");
assert.equal(resolveDiscoveryMovieCandidate(movies, "Toy Storey 5"), movies[0], "ASR-like title variants must resolve when the best candidate is unambiguous");
assert.equal(resolveDiscoveryMovieCandidate([{ id: "a", title: "Toy Story 5" }, { id: "b", title: "Toy Story Classics" }], "Toy Story"), null, "ambiguous partial titles must request clarification");

const imaxSignal = extractDiscoveryPreferencePatch("IMAX", { movies, now: NOW });
assert.equal(shouldTreatAsDiscoveryFilterTurn("IMAX", { view: "movies", signal: imaxSignal }), true, "a bare criterion in active discovery must update results");
assert.equal(shouldTreatAsDiscoveryFilterTurn("I want IMAX", { view: "seatmap", signal: extractDiscoveryPreferencePatch("I want IMAX", { movies, now: NOW }) }), true, "an explicit experience change must update an active booking journey");
assert.equal(shouldTreatAsDiscoveryFilterTurn("Is IMAX wheelchair accessible?", { view: "seatmap", signal: extractDiscoveryPreferencePatch("Is IMAX wheelchair accessible?", { movies, now: NOW }) }), false, "an accessibility FAQ must not clear seat state merely because it names an experience");
assert.equal(shouldTreatAsDiscoveryFilterTurn("Does Mall of the Emirates cinema have parking?", { view: "movies", signal: extractDiscoveryPreferencePatch("Does Mall of the Emirates cinema have parking?", { cinemas, movies, now: NOW }) }), false, "a cinema policy FAQ must not mutate retained discovery criteria");
assert.equal(shouldTreatAsDiscoveryFilterTurn("What Arabic movies are showing tonight?", { view: "empty", signal: extractDiscoveryPreferencePatch("What Arabic movies are showing tonight?", { movies, now: NOW }) }), true, "a question-shaped discovery request must still route when it asks what is showing");

const arabicComedy = extractDiscoveryPreferencePatch("I want an Arabic comedy around 8 PM", { movies, now: NOW });
assert.equal(arabicComedy.patch.genre, "Comedy");
assert.equal(arabicComedy.patch.language, "Arabic");
assert.equal(arabicComedy.patch.preferredTime, "20:00");
assert.equal(
  extractDiscoveryPreferencePatch("around 8 p.m.", { now: NOW }).patch.preferredTime,
  "20:00",
  "punctuated speech-to-text meridiems must normalize consistently",
);
assert.equal(extractDiscoveryPreferencePatch("18:30", { now: NOW }).patch.preferredTime, "18:30");
assert.equal(extractDiscoveryPreferencePatch("8", { now: NOW, expectingTime: true }).patch.preferredTime, "08:00");

const exact = filterDiscoveryResults({
  movies,
  sessions,
  cinemas,
  preferences: combined.patch,
});
assert.deepEqual(exact.movies.map((movie) => movie.id), ["toy"]);
assert.deepEqual(exact.sessions.map((session) => session.sessionId), ["t2"]);
assert.equal(exact.time.exactTimeMatch, true);
assert.equal(exact.time.usedNearestFallback, false);
assert.equal(exact.time.matchKind, "exact");

const nearest = filterDiscoveryResults({
  movies,
  sessions,
  cinemas,
  preferences: {
    cinemaId: "0002",
    date: "2026-07-15",
    genre: "Comedy",
    language: "Arabic",
    preferredTime: "18:00",
  },
});
assert.deepEqual(nearest.movies.map((movie) => movie.id), ["laugh"]);
assert.deepEqual(nearest.sessions.map((session) => session.sessionId), ["c1"]);
assert.equal(nearest.time.exactTimeMatch, false);
assert.equal(nearest.time.usedNearestFallback, true);
assert.equal(nearest.time.closestDeltaMinutes, 35);
assert.deepEqual(nearest.time.closestTimes, ["18:35"]);

const kidsOnly = filterDiscoveryResults({ movies, sessions, cinemas, preferences: { audience: "kids_family", date: "2026-07-15" } });
assert.deepEqual(kidsOnly.movies.map((movie) => movie.id), ["toy"], "kids/family discovery must exclude unrelated adult catalog entries");
assert.ok(kidsOnly.sessions.every((session) => session.scheduledFilmId === "toy"));

const experienceOnly = filterDiscoveryResults({ movies, sessions, cinemas, preferences: { cinemaId: "0002", date: "2026-07-15", experience: "4DX" } });
assert.deepEqual(experienceOnly.movies.map((movie) => movie.id), ["race"]);
assert.deepEqual(experienceOnly.sessions.map((session) => session.sessionId), ["r1"]);

const specificOnly = filterDiscoveryResults({ movies, sessions, cinemas, preferences: { movieTitle: "Toy Story 5", cinemaId: "0002", date: "2026-07-15" } });
assert.deepEqual(specificOnly.movies.map((movie) => movie.id), ["toy"]);
assert.ok(specificOnly.sessions.every((session) => session.scheduledFilmId === "toy"));

const cityOnly = filterDiscoveryResults({ movies, sessions, cinemas, preferences: { city: "Abu Dhabi", date: "2026-07-15" } });
assert.deepEqual(cityOnly.sessions.map((session) => session.sessionId), ["t3"]);

const initial = createDiscoveryPreferences({ cinemaId: "0002", cinemaName: "Mall of the Emirates", date: "2026-07-15", genre: "Comedy", experience: "STANDARD" });
const changedGenre = parseAndMergeDiscoveryPreferences(initial, "Actually, make that action", { movies, now: NOW });
assert.equal(changedGenre.preferences.genre, "Action");
assert.equal(changedGenre.preferences.cinemaId, "0002", "unmentioned criteria must persist");
assert.equal(changedGenre.preferences.date, "2026-07-15");
assert.equal(changedGenre.invalidates.movieResults, true);
assert.equal(changedGenre.invalidates.seatSelection, true);

const changedExperience = parseAndMergeDiscoveryPreferences(changedGenre.preferences, "IMAX instead", { movies, now: NOW });
assert.equal(changedExperience.preferences.experience, "IMAX");
assert.equal(changedExperience.preferences.genre, "Action");
assert.equal(changedExperience.invalidates.pricing, true);

const mallJuly17 = createDiscoveryPreferences({
  cinemaId: "0002",
  cinemaName: "Mall of the Emirates",
  city: "Dubai",
  date: "2026-07-17",
});
const familyEducational = parseAndMergeDiscoveryPreferences(mallJuly17, "For family and education", { movies, now: NOW });
assert.equal(familyEducational.preferences.audience, "kids_family", "the initial family request must be retained as an audience filter");
const actionAfterFamily = parseAndMergeDiscoveryPreferences(familyEducational.preferences, "Can you suggest my, uh, action movies?", { movies, now: NOW });
assert.equal(actionAfterFamily.preferences.genre, "Action");
assert.equal(actionAfterFamily.preferences.audience, null, "a later genre-only request must replace the stale family audience filter");
assert.equal(actionAfterFamily.preferences.cinemaId, "0002", "the content-preference change must retain the selected cinema");
assert.equal(actionAfterFamily.preferences.date, "2026-07-17", "the content-preference change must retain the selected date");
const actionAfterFamilyResults = filterDiscoveryResults({ movies, sessions, cinemas, preferences: actionAfterFamily.preferences });
assert.deepEqual(actionAfterFamilyResults.movies.map((movie) => movie.id), ["race"], "the Mall of the Emirates July 17 transition must show action results instead of an empty family/action intersection");
assert.deepEqual(actionAfterFamilyResults.sessions.map((session) => session.sessionId), ["r3"]);

const familyAfterAction = parseAndMergeDiscoveryPreferences(actionAfterFamily.preferences, "Show me family movies", { movies, now: NOW });
assert.equal(familyAfterAction.preferences.audience, "kids_family");
assert.equal(familyAfterAction.preferences.genre, null, "a later family-only request must replace the stale genre filter");
const explicitFamilyAction = parseAndMergeDiscoveryPreferences(mallJuly17, "Show me family action movies", { movies, now: NOW });
assert.equal(explicitFamilyAction.preferences.genre, "Action");
assert.equal(explicitFamilyAction.preferences.audience, "kids_family", "criteria explicitly combined in one turn must remain combined");
const explicitFamilyActionResults = filterDiscoveryResults({ movies, sessions, cinemas, preferences: explicitFamilyAction.preferences });
assert.deepEqual(explicitFamilyActionResults.movies.map((movie) => movie.id), ["race"], "a verified KIDS session must satisfy an explicit family/action request");
assert.deepEqual(explicitFamilyActionResults.sessions.map((session) => session.sessionId), ["r3"]);
const emptyFamilyComedy = filterDiscoveryResults({
  movies,
  sessions,
  cinemas,
  preferences: { cinemaId: "0002", date: "2026-07-17", genre: "Comedy", audience: "kids_family" },
});
assert.equal(emptyFamilyComedy.noResultsReason, "no_results_for_criteria", "an empty criteria intersection must expose its deterministic reason");

const changedBookingContext = mergeDiscoveryPreferences(
  { cinemaId: "0002", date: "2026-07-15", preferredTime: "18:00" },
  { patch: { cinemaId: "0012", date: "2026-07-16", preferredTime: "20:00" } },
);
assert.equal(changedBookingContext.invalidates.sessionSelection, true);
assert.equal(changedBookingContext.invalidates.seatSelection, true);
assert.equal(changedBookingContext.invalidates.pricing, true, "cinema/date/time changes must invalidate seats and related pricing");

const tonight = extractDiscoveryPreferencePatch("What Arabic movies are showing tonight?", { movies, now: NOW });
assert.equal(tonight.patch.language, "Arabic");
assert.equal(tonight.patch.date, "2026-07-14");
assert.equal(tonight.patch.timeBand, "evening");

const clearedTime = parseAndMergeDiscoveryPreferences({ ...changedExperience.preferences, preferredTime: "18:00" }, "Any time is fine", { now: NOW });
assert.equal(clearedTime.preferences.preferredTime, null);
assert.equal(clearedTime.preferences.experience, "IMAX");
assert.deepEqual(clearedTime.clearedKeys, ["preferredTime"]);

const suppliedWins = mergeDiscoveryPreferences(
  { genre: "Comedy", language: "Arabic" },
  { clear: ["genre", "language"], patch: { genre: "Action" } },
);
assert.equal(suppliedWins.preferences.genre, "Action", "a value explicitly supplied in the same turn must win over a clear signal");
assert.equal(suppliedWins.preferences.language, null);

const rawShape = filterDiscoveryResults({
  movies: [{ code: "raw", title: "Raw Film", genres: ["Comedy"], languages: ["English"] }],
  sessions: [{ sessionId: "raw-session", code: "raw", cinemaCode: "0002", programmingDate: "2026-07-15", showtime: "2026-07-15T18:25:00+04:00", experience: "STANDARD" }],
  cinemas,
  preferences: { cinemaId: "0002", date: "2026-07-15", genre: "Comedy", preferredTime: "18:00" },
});
assert.deepEqual(rawShape.movies.map((movie) => movie.code), ["raw"]);
assert.equal(rawShape.time.usedNearestFallback, true);
assert.equal(rawShape.time.closestDeltaMinutes, 25);

console.log("Validated persistent discovery preferences, combined filtering, and nearest-showtime fallback.");
