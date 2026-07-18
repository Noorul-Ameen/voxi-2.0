const STOP_WORDS = new Set(["a", "an", "the", "film", "movie", "one", "please", "show", "watch"]);

export const normalizeResolverText = (value) => String(value ?? "").toLowerCase().trim();
export const firstWord = (value) => normalizeResolverText(value).split(/[:\s]/).filter(Boolean)[0] || "";

function contentTokens(value) {
  return normalizeResolverText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

export function resolveFilmCandidate(films, idOrTitle) {
  const list = Array.isArray(films) ? films : [];
  const key = normalizeResolverText(idOrTitle);
  if (!key) return null;

  const exact = list.find((movie) => normalizeResolverText(movie.id) === key)
    || list.find((movie) => normalizeResolverText(movie.title) === key)
    || list.find((movie) => normalizeResolverText(movie.title).includes(key) || key.includes(normalizeResolverText(movie.title)));
  if (exact) return exact;

  const queryTokens = contentTokens(idOrTitle);
  if (queryTokens.length) {
    const ranked = list
      .map((movie) => {
        const titleTokens = new Set(contentTokens(movie.title));
        const matches = queryTokens.filter((token) => titleTokens.has(token)).length;
        return { movie, score: matches / queryTokens.length, matches };
      })
      .filter((item) => item.matches > 0 && item.score >= 0.5)
      .sort((a, b) => b.score - a.score || normalizeResolverText(a.movie.title).length - normalizeResolverText(b.movie.title).length);
    if (ranked[0]) return ranked[0].movie;
  }

  return list.find((movie) => firstWord(movie.title) === firstWord(idOrTitle)) || null;
}

