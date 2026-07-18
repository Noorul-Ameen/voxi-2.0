import assert from "node:assert/strict";
import fs from "node:fs";
import { addDays, flatten, isIsoDate, parseArgs, uaeToday, validate } from "./extractVoxShowtimes.mjs";
import { retainMediaOnPartialResponse, retainPreviouslyVerifiedPosters } from "./refreshRetention.mjs";
import { validateShowtimeRefresh } from "./validateShowtimeRefresh.mjs";

assert.equal(uaeToday(new Date("2026-07-13T20:30:00Z")), "2026-07-14", "Dubai calendar date must not use host or UTC midnight");
assert.equal(addDays("2026-07-14", 1), "2026-07-15");
assert.equal(isIsoDate("2026-02-29"), false, "impossible calendar dates must be rejected");
assert.equal(isIsoDate("2028-02-29"), true);
assert.match(fs.readFileSync(new URL("./extractVoxShowtimes.mjs", import.meta.url), "utf8"), /authenticate\(\{ rediscoverKey: authAttempt === 1 \}\)/, "a repeated 401 must rediscover the rotating public browser key");
assert.deepEqual(parseArgs(["--start-date", "2026-07-14", "--max-days", "45", "--workers", "2", "--output", "fresh.json"]), {
  startDate: "2026-07-14",
  output: "fresh.json",
  maxDays: 45,
  workers: 2,
});

const session = (sessionId) => ({ sessionId, showtime: "2026-07-14T12:00:00+00:00", status: "", filter: "Afternoon", isAvailableForOffer: true });
const flattened = flatten([{
  code: "HO-TEST",
  programmingDate: "2026-07-14",
  payload: {
    cinemas: [{
      cinemaCode: "0001",
      cinemaName: "Test Cinema",
      sessionGroups: [{ experience: "IMAX", code: "IMAX", sessions: [session("100"), session("100"), session("101")] }],
    }],
  },
}]);
assert.equal(flattened.rawSessionCount, 3);
assert.equal(flattened.duplicates, 1);
assert.equal(flattened.sessions.length, 2, "a simultaneous screening with a different source session ID must be preserved");

validate({
  programmingDates: ["2026-07-14"],
  catalog: [{ code: "HO-TEST", title: "Test Film", posterUrl: "https://uae.voxcinemas.com/images/test.png" }],
  cinemas: flattened.cinemas,
  sessions: flattened.sessions,
  experienceMedia: [],
  offerMedia: [],
  crawl: { startDate: "2026-07-14", complete: true, rawSessionCount: 3, duplicateCount: 1 },
});

validate({
  programmingDates: ["2026-07-14"],
  catalog: [{ code: "HO-NO-POSTER", title: "Upstream Poster Pending", posterUrl: "", posterStatus: "missing_at_source" }],
  cinemas: flattened.cinemas,
  sessions: flattened.sessions.map((item) => ({ ...item, code: "HO-NO-POSTER" })),
  experienceMedia: [],
  offerMedia: [],
  crawl: { startDate: "2026-07-14", complete: true, rawSessionCount: 3, duplicateCount: 1, missingOfficialPosterCodes: ["HO-NO-POSTER"] },
});

const currentExtraction = JSON.parse(fs.readFileSync(new URL("../data/vox_showtimes_full.json", import.meta.url), "utf8"));
const allPosterLoss = structuredClone(currentExtraction);
allPosterLoss.catalog = allPosterLoss.catalog.map((movie) => ({ ...movie, posterUrl: "", posterStatus: "missing_at_source" }));
allPosterLoss.crawl.missingOfficialPosterCodes = allPosterLoss.catalog.map((movie) => movie.code).sort();
allPosterLoss.crawl.sourceMissingOfficialPosterCodes = [...allPosterLoss.crawl.missingOfficialPosterCodes];
allPosterLoss.crawl.retainedMoviePosterCodes = [];
allPosterLoss.crawl.retainedMoviePosterCount = 0;
assert.throws(
  () => validateShowtimeRefresh(allPosterLoss, { previous: currentExtraction, now: new Date(currentExtraction.extractedAt) }),
  /lost a previously verified official poster/,
  "a partial upstream response must not erase previously verified movie posters",
);

const retainedPosterFixture = retainPreviouslyVerifiedPosters(
  [{ code: "KNOWN", posterUrl: "https://uae.voxcinemas.com/images/known.png", images: { medium: "https://uae.voxcinemas.com/images/known.png" } }],
  [
    { code: "KNOWN", posterUrl: "", images: {} },
    { code: "NEW", posterUrl: "", images: {} },
  ],
);
assert.deepEqual(retainedPosterFixture.retainedCodes, ["KNOWN"]);
assert.equal(retainedPosterFixture.catalog[0].posterStatus, "retained_official");
assert.equal(retainedPosterFixture.catalog[0].posterUrl, "https://uae.voxcinemas.com/images/known.png");
assert.equal(retainedPosterFixture.catalog[1].posterUrl, "", "a genuinely new upstream poster gap remains explicit");

const legitimateOfferRemoval = retainMediaOnPartialResponse(
  [{ code: "A" }, { code: "B" }, { code: "C" }],
  [{ code: "A" }, { code: "B" }],
);
assert.equal(legitimateOfferRemoval.partialResponse, false, "a normal campaign removal must not retain expired offer media");
assert.deepEqual(legitimateOfferRemoval.items.map((item) => item.code), ["A", "B"]);
const partialExperienceResponse = retainMediaOnPartialResponse(
  [{ code: "A" }, { code: "B" }, { code: "C" }],
  [{ code: "A" }],
);
assert.equal(partialExperienceResponse.partialResponse, true);
assert.equal(partialExperienceResponse.retainedCount, 2, "a clearly partial media response keeps last-known official assets");

console.log("Validated UAE date calculation, strict date parsing, source-session deduplication, and explicit missing-poster metadata.");
