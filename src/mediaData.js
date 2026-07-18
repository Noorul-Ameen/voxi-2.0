import { EXPERIENCE_MEDIA as GENERATED_EXPERIENCE_MEDIA, FILMS, OFFER_MEDIA as GENERATED_OFFER_MEDIA } from "./generated/voxSnapshotManifest.js";

const normalizeExperienceKey = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/&/g, " AND ")
  .replace(/[^A-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const normalizeMovieKey = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/\p{Mark}/gu, "")
  .toLocaleLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
  .trim();

const EXPERIENCE_ALIASES = Object.freeze({
  THEATRE_BY_RHODES: "THEATRE",
  THEATRE_AT_VOX: "THEATRE",
  GOLD_BY_RHODES: "GOLD",
  GOLD_CLASS: "GOLD",
  VOX_KIDS: "KIDS",
  KIDS_CINEMA: "KIDS",
  MAX_AT_VOX: "MAX",
  STANDARD_2D: "STANDARD",
  STANDARD_3D: "STANDARD",
});

function normalizeRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return {};
  return Object.fromEntries(
    Object.entries(registry)
      .map(([key, media]) => [EXPERIENCE_ALIASES[normalizeExperienceKey(key)] || normalizeExperienceKey(key), media])
      .filter(([key, media]) => key && media),
  );
}

// Keeping media in the compact manifest avoids duplicating artwork on every
// showtime shard and keeps the full session snapshot out of the entry bundle.
const generatedExperienceMedia = GENERATED_EXPERIENCE_MEDIA || {};
const generatedOfferMedia = GENERATED_OFFER_MEDIA || [];
const generatedFilms = Array.isArray(FILMS) ? FILMS : [];

export const EXPERIENCE_MEDIA = Object.freeze(normalizeRegistry(generatedExperienceMedia));
export const OFFER_MEDIA = Object.freeze(
  (Array.isArray(generatedOfferMedia) ? generatedOfferMedia : Object.values(generatedOfferMedia || {}))
    .filter((media) => media && typeof media === "object"),
);

export function getMediaUrl(media) {
  if (typeof media === "string") return media.trim();
  if (!media || typeof media !== "object") return "";
  return [
    media.thumbnailUrl,
    media.logoUrl,
    media.imageUrl,
    media.image?.urlWebSmall,
    media.image?.urlMobileSmall,
    media.image?.urlWeb,
    media.image?.urlMobile,
    media.thumbnail,
    media.mediumMobile,
    media.largeMobile,
    media.medium,
    media.large,
    media.url,
    media.src,
    media.posterUrl,
    media.mobileUrl,
    media.promoUrl,
    media.heroUrl,
    media.backdropUrl,
  ].find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

export function getSupportedImageUrl(media) {
  const url = getMediaUrl(media);
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return "";
  if (/^(?:https?:)?\/\//i.test(url) || /^(?:blob:|data:image\/(?:avif|gif|jpeg|jpg|png|svg\+xml|webp)[;,])/i.test(url)) return url;
  if (/^(?:\.{0,2}\/|[^:\\]+$)/.test(url)) return url;
  return "";
}

export const FALLBACK_EXPERIENCE_MEDIA = EXPERIENCE_MEDIA.STANDARD
  || Object.values(EXPERIENCE_MEDIA).find((media) => getSupportedImageUrl(media))
  || null;

export function getMoviePosterUrl(movieOrBooking) {
  const direct = [movieOrBooking?.posterUrl, movieOrBooking?.media, movieOrBooking?.images]
    .map(getSupportedImageUrl)
    .find(Boolean);
  if (direct) return direct;

  const requestedId = String(
    movieOrBooking?.movieId
      || movieOrBooking?.id
      || movieOrBooking?.ScheduledFilmId
      || "",
  ).trim().toUpperCase();
  const requestedTitle = normalizeMovieKey(
    movieOrBooking?.movieTitle
      || movieOrBooking?.title
      || movieOrBooking?.Title,
  );
  const match = (requestedId && generatedFilms.find((film) => String(film.ScheduledFilmId || film.movieId || "").trim().toUpperCase() === requestedId && getSupportedImageUrl(film)))
    || (requestedTitle && generatedFilms.find((film) => normalizeMovieKey(film.Title || film.title) === requestedTitle && getSupportedImageUrl(film)));
  return getSupportedImageUrl(match);
}

export function getExperienceMedia(experience, sessionMedia) {
  if (sessionMedia && getSupportedImageUrl(sessionMedia)) return sessionMedia;
  const normalized = normalizeExperienceKey(experience);
  const key = EXPERIENCE_ALIASES[normalized] || normalized;
  const matched = EXPERIENCE_MEDIA[key];
  return matched && getSupportedImageUrl(matched) ? matched : FALLBACK_EXPERIENCE_MEDIA;
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

function mediaMatchKeys(media) {
  return collectStrings([media.code, media.slug, media.name, media.bank, media.title])
    .map(normalizeExperienceKey)
    .filter((key) => key.length >= 3);
}

export function getOfferMedia(offer) {
  if (offer?.media) return offer.media;
  if (!offer || !OFFER_MEDIA.length) return null;

  const explicitCode = normalizeExperienceKey(offer.mediaCode);
  if (explicitCode) {
    const exact = OFFER_MEDIA.find((media) => normalizeExperienceKey(media.code) === explicitCode);
    if (exact) return exact;
  }

  const offerKeys = collectStrings([offer.id, offer.slug, offer.bank, offer.aliases])
    .map(normalizeExperienceKey)
    .filter((key) => key.length >= 3);

  let best = null;
  let bestScore = 0;
  for (const media of OFFER_MEDIA) {
    for (const mediaKey of mediaMatchKeys(media)) {
      for (const offerKey of offerKeys) {
        const exact = mediaKey === offerKey;
        const contains = mediaKey.includes(offerKey) || offerKey.includes(mediaKey);
        if (!exact && !contains) continue;
        const score = (exact ? 10_000 : 0) + Math.min(mediaKey.length, offerKey.length);
        if (score > bestScore) {
          best = media;
          bestScore = score;
        }
      }
    }
  }
  return best;
}
