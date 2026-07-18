const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const AMBIGUOUS_MOVIE_REFERENCE = /^(?:(?:i\s+)?(?:choose|chose|select|selected|want)\s+)?(?:the\s+)?(?:(?:chosen|shown|displayed|listed|suggested|available)\s+)?(?:movies?|films?|options?|choices?)(?:\s+(?:shown|displayed|listed))?$/i;

export function isAmbiguousMovieSelectionUtterance(value) {
  const normalized = clean(value).replace(/[.!?,;:]+$/g, "");
  if (!normalized) return false;
  return AMBIGUOUS_MOVIE_REFERENCE.test(normalized)
    || /^(?:these|those)\s+(?:movies?|films?|options?|choices?)$/i.test(normalized)
    || /^(?:this|that)\s+(?:movie|film|option|choice)$/i.test(normalized)
    || /^(?:this|that)\s+one$/i.test(normalized);
}

/**
 * Ground a referential movie-selection turn in the widget state that existed
 * when the transcript arrived. This update is intentionally synchronous so a
 * voice reply cannot treat an ambiguous phrase as a confirmed card tap while
 * asynchronous discovery filtering is still settling.
 */
export function buildMovieSelectionGroundingContext({ text, stage } = {}) {
  if (!isAmbiguousMovieSelectionUtterance(text)) return "";
  const selectedTitle = clean(stage?.movie?.title || stage?.order?.movieTitle || stage?.booking?.movieTitle);
  if (selectedTitle) return "";
  if (!["movies", "discovery", "loading"].includes(stage?.view)) return "";

  if (stage?.view === "loading") {
    return "Authoritative movie-selection state before this turn: movie results are still loading and no movie is selected. The guest's words do not identify a movie title. Do not say 'great choice', do not ask for a showtime, and do not claim either results or an empty result yet. Ask the guest to wait for the verified movie cards.";
  }
  if (stage?.view === "discovery") {
    const question = clean(stage?.question);
    return `Authoritative movie-selection state before this turn: no movie list is displayed and no movie is selected because more information is required${question ? ` (${question})` : ""}. The guest's words do not identify a title. Do not say 'great choice' or ask for a showtime; ask only for the missing information.`;
  }

  const visibleMovies = stage?.view === "movies" && Array.isArray(stage.movies) ? stage.movies : [];
  const visibleTitles = visibleMovies.map((movie) => clean(movie?.title)).filter(Boolean);
  if (!visibleTitles.length) {
    return "Authoritative movie-selection state before this turn: zero movie cards are visible and no movie is selected. The guest's words do not identify a movie title. Do not say 'great choice', do not ask for a showtime, do not claim options are on screen, and do not call show_showtimes. State that no movies match the retained filters and ask which single filter the guest wants to change.";
  }

  return `Authoritative movie-selection state before this turn: ${visibleTitles.length} movie card(s) are visible (${visibleTitles.join(", ")}), but no movie is selected. The guest's words do not identify one exact title. Do not say 'great choice', do not ask for a showtime, and do not call show_showtimes. Ask the guest to say or tap one exact displayed title.`;
}

export function buildAuthoritativeDiscoveryContext(result, { maxMovies = 8, maxShowtimes = 4 } = {}) {
  if (!result || typeof result !== "object") return "";
  const cinema = clean(result.cinema?.name);
  const date = clean(result.selectedDate);
  const movies = Array.isArray(result.movies) ? result.movies.slice(0, maxMovies) : [];
  const scope = [cinema, date].filter(Boolean).join(" on ");
  const missing = Array.isArray(result.missing) ? result.missing.filter(Boolean) : [];

  if (!movies.length && missing.length) {
    return `Authoritative widget state${scope ? ` for ${scope}` : ""}: no movie result is displayed yet because required information is missing (${missing.join(", ")}), and no movie is selected. Ask only for ${missing[0]}; do not say that movie options are on screen and do not advance to showtimes.`;
  }

  if (!movies.length) {
    const preferences = result.preferences || {};
    const retained = [
      preferences.genre,
      preferences.language,
      preferences.experience,
      preferences.audience === "kids_family" ? "kids/family" : null,
      preferences.preferredTime || preferences.timeBand,
      preferences.movieTitle,
    ].map(clean).filter(Boolean);
    return `Authoritative widget result${scope ? ` for ${scope}` : ""}: ZERO matching movie cards or showtimes are displayed, and no movie is selected.${retained.length ? ` Retained filters: ${retained.join(", ")}.` : ""} State that no movies match all retained preferences and ask which single preference the guest wants to change. Do not say that options, choices, or a movie list are on screen; do not congratulate a choice or ask for a showtime; do not call show_showtimes; and do not invent or name an alternative movie, showtime, cinema, or date.`;
  }

  const rows = movies.map((movie) => {
    const title = clean(movie?.title) || "Untitled movie";
    const showtimes = Array.isArray(movie?.showtimes)
      ? movie.showtimes.slice(0, maxShowtimes).map((session) => {
        const time = clean(session?.time);
        const experience = clean(session?.experience);
        return [time, experience].filter(Boolean).join(" ");
      }).filter(Boolean)
      : [];
    return `${title}: ${showtimes.length ? showtimes.join(", ") : "no displayed showtime"}`;
  });

  const omitted = Math.max(0, (Array.isArray(result.movies) ? result.movies.length : 0) - movies.length);
  return `Authoritative widget results${scope ? ` for ${scope}` : ""}: exactly ${Array.isArray(result.movies) ? result.movies.length : movies.length} movie card(s) are displayed and none is selected unless a separate confirmed-selection update says otherwise. ${rows.join(" | ")}${omitted ? ` | ${omitted} additional displayed movie(s) omitted from this short context` : ""}. Recommend or describe only these supplied movie titles and showtimes by name; never merely tell the guest to check unspecified on-screen options, and never substitute remembered or invented programming.`;
}
