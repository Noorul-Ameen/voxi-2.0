export const mediaKey = (item) => String(item?.code || item?.slug || item?.name || "").trim().toLowerCase();

function mergeOfficialMedia(previousItems = [], nextItems = []) {
  const merged = new Map();
  for (const item of previousItems) {
    const key = mediaKey(item);
    if (key) merged.set(key, item);
  }
  for (const item of nextItems) {
    const key = mediaKey(item);
    if (key) merged.set(key, item);
  }
  return [...merged.values()];
}

export function retainMediaOnPartialResponse(previousItems = [], nextItems = [], { minimumRatio = 0.6 } = {}) {
  const previous = previousItems.filter((item) => mediaKey(item));
  const fresh = nextItems.filter((item) => mediaKey(item));
  const minimumExpected = previous.length ? Math.ceil(previous.length * minimumRatio) : 0;
  const partialResponse = previous.length > 0 && fresh.length < minimumExpected;
  const items = partialResponse ? mergeOfficialMedia(previous, fresh) : fresh;
  const freshKeys = new Set(fresh.map(mediaKey));
  const retainedCount = partialResponse
    ? items.filter((item) => !freshKeys.has(mediaKey(item))).length
    : 0;
  return {
    items,
    freshCount: fresh.length,
    retainedCount,
    partialResponse,
  };
}

export function retainPreviouslyVerifiedPosters(previousCatalog = [], nextCatalog = []) {
  const previousByCode = new Map(previousCatalog.map((movie) => [movie.code, movie]));
  const retainedCodes = [];
  const catalog = nextCatalog.map((movie) => {
    if (movie.posterUrl) return movie;
    const previous = previousByCode.get(movie.code);
    if (!/^https:\/\//.test(previous?.posterUrl || "")) return movie;
    retainedCodes.push(movie.code);
    const imageKeys = new Set([
      ...Object.keys(previous.images || {}),
      ...Object.keys(movie.images || {}),
    ]);
    const images = Object.fromEntries([...imageKeys].map((key) => [
      key,
      movie.images?.[key] || previous.images?.[key] || "",
    ]));
    return {
      ...movie,
      images,
      posterUrl: previous.posterUrl,
      posterStatus: "retained_official",
    };
  });
  return { catalog, retainedCodes: retainedCodes.sort() };
}
