import assert from "node:assert/strict";
import { CINEMAS, DATA_DATES, DATA_STATS, EXPERIENCE_MEDIA, FILMS, OFFER_MEDIA, SESSIONS } from "../src/mockVistaData.js";
import { resolveFilmCandidate } from "../src/lib/fuzzyResolvers.js";
import { remapDemoDate, uaeCalendarDate } from "../src/lib/demoDates.js";

assert.ok(DATA_DATES.length > 0, "at least one programming date is required");
assert.deepEqual(DATA_DATES, [...new Set(DATA_DATES)].sort(), "programming dates must be sorted and unique");
assert.deepEqual(DATA_STATS.sourceDates, DATA_DATES, "stats and exported dates must agree");
assert.equal(SESSIONS.length, DATA_STATS.sessionCount, "session count must match stats");
assert.equal(DATA_STATS.rawSessionCount, DATA_STATS.sessionCount + DATA_STATS.duplicateCount, "raw sessions must reconcile with source duplicates");
assert.equal(CINEMAS.length, DATA_STATS.cinemaCount, "cinema count must match stats");
assert.equal(new Set(FILMS.map((film) => film.ScheduledFilmId)).size, DATA_STATS.filmCount, "film count must match stats");
assert.deepEqual([...new Set(SESSIONS.map((session) => session.SourceProgrammingDate))].sort(), DATA_DATES, "every exported date must contain sessions");
assert.deepEqual([...new Set(SESSIONS.map((session) => session.SessionAttributesNames[0]))].sort(), DATA_STATS.experiences, "experience list must match sessions");
assert.ok(FILMS.every((film) => film.Title && film.Rating && film.Genres?.length), "all scheduled movie metadata must include title, rating, and genres");
assert.ok(FILMS.every((film) => film.LanguageName), "all movie language names must be explicit");
assert.ok(FILMS.every((film) => Array.isArray(film.Subtitles)), "subtitle metadata must retain its source shape");
const missingPosterFilmIds = [...new Set(FILMS.filter((film) => !film.posterUrl).map((film) => film.ScheduledFilmId))].sort();
assert.deepEqual(missingPosterFilmIds, [...(DATA_STATS.crawl?.missingOfficialPosterCodes || [])].sort(), "movies without an upstream poster must be recorded exactly");
assert.ok(FILMS.filter((film) => film.posterUrl).every((film) => /^https:\/\//.test(film.posterUrl)), "every supplied movie poster must use an official HTTPS URL");
assert.ok(FILMS.filter((film) => !film.posterUrl).every((film) => film.PosterStatus === "missing_at_source"), "an absent upstream poster must use the explicit placeholder state");

const keys = SESSIONS.map((session) => [
  session.ScheduledFilmId,
  session.CinemaId,
  session.SessionId,
  session.Showtime,
].join("|"));
assert.equal(new Set(keys).size, SESSIONS.length, "source sessions must be deduplicated without collapsing simultaneous screenings");
assert.equal(Object.values(DATA_STATS.sessionsByDate).reduce((sum, count) => sum + count, 0), SESSIONS.length, "all sessions must be reachable through exported programming dates");
for (const date of DATA_DATES) {
  assert.equal(SESSIONS.filter((session) => session.SourceProgrammingDate === date).length, DATA_STATS.sessionsByDate[date], `${date} count must match stats`);
}

assert.equal(Object.keys(EXPERIENCE_MEDIA).length, DATA_STATS.experienceMediaCount, "generated experience media count must match stats");
assert.equal(OFFER_MEDIA.length, DATA_STATS.offerMediaCount, "generated offer media count must match stats");
assert.ok(Object.values(EXPERIENCE_MEDIA).every((media) => [media.logoUrl, media.imageUrl, media.backdropUrl].filter(Boolean).every((url) => /^https:\/\//.test(url))), "experience artwork must use HTTPS");
assert.ok(OFFER_MEDIA.every((media) => [media.imageUrl, media.heroUrl, media.promoUrl, media.mobileUrl].filter(Boolean).every((url) => /^https:\/\//.test(url))), "offer artwork must use HTTPS");

const sampleFilms = [{ id: "HO-MINIONS", title: "Minions & Monsters" }, { id: "HO-OTHER", title: "The Accountant" }];
assert.equal(resolveFilmCandidate(sampleFilms, "the minions one")?.id, "HO-MINIONS", "filler words must not break title resolution");
assert.equal(resolveFilmCandidate(sampleFilms, "HO-MINIONS")?.title, "Minions & Monsters", "exact film IDs remain authoritative");
assert.equal(uaeCalendarDate(new Date("2026-07-11T21:30:00.000Z")), "2026-07-12", "Dubai date must not use UTC midnight");
assert.equal(remapDemoDate(DATA_DATES[0], DATA_DATES[0], DATA_DATES), DATA_DATES[0], "covered dates remain exact");
assert.equal(remapDemoDate("2099-01-01", "2099-01-01", DATA_DATES), null, "expired dates must not cycle into a stale extraction window");
assert.equal(remapDemoDate("not-a-date", DATA_DATES[0], DATA_DATES), null, "invalid dates must not resolve to programming");

console.log(`Validated ${CINEMAS.length} cinemas, ${DATA_STATS.filmCount} films, ${SESSIONS.length} sessions, ${DATA_DATES.length} dates, and official movie/experience/offer media.`);
