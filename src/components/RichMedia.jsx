import React from "react";
import { AlertTriangle, Film, Clock, Armchair, Ticket, ChevronRight, Check, RefreshCw, RotateCcw, MapPin, Search } from "lucide-react";
import { C } from "../theme.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { getExperienceMedia, getMoviePosterUrl, getSupportedImageUrl } from "../mediaData.js";
import { isCurrentBooking } from "../lib/cancellationRouting.js";
import BookingQRCode from "./BookingQRCode.jsx";

export function Poster({ tint, title, small, posterUrl }) {
  const { t } = useI18n();
  const imageUrl = getSupportedImageUrl(posterUrl);
  const [imgOk, setImgOk] = React.useState(!!imageUrl);
  const palette = tint && tint.length === 2 ? tint : [C.primaryHover, C.brand];
  React.useEffect(() => setImgOk(!!imageUrl), [imageUrl]);
  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 12,
      width: small ? 56 : "100%", height: small ? 80 : undefined,
      maxWidth: small ? 56 : 104, maxHeight: small ? 80 : 156,
      aspectRatio: small ? undefined : "2/3",
      background: `linear-gradient(150deg, ${palette[0]}, ${palette[1]})`,
      display: "flex", flexShrink: 0, alignItems: "flex-end", boxSizing: "border-box",
    }}>
      {imgOk && imageUrl && (
        <img src={imageUrl} alt={title ? `${title}: ${t("movies.poster")}` : t("movies.poster")} loading="lazy" decoding="async" onLoad={(event) => { if (!event.currentTarget.naturalWidth || !event.currentTarget.naturalHeight) setImgOk(false); }} onError={() => setImgOk(false)}
          style={{ position: "absolute", inset: 0, display: "block", width: "100%", maxWidth: "100%", height: "100%", maxHeight: "100%", objectFit: "contain" }} />
      )}
      {!imgOk && <div style={{ position: "absolute", inset: 0, opacity: 0.35, backgroundImage: "radial-gradient(circle at 30% 15%, rgba(255,255,255,.6), transparent 50%)" }} />}
      {!imgOk && <Film style={{ position: "absolute", right: 8, top: 8, opacity: 0.45 }} size={small ? 12 : 18} color="#fff" />}
      {!small && title && (
        <div style={{ position: "relative", width: "100%", padding: "8px 8px 9px", background: "linear-gradient(transparent, rgba(0,0,0,.72))" }}>
          <div dir="auto" style={{ display: "-webkit-box", overflow: "hidden", fontSize: 11, fontWeight: 800, color: "#fff", lineHeight: 1.15, letterSpacing: 0.1, textShadow: "0 1px 3px rgba(0,0,0,.6)", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>{title}</div>
        </div>
      )}
    </div>
  );
}

function ExperienceThumbnail({ experience, media }) {
  const imageUrl = getSupportedImageUrl(getExperienceMedia(experience, media));
  const [imgOk, setImgOk] = React.useState(!!imageUrl);

  React.useEffect(() => setImgOk(!!imageUrl), [imageUrl]);

  return (
    <span aria-hidden="true" style={{ display: "grid", width: 24, height: 24, flexShrink: 0, overflow: "hidden", placeItems: "center", borderRadius: 6, background: C.primarySoft, color: C.primary }}>
      {imgOk && imageUrl
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setImgOk(false)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <Film size={12} />}
    </span>
  );
}

function Header({ icon, title, sub, onBack }) {
  const { dir, t } = useI18n();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      {onBack && (
        <button aria-label={t("common.back")} onClick={onBack} style={btnGhost}>
          <ChevronRight size={18} style={{ transform: dir === "rtl" ? "none" : "rotate(180deg)" }} />
        </button>
      )}
      <div style={{ display: "flex", height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, background: C.primarySoft, color: C.primary }}>{icon}</div>
      <div>
        <div dir="auto" style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
      </div>
    </div>
  );
}

function InlineState({ title, onRetry, error = false }) {
  const { t } = useI18n();
  const Icon = error ? AlertTriangle : Film;
  return (
    <div role={error ? "alert" : "status"} style={{ display: "flex", minHeight: 150, flexDirection: "column", alignItems: "center", justifyContent: "center", border: `1px dashed ${error ? C.warning : C.border}`, borderRadius: 13, background: error ? C.warningSoft : C.surfaceAlt, padding: 20, color: C.muted, textAlign: "center" }}>
      <Icon size={25} color={error ? C.warning : C.primary} aria-hidden="true" />
      <div style={{ marginTop: 9, fontSize: 12, lineHeight: 1.45 }}>{title}</div>
      {onRetry && <button type="button" onClick={onRetry} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 11, border: 0, borderRadius: 8, background: C.primary, padding: "8px 11px", color: C.onPrimary, cursor: "pointer", fontSize: 11 }}><RefreshCw size={13} aria-hidden="true" />{t("common.retry")}</button>}
    </div>
  );
}

export function CinemaPicker({ cinemas = [], selected, onSelect, onBack, error, onRetry, notice }) {
  const { t, dir } = useI18n();
  const [query, setQuery] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);
  const key = query.trim().toLowerCase();
  const matching = cinemas.filter((cinema) => !key || cinema.name.toLowerCase().includes(key));
  const visible = key || showAll ? matching : matching.slice(0, 6);
  return (
    <div>
      <Header icon={<MapPin size={16} />} title={t("cinema.title")} sub={t("cinema.count", { count: cinemas.length })} onBack={onBack} />
      {notice && <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, borderRadius: 10, background: C.primarySoft, padding: "9px 11px", color: C.primary, fontSize: 11, lineHeight: 1.45 }}><span>{notice}</span>{onRetry && !error && <button type="button" onClick={onRetry} style={{ display: "inline-flex", flexShrink: 0, alignItems: "center", gap: 5, border: `1px solid ${C.primary}`, borderRadius: 7, background: C.surface, padding: "6px 8px", color: C.primary, cursor: "pointer", fontSize: 10 }}><RefreshCw size={12} aria-hidden="true" />{t("common.retry")}</button>}</div>}
      <label style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, padding: "9px 12px", marginBottom: 12 }}>
        <Search size={15} color={C.muted} />
        <input dir="auto" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("cinema.search")} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: C.text, fontSize: 13, textAlign: "start" }} />
      </label>
      {error ? <InlineState title={t("cinema.error")} onRetry={onRetry} error /> : <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {visible.map((cinema) => (
          <button key={cinema.id} onClick={() => onSelect(cinema)} style={{ ...rowBtn, padding: "11px 13px", borderColor: selected?.id === cinema.id ? C.primary : C.border, background: selected?.id === cinema.id ? C.primarySoft : C.surface }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <MapPin size={15} color={C.primary} />
              <span dir="auto" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: C.text }}>{cinema.name.replace(/^VOX\s*[\u2014-]\s*/, "")}</span>
            </span>
            {selected?.id === cinema.id ? <Check size={15} color={C.green} /> : <ChevronRight size={16} color={C.muted} style={{ transform: dir === "rtl" ? "rotate(180deg)" : "none" }} />}
          </button>
        ))}
        {!visible.length && <div style={{ padding: 18, textAlign: "center", fontSize: 12, color: C.muted }}>{t("cinema.none")}</div>}
        {!key && matching.length > 6 && <button type="button" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll} style={{ ...rowBtn, justifyContent: "center", minHeight: 42, borderStyle: "dashed", color: C.primary, fontSize: 11, fontWeight: 700 }}>
          {showAll ? t("cinema.showLess") : t("cinema.showAll", { count: matching.length })}
        </button>}
      </div>}
    </div>
  );
}

export function MovieGrid({ movies = [], cinemaName, scheduleDate, onSelect, error, onRetry, notice }) {
  const { t, dir } = useI18n();
  const [showAll, setShowAll] = React.useState(false);
  const movieKey = movies.map((movie) => movie.id).join("|");
  React.useEffect(() => setShowAll(false), [movieKey, cinemaName, scheduleDate]);
  const visibleMovies = showAll ? movies : movies.slice(0, 4);
  return (
    <div>
      <Header icon={<Film size={16} />} title={t("movies.title")} sub={<span><bdi dir="auto">{cinemaName}</bdi> · <span dir="ltr">{scheduleDate}</span></span>} />
      {notice && <div role="status" style={{ marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 10, background: C.primarySoft, padding: "9px 11px", color: C.primary, fontSize: 10, lineHeight: 1.45 }}>{notice}</div>}
      {error ? <InlineState title={typeof error === "string" ? error : t("movies.error")} onRetry={onRetry} error /> : !movies.length ? <InlineState title={t("movies.empty")} onRetry={onRetry} /> : <div style={{ display: "flex", maxWidth: "100%", flexDirection: "column", gap: 9 }}>
        {visibleMovies.map((m) => (
          <button key={m.id} onClick={() => onSelect(m)} style={{ ...btnReset, display: "flex", width: "100%", minWidth: 0, gap: 11, border: `1px solid ${C.border}`, borderRadius: 13, background: C.surface, padding: 9, textAlign: "start" }}>
            <Poster small tint={m.tint} title={m.title} posterUrl={m.posterUrl} />
            <span style={{ display: "block", minWidth: 0, flex: 1 }}>
              <span dir="auto" style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{m.title}</span>
              <span style={{ display: "block", marginTop: 3, fontSize: 10, color: C.muted }}>
                <span style={{ background: C.primarySoft, color: C.primary, borderRadius: 3, padding: "1px 4px", marginInlineEnd: 5 }}>{m.rating}</span>
                {[
                  ...(m.genres || [m.genre]).filter(Boolean).slice(0, 2),
                  m.runtime ? t("showtimes.minutes", { count: m.runtime }) : "",
                  m.language || "",
                ].filter(Boolean).join(" · ")}
              </span>
              {!!m.relevantSessions?.length && <span aria-label={`Relevant showtimes for ${m.title}`} style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {m.relevantSessions.slice(0, 2).map((session) => <span key={session.sessionId} dir="ltr" style={{ borderRadius: 999, background: "rgba(87,199,154,.11)", padding: "2px 6px", color: C.green, fontSize: 9, whiteSpace: "nowrap" }}>{session.time} · {session.exp}</span>)}
              </span>}
              <span dir="auto" style={{ display: "-webkit-box", marginTop: 5, overflow: "hidden", color: C.muted, fontSize: 10, lineHeight: 1.35, WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>{m.synopsis}</span>
            </span>
            <ChevronRight size={16} color={C.muted} style={{ alignSelf: "center", flexShrink: 0, transform: dir === "rtl" ? "rotate(180deg)" : "none" }} />
          </button>
        ))}
        {movies.length > 4 && <button type="button" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll} style={{ ...rowBtn, justifyContent: "center", minHeight: 42, borderStyle: "dashed", color: C.primary, fontSize: 11, fontWeight: 700 }}>
          {showAll ? t("movies.showLess") : t("movies.showAll", { count: movies.length })}
        </button>}
      </div>}
    </div>
  );
}

export function Showtimes({ movie, sessions = [], onSelect, onBack, error, onRetry, notice }) {
  const { t, dir } = useI18n();
  const expColor = (e) => (["IMAX", "MAX"].includes(e) ? C.primaryHover : e === "GOLD" ? C.warning : e === "KIDS" ? C.green : C.primary);
  return (
    <div>
      <Header icon={<Clock size={16} />} title={movie.title} sub={`${movie.rating} · ${movie.runtime ? t("showtimes.minutes", { count: movie.runtime }) : "Not listed"} · ${t("showtimes.select")}`} onBack={onBack} />
      {notice && <div role="status" style={{ marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 10, background: C.primarySoft, padding: "9px 11px", color: C.primary, fontSize: 10, lineHeight: 1.45 }}>{notice}</div>}
      <div style={{ marginBottom: 14, borderRadius: 12, border: `1px solid ${C.border}`, background: C.surfaceAlt, padding: "11px 12px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 7 }}>
          {(movie.genres || [movie.genre]).filter(Boolean).map((genre) => <span key={genre} style={{ borderRadius: 999, background: C.primarySoft, color: C.primary, padding: "2px 7px", fontSize: 10 }}>{genre}</span>)}
          {movie.language && <span style={{ borderRadius: 999, background: C.surface, color: C.muted, padding: "2px 7px", fontSize: 10 }}>{movie.language}</span>}
        </div>
        <p dir="auto" style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: C.muted }}>{movie.synopsis}</p>
      </div>
      <div style={{ display: "flex", width: "100%", maxWidth: "100%", minWidth: 0, gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 72, maxWidth: "22%", flexShrink: 0 }}><Poster tint={movie.tint} title={movie.title} posterUrl={movie.posterUrl} /></div>
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {error ? <InlineState title={typeof error === "string" ? error : t("showtimes.error")} onRetry={onRetry} error /> : !sessions.length ? <InlineState title={t("showtimes.empty")} onRetry={onRetry} /> : sessions.map((s) => (
            <button key={s.sessionId} onClick={() => onSelect(s)} style={{ ...rowBtn, minWidth: 0, gap: 8 }}>
              <div style={{ display: "flex", minWidth: 0, flex: 1, alignItems: "center", gap: 8, overflow: "hidden" }}>
                <div dir="ltr" style={{ flexShrink: 0, fontSize: 24, fontWeight: 700, color: C.text }}>{s.time}</div>
                <ExperienceThumbnail experience={s.exp} media={s.experienceMedia || s.media} />
                <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                  <div dir="ltr" title={s.exp} style={{ overflow: "hidden", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: expColor(s.exp), textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.exp}</div>
                  <div dir="ltr" title={s.screen} style={{ overflow: "hidden", fontSize: 11, color: C.muted, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.screen}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{s.availabilityVerified === true ? t("showtimes.seats", { count: s.seatsAvailable }) : t("showtimes.previewAvailability")}</span>
                <ChevronRight size={18} color={C.muted} style={{ transform: dir === "rtl" ? "rotate(180deg)" : "none" }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SeatMap({ movie, session, plan = [], selected = [], requestedTarget = null, pricing, quoteState, onToggle, onConfirm, onBack, error, onRetry, notice }) {
  const { t, formatCurrency } = useI18n();
  const standardPrice = Number(pricing?.tiers?.standard);
  const premiumPrice = Number(pricing?.tiers?.premium);
  const hasDemoEstimate = pricing?.demo === true && Number.isFinite(standardPrice) && Number.isFinite(premiumPrice);
  const currency = pricing?.currency || "AED";
  const price = (premium) => (premium ? premiumPrice : standardPrice);
  const estimatedTotal = hasDemoEstimate ? selected.reduce((sum, id) => {
    const seat = plan.flatMap((r) => r.seats).find((s) => s.id === id);
    return sum + (seat ? price(seat.premium) : 0);
  }, 0) : null;
  const selectedKey = [...selected].sort().join(",");
  const exactQuote = quoteState?.seatKey === selectedKey && !quoteState.loading && quoteState.quote;
  const quotedTotal = Number(exactQuote?.total);
  const quotedSubtotal = exactQuote?.subtotal != null ? Number(exactQuote.subtotal) : Number.NaN;
  const quotedFeeTotal = exactQuote?.feeTotal != null ? Number(exactQuote.feeTotal) : Number.NaN;
  const total = Number.isFinite(quotedTotal) ? quotedTotal : estimatedTotal;
  const totalCurrency = exactQuote?.currency || currency;
  const target = Number.isFinite(Number(requestedTarget)) ? Number(requestedTarget) : null;
  const standardLabel = hasDemoEstimate
    ? t("seats.standardEstimate", { price: formatCurrency(standardPrice, currency) })
    : t("seats.standardQuoteRequired");
  const premiumLabel = hasDemoEstimate
    ? t("seats.premiumEstimate", { price: formatCurrency(premiumPrice, currency) })
    : t("seats.premiumQuoteRequired");
  if (error || !plan.length) {
    return (
      <div>
        <Header icon={<Armchair size={16} />} title={<span><bdi dir="auto">{movie.title}</bdi> · <span dir="ltr">{session.time}</span></span>} sub={t("seats.tap")} onBack={onBack} />
        <InlineState title={t(error ? "seats.error" : "seats.empty")} onRetry={onRetry} error={Boolean(error)} />
      </div>
    );
  }
  return (
    <div>
      <Header icon={<Armchair size={16} />} title={<span><bdi dir="auto">{movie.title}</bdi> · <span dir="ltr">{session.time}</span></span>} sub={<span><span dir="ltr">{session.exp} · {session.screen}</span> · {t("seats.tap")}</span>} onBack={onBack} />
      {notice && <div role="note" style={{ marginBottom: 16, border: `1px solid ${C.warning}`, borderRadius: 10, background: C.warningSoft, padding: "9px 11px", color: C.warning, fontSize: 10, lineHeight: 1.45 }}>{notice === true ? t("seats.demoNotice") : notice}</div>}
      {!notice && pricing?.demo === true && <div role="note" style={{ marginBottom: 16, border: `1px solid ${C.warning}`, borderRadius: 10, background: C.warningSoft, padding: "9px 11px", color: C.warning, fontSize: 10, lineHeight: 1.45 }}>{t("seats.demoPricingNotice")}</div>}
      {pricing?.mode === "quote_required" && <div role="note" style={{ marginBottom: 16, border: `1px solid ${C.border}`, borderRadius: 10, background: C.surfaceAlt, padding: "9px 11px", color: C.text, fontSize: 10, lineHeight: 1.45 }}>{t("seats.quoteRequiredNotice")}</div>}
      {target && <div role="status" style={{ marginBottom: 12, borderRadius: 10, background: selected.length === target ? C.successSoft : C.primarySoft, padding: "8px 10px", color: selected.length === target ? C.green : C.primary, fontSize: 10, fontWeight: 700 }}>{t(selected.length === target ? "seats.targetReached" : "seats.targetProgress", { target, count: selected.length })}</div>}
      <div dir="ltr" style={{ maxWidth: 420, margin: "0 auto 24px" }}>
        <div style={{ height: 6, borderRadius: 999, background: `linear-gradient(90deg, transparent, ${C.brand}, transparent)`, boxShadow: "0 0 24px 4px rgba(0,157,219,.24)" }} />
        <div style={{ marginTop: 4, textAlign: "center", fontSize: 10, letterSpacing: 6, textTransform: "uppercase", color: C.muted }}>{t("seats.screen")}</div>
      </div>
      <div dir="ltr" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {plan.map((r) => (
          <div key={r.row} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "clamp(2px, .8vw, 4px)" }}>
            <span style={{ width: 14, textAlign: "center", fontSize: 10, fontWeight: 700, color: C.muted }}>{r.row}</span>
            {r.seats.map((s, i) => {
              const isSel = selected.includes(s.id);
              const sold = s.status !== 0;
              return (
                <React.Fragment key={s.id}>
                  {i === 6 && <span style={{ width: 12 }} />}
                  <button disabled={sold} onClick={() => onToggle(s)} aria-pressed={isSel} aria-label={sold ? t("seats.soldLabel", { seat: s.id }) : t("seats.availableLabel", { seat: s.id, tier: s.premium ? t("seats.premiumWord") : t("seats.standardWord") })} title={s.id}
                    style={{
                      height: "clamp(18px, 5.2vw, 22px)", width: "clamp(18px, 5.2vw, 22px)", borderRadius: 5, border: "none", padding: 0, fontSize: 8, fontWeight: 700,
                      background: sold ? "#E6ECEF" : isSel ? C.primary : s.premium ? C.warningSoft : "#DDEEF4",
                      color: sold ? "#7A8D98" : isSel ? C.onPrimary : s.premium ? C.warning : C.text,
                      cursor: sold ? "not-allowed" : "pointer", outline: isSel ? `2px solid ${C.focus}` : "none",
                    }}>
                    {s.colIndex + 1}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, fontSize: 10, color: C.muted }}>
        <Legend swatch="#DDEEF4" label={standardLabel} />
        <Legend swatch={C.warningSoft} label={premiumLabel} />
        <Legend swatch={C.primary} label={t("seats.selected")} />
        <Legend swatch="#E6ECEF" label={t("seats.sold")} />
      </div>
      <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surfaceAlt, padding: "12px 16px" }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted }}>{selected.length ? <>{t("seats.countLabel", { count: selected.length })} <span dir="ltr">{selected.join(", ")}</span></> : t("seats.none")}</div>
          <div role="status" style={{ fontSize: 9, color: C.muted }}>{quoteState?.seatKey === selectedKey && quoteState.loading ? t("seats.pricingUpdating") : exactQuote ? t("seats.priceUpdated") : hasDemoEstimate ? t("seats.demoEstimateLabel") : t("seats.quoteRequiredLabel")}</div>
          {Number.isFinite(total) && <div dir="ltr" style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{formatCurrency(total, totalCurrency)}</div>}
          {exactQuote && Number.isFinite(quotedSubtotal) && <div style={{ marginTop: 3, color: C.muted, fontSize: 9 }}>{t("seats.subtotal")}: <span dir="ltr">{formatCurrency(quotedSubtotal, totalCurrency)}</span>{Number.isFinite(quotedFeeTotal) && quotedFeeTotal > 0 ? <> · {t("seats.fees")}: <span dir="ltr">{formatCurrency(quotedFeeTotal, totalCurrency)}</span></> : null}</div>}
          {quoteState?.seatKey === selectedKey && quoteState.error && <div role="alert" style={{ marginTop: 3, color: C.danger, fontSize: 9 }}>{quoteState.error}</div>}
        </div>
        <button disabled={!selected.length} onClick={() => onConfirm(selected, total)}
          style={{ borderRadius: 8, border: "none", padding: "10px 20px", fontSize: 14, fontWeight: 600, color: C.onPrimary, background: C.primary, opacity: selected.length ? 1 : 0.3, cursor: selected.length ? "pointer" : "not-allowed" }}>
          {t("seats.confirm")}
        </button>
      </div>
    </div>
  );
}

export function BookingCard({
  booking,
  cancellation = null,
  onRequestCancel,
  onConfirm,
  onDecline,
  onBack,
  cancelled,
}) {
  const { t, dir, formatCurrency, formatDate } = useI18n();
  const isCancelled = cancelled ?? booking.cancelled;
  const isCurrent = isCurrentBooking({ ...booking, cancelled: isCancelled });
  const isDemo = booking.verified !== true
    || booking.demo === true
    || booking.paymentStatus === "simulated_not_charged"
    || booking.bookingStatus === "confirmed_demo";
  const isDemoCancellation = isCancelled && (isDemo || booking.refundStatus === "not_processed_demo");
  const posterUrl = getMoviePosterUrl(booking);
  const cinemaName = booking.cinemaName || t("booking.unknownCinema");
  const storedPerformanceDate = booking.performanceDate || booking.sourceDate || booking.date;
  const performanceDate = storedPerformanceDate ? formatDate(storedPerformanceDate) : t("booking.unknownDate");
  const sessionSummary = [booking.experience, booking.screen, booking.showtime].filter(Boolean).join(" · ");
  const headerTitle = isDemoCancellation
    ? t("booking.cancelledLocal")
    : isCancelled
      ? t("booking.cancelled")
      : isDemo
        ? t("booking.demoConfirmed")
        : t("booking.confirmed");
  const headerSubtitle = isDemoCancellation
    ? t("booking.noRefundProcessed")
    : isCancelled
      ? t("booking.refundStarted")
      : isDemo
        ? t("booking.demoReady")
        : t("booking.ready");
  const statusLabel = isDemoCancellation
    ? t("history.cancelledLocal")
    : isCancelled
      ? t("history.cancelled")
      : !isCurrent
        ? t("history.past")
      : isDemo
        ? t("history.demo")
        : t("history.active");
  const rawCancellationPhase = String(cancellation?.phase || "idle");
  const cancellationPhase = ({
    checking_eligibility: "checking",
    route: "route_confirmation",
    final: "final_confirmation",
    in_flight: "processing",
  })[rawCancellationPhase] || rawCancellationPhase;
  const bookingCreatedAt = Date.parse(booking.createdAt || "");
  const journalStartedAt = Number(cancellation?.journalStartedAt);
  const cancellationCouldApply = !cancellation?.outcomeUnknown
    || !Number.isFinite(bookingCreatedAt)
    || !Number.isFinite(journalStartedAt)
    || bookingCreatedAt <= journalStartedAt;
  const cancellationActive = isCurrent && cancellationCouldApply && !["idle", "success", "cancelled", "declined"].includes(cancellationPhase);
  const cancellationDemoOnly = cancellation?.demoOnly ?? isDemo;
  const cancellationBusy = Boolean(cancellation?.inFlight) || ["checking", "processing"].includes(cancellationPhase);
  const cancellationRef = cancellation?.bookingRef || booking.ref;
  const cancellationPanelRef = React.useRef(null);
  const lastFocusedCancellationPhaseRef = React.useRef("idle");

  React.useEffect(() => {
    if (!cancellationActive) {
      lastFocusedCancellationPhaseRef.current = "idle";
      return undefined;
    }
    const focusKey = `${cancellationRef || "unknown"}:${cancellationPhase}`;
    if (lastFocusedCancellationPhaseRef.current === focusKey) return undefined;
    lastFocusedCancellationPhaseRef.current = focusKey;
    const frame = window.requestAnimationFrame(() => {
      const panel = cancellationPanelRef.current;
      if (!panel) return;
      panel.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" });
      if (["route_confirmation", "final_confirmation", "error"].includes(cancellationPhase)) {
        panel.focus?.({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cancellationActive, cancellationPhase, cancellationRef]);

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} disabled={cancellationBusy} style={{ ...backToBookingsButton, opacity: cancellationBusy ? 0.45 : 1, cursor: cancellationBusy ? "not-allowed" : "pointer" }}>
          <ChevronRight size={14} style={{ transform: dir === "rtl" ? "none" : "rotate(180deg)" }} />
          {t("history.back")}
        </button>
      )}
      <Header icon={<Ticket size={16} />} title={headerTitle} sub={headerSubtitle} />
      <div aria-busy={cancellationBusy || undefined} style={{ maxWidth: 420, margin: "0 auto", overflow: "hidden", borderRadius: 16, border: `1px solid ${C.border}`, background: `linear-gradient(160deg, ${C.primarySoft}, ${C.surface})` }}>
        <div style={{ display: "flex", gap: 14, padding: "16px 18px" }}>
          <Poster tint={booking.tint || [C.primaryHover, C.brand]} title={booking.movieTitle} posterUrl={posterUrl} small />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div dir="auto" style={{ overflowWrap: "anywhere", fontSize: 16, fontWeight: 700, color: C.text }}>{booking.movieTitle}</div>
            <div dir="ltr" style={{ overflowWrap: "anywhere", fontSize: 12, color: C.muted }}>{sessionSummary}</div>
          </div>
        </div>
        <div style={{ borderTop: `1px dashed ${C.border}`, padding: "11px 18px" }}>
          <Row k={t("booking.seats")} v={<span dir="ltr">{(Array.isArray(booking.seats) ? booking.seats : [booking.seats].filter(Boolean)).join(", ")}</span>} />
          <Row k={t("booking.cinema")} v={<bdi dir="auto">{cinemaName}</bdi>} />
          <Row k={t("booking.performance")} v={<span><span>{performanceDate}</span>{booking.showtime && <> · <span dir="ltr">{booking.showtime}</span></>}</span>} />
          <Row k={t("booking.status")} v={statusLabel} />
          <Row k={t("booking.ref")} v={<span dir="ltr" style={{ fontFamily: "monospace", color: C.primary }}>{booking.ref}</span>} />
          <Row k={t("booking.total")} v={<span dir="ltr">{formatCurrency(booking.total ?? booking.refundAmount, booking.currency || "AED")}</span>} />
          {isCancelled && !isDemoCancellation && booking.refundRoute && <Row k={t("booking.refundRoute")} v={<bdi dir="auto">{booking.refundRoute}</bdi>} />}
          {isCancelled && !isDemoCancellation && booking.refundReference && <Row k={t("booking.refundReference")} v={<span dir="ltr" style={{ fontFamily: "monospace", color: C.primary }}>{booking.refundReference}</span>} />}
        </div>
        {cancellationActive && (
          <CancellationPanel
            ref={cancellationPanelRef}
            phase={cancellationPhase}
            demoOnly={cancellationDemoOnly}
            busy={cancellationBusy}
            bookingRef={cancellationRef}
            amount={formatCurrency(booking.total ?? booking.refundAmount, booking.currency || "AED")}
            error={cancellation?.error}
            message={cancellation?.message}
            retryAllowed={cancellation?.retryAllowed !== false}
            dismissAllowed={cancellation?.dismissAllowed !== false}
            onConfirm={onConfirm}
            onDecline={onDecline}
            onRetry={onRequestCancel}
          />
        )}
        {!cancellationActive && <BookingQRCode booking={{ ...booking, cancelled: isCancelled }} />}
        {isCurrent && !cancellationActive ? (
          <button type="button" onClick={onRequestCancel} disabled={!onRequestCancel} style={{ ...cardFootBtn, color: C.danger, opacity: onRequestCancel ? 1 : 0.45, cursor: onRequestCancel ? "pointer" : "not-allowed" }}>
            <RotateCcw size={14} /> {t(isDemo ? "booking.cancelDemo" : "booking.cancelRefund")}
          </button>
        ) : isCancelled ? (
          <div style={{ ...cardFootBtn, color: isDemoCancellation ? C.warning : C.green, cursor: "default" }}>
            <Check size={14} /> {isDemoCancellation ? t("booking.noRefundProcessed") : t("booking.refundAmount", { amount: formatCurrency(booking.total ?? booking.refundAmount, booking.currency || "AED") })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const CancellationPanel = React.forwardRef(function CancellationPanel({
  phase,
  demoOnly,
  busy,
  bookingRef,
  amount,
  error,
  message,
  retryAllowed,
  dismissAllowed,
  onConfirm,
  onDecline,
  onRetry,
}, ref) {
  const { t } = useI18n();
  const isError = phase === "error";
  const isInteractive = ["route_confirmation", "final_confirmation", "error"].includes(phase);
  const title = phase === "checking"
    ? t("booking.cancelCheckingTitle")
    : phase === "processing"
      ? t("booking.cancelProcessingTitle")
      : isError
        ? t("booking.cancelErrorTitle")
        : t(demoOnly ? "booking.cancelDemoConfirmationLabel" : "booking.cancelConfirmationLabel");
  const body = phase === "checking"
    ? t("booking.cancelChecking", { ref: bookingRef })
    : phase === "processing"
      ? t("booking.cancelProcessing", { ref: bookingRef })
      : isError
        ? (message || (/[_-]/.test(String(error || "")) ? "" : error) || t("booking.cancelError"))
        : phase === "route_confirmation"
          ? t("booking.walletQuestion", { ref: bookingRef, amount })
          : t(demoOnly ? "booking.cancelDemoQuestion" : "booking.cancelQuestion", { ref: bookingRef, amount });

  return (
    <div
      ref={ref}
      role={isError ? "alert" : isInteractive ? "group" : "status"}
      aria-live={isError ? "assertive" : isInteractive ? "off" : "polite"}
      aria-label={title}
      tabIndex={isInteractive ? -1 : undefined}
      style={{ borderTop: `1px solid ${C.border}`, background: isError ? C.dangerSoft : C.surfaceAlt, padding: 14, outline: "none" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span aria-hidden="true" style={{ display: "grid", width: 26, height: 26, flexShrink: 0, placeItems: "center", borderRadius: 8, background: isError ? C.dangerSoft : C.primarySoft, color: isError ? C.danger : C.primary }}>
          {busy ? <RefreshCw size={14} /> : isError ? <AlertTriangle size={14} /> : <RotateCcw size={14} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 12, fontWeight: 800 }}>{title}</div>
          <p dir="auto" style={{ margin: "4px 0 0", overflowWrap: "anywhere", color: C.text, fontSize: 11, lineHeight: 1.5 }}>{body}</p>
        </div>
      </div>
      {isInteractive && (!isError || retryAllowed || dismissAllowed) && (
        <div style={cancellationActions}>
          {(!isError || dismissAllowed) && <button type="button" onClick={onDecline} disabled={busy} style={secondaryCancelButton}>{t("booking.keepBooking")}</button>}
          {isError ? (
            retryAllowed ? <button type="button" onClick={onRetry} disabled={busy || !onRetry} style={{ ...primaryCancelButton, opacity: onRetry ? 1 : 0.5 }}>{t("common.retry")}</button> : null
          ) : (
            <button type="button" onClick={onConfirm} disabled={busy || !onConfirm} style={{ ...primaryCancelButton, opacity: onConfirm ? 1 : 0.5 }}>
              {t(phase === "route_confirmation" ? "booking.useWallet" : demoOnly ? "booking.confirmCancelDemo" : "booking.confirmCancel")}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13, marginTop: 5 }}>
      <span style={{ flexShrink: 0, color: C.muted }}>{k}</span>
      <span style={{ minWidth: 0, overflowWrap: "anywhere", fontWeight: 600, color: C.text, textAlign: "end" }}>{v}</span>
    </div>
  );
}
function Legend({ swatch, label }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ height: 12, width: 12, borderRadius: 3, background: swatch }} />{label}</span>;
}

const btnReset = { background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" };
const btnGhost = { ...btnReset, borderRadius: 8, padding: 6, color: C.primary };
const rowBtn = { display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, padding: "12px 16px", color: C.text, textAlign: "start", cursor: "pointer" };
const backToBookingsButton = { display: "inline-flex", alignItems: "center", gap: 5, margin: "0 0 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surfaceAlt, padding: "6px 9px", color: C.primary, fontSize: 10, fontWeight: 700, cursor: "pointer" };
const cardFootBtn = { display: "flex", width: "100%", boxSizing: "border-box", alignItems: "center", justifyContent: "center", gap: 8, border: "none", borderTop: `1px solid ${C.border}`, padding: "12px 10px", fontSize: 14, fontWeight: 500, background: C.surface, cursor: "pointer" };
const cancellationActions = { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 12 };
const secondaryCancelButton = { flex: "1 1 120px", minHeight: 38, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, padding: "8px 12px", color: C.text, fontSize: 11, fontWeight: 700, cursor: "pointer" };
const primaryCancelButton = { flex: "1 1 140px", minHeight: 38, border: 0, borderRadius: 8, background: C.danger, padding: "8px 12px", color: C.onPrimary, fontSize: 11, fontWeight: 800, cursor: "pointer" };
