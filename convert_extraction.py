#!/usr/bin/env python3
"""Convert a full VOX UAE JSON extraction into Vista-shaped demo data.

Usage:
  python convert_extraction.py [input.json.gz] [src/mockVistaData.js] [metadata.json]

The current extractor emits a flat schedule with official movie, experience,
and bank-offer media. The legacy compact gzip remains supported. VOX showtimes
are retained as source wall-clock values so after-midnight sessions stay tied to
their source programming date.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "vox_showtimes_full.json"
OUTPUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "src" / "mockVistaData.js"
METADATA = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "data" / "movie_metadata_08-15Jul.json"

PALETTE = [
    ("#63418D", "#B6186C"), ("#7A5A2E", "#C79A4B"),
    ("#2E6A5A", "#57C79A"), ("#8D2E3A", "#D9556B"),
    ("#3A3A8D", "#6B6BD9"), ("#2E5A7A", "#4BA3C7"),
    ("#6A2E7A", "#B44BC7"), ("#7A2E2E", "#C74B4B"),
]
ALLOWED_SLOTS = {"Morning", "Afternoon", "Primetime", "LateNight"}
LANGUAGE_NAMES = {"ENG": "English", "ARA": "Arabic", "HIN": "Hindi", "MAL": "Malayalam", "TAM": "Tamil", "TEL": "Telugu", "TUR": "Turkish", "KOR": "Korean"}


def read_json(path: Path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_customer_facing_punctuation(value):
    if isinstance(value, str):
        return value.replace(chr(0x2013), "-").replace(chr(0x2014), "-")
    if isinstance(value, list):
        return [normalize_customer_facing_punctuation(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_customer_facing_punctuation(item) for key, item in value.items()}
    return value


def tint(code: str):
    return PALETTE[int(hashlib.md5(code.encode()).hexdigest(), 16) % len(PALETTE)]


def stable_seats(key: str, status: str) -> int:
    value = int(hashlib.md5(key.encode()).hexdigest()[:8], 16)
    return 8 + value % 20 if status.strip().lower() == "almost full" else 40 + value % 141


def parse_rows(extraction: dict):
    rows = []
    raw_count = 0
    seen = set()
    duplicate_count = 0
    if isinstance(extraction.get("sessions"), list):
        source_rows = [
            (str(item.get("programmingDate") or item.get("date", ""))[:10], item)
            for item in extraction["sessions"]
        ]
    else:
        source_rows = [
            (source_date, encoded)
            for source_date in sorted(extraction["dates"])
            for encoded in extraction["dates"][source_date]
        ]
    for programming_date, encoded in source_rows:
        if isinstance(encoded, dict):
            raw_count += 1
            date = str(encoded.get("date", ""))[:10]
            code = str(encoded.get("code", ""))
            cinema_code = str(encoded.get("cinemaCode", ""))
            experience = str(encoded.get("experience", ""))
            time = str(encoded.get("time", ""))[:5]
            status = str(encoded.get("status", ""))
            time_slot = str(encoded.get("timeSlot", ""))
            session_id = str(encoded.get("sessionId", ""))
            showtime = str(encoded.get("showtime") or f"{date}T{time}:00")
            experience_code = str(encoded.get("experienceCode", ""))
            is_available_for_offer = encoded.get("isAvailableForOffer", True) is not False
            comment = str(encoded.get("comment", ""))
        else:
            raw_count += 1
            parts = str(encoded).split("|", 5)
            if len(parts) != 6:
                raise ValueError(f"Malformed compact session row: {encoded!r}")
            code, cinema_code, experience, showtime, status, time_slot = parts
            date = showtime[:10]
            time = showtime[11:16]
            session_id = ""
            experience_code = ""
            is_available_for_offer = True
            comment = ""
        key = (code, cinema_code, session_id, showtime) if session_id else (date, code, cinema_code, experience, time)
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        rows.append({
            "programmingDate": programming_date,
            "date": date,
            "code": code,
            "cinemaCode": cinema_code,
            "experience": experience,
            "time": time,
            "timeSlot": time_slot,
            "status": status,
            "sessionId": session_id,
            "showtime": showtime,
            "experienceCode": experience_code,
            "isAvailableForOffer": is_available_for_offer,
            "comment": comment,
        })
    rows.sort(key=lambda row: (
        row["programmingDate"], row["cinemaCode"], row["code"], row["time"], row["experience"]
    ))
    return rows, raw_count, duplicate_count


def validate(extraction: dict, metadata: list[dict], rows: list[dict], raw_count: int):
    dates = sorted({row["programmingDate"] for row in rows})
    cinema_codes = sorted(extraction["cinemas"])
    catalog_codes = {item["code"] for item in extraction.get("catalog", metadata)}
    metadata_by_code = {item["code"]: item for item in metadata}
    errors = []
    if not dates:
        errors.append("no programming dates")
    if dates != sorted(set(dates)):
        errors.append("programming dates must be sorted and unique")
    if not cinema_codes:
        errors.append("no cinemas")
    if not catalog_codes:
        errors.append("no films")
    if not rows or raw_count < len(rows):
        errors.append(f"invalid raw / dedup session counts: {raw_count} / {len(rows)}")
    missing_metadata = sorted(catalog_codes - set(metadata_by_code))
    if missing_metadata:
        errors.append(f"missing metadata for {missing_metadata}")
    incomplete_metadata = sorted(
        code for code in catalog_codes
        if not metadata_by_code.get(code, {}).get("title")
        or not metadata_by_code.get(code, {}).get("rating")
        or not metadata_by_code.get(code, {}).get("genres")
    )
    if incomplete_metadata:
        errors.append(f"incomplete title/rating/genres for {incomplete_metadata}")
    row_codes = {row["code"] for row in rows}
    if catalog_codes != row_codes:
        errors.append(f"catalog/session film mismatch: missing metadata {sorted(row_codes - catalog_codes)}, unscheduled catalog entries {sorted(catalog_codes - row_codes)}")
    if isinstance(extraction.get("sessions"), list) and extraction.get("crawl"):
        missing_posters = sorted(code for code in catalog_codes if not metadata_by_code.get(code, {}).get("posterUrl"))
        recorded_missing_posters = sorted(extraction.get("crawl", {}).get("missingOfficialPosterCodes", []))
        if missing_posters != recorded_missing_posters:
            errors.append(
                f"missing official poster codes do not match crawl metadata: actual {missing_posters}, recorded {recorded_missing_posters}"
            )
        invalid_posters = sorted(
            code for code in catalog_codes
            if metadata_by_code.get(code, {}).get("posterUrl")
            and not str(metadata_by_code.get(code, {}).get("posterUrl")).startswith("https://")
        )
        if invalid_posters:
            errors.append(f"official poster URLs must use HTTPS for {invalid_posters}")
    bad_rows = [row for row in rows if not row["time"] or not row["experience"]]
    if bad_rows:
        errors.append(f"{len(bad_rows)} rows have empty time or experience")
    bad_slots = sorted({row["timeSlot"] for row in rows if row["timeSlot"] not in ALLOWED_SLOTS})
    if bad_slots:
        errors.append(f"unexpected time slots: {bad_slots}")
    if errors:
        raise ValueError("Extraction validation failed:\n- " + "\n- ".join(errors))
    return dates, metadata_by_code


def build():
    extraction = normalize_customer_facing_punctuation(read_json(INPUT))
    if isinstance(extraction.get("sessions"), list):
        metadata = [{
            "code": item["code"],
            "title": item.get("title", ""),
            "rating": item.get("rating", ""),
            "language": item.get("language", ""),
            "languageName": item.get("languageName") or LANGUAGE_NAMES.get(item.get("language", ""), item.get("language", "")),
            "runtime": item.get("runtime", 0),
            "genres": item.get("genres", []),
            "synopsis": item.get("synopsis") or item.get("description", ""),
            "subtitles": item.get("subtitles", []),
            "images": item.get("images", {}),
            "posterUrl": item.get("posterUrl", ""),
            "posterStatus": item.get("posterStatus", "official" if item.get("posterUrl") else "missing_at_source"),
            "backdropUrl": item.get("backdropUrl", ""),
            "movieUrl": item.get("movieUrl", ""),
            "sourcePageUrl": item.get("sourcePageUrl", ""),
            "categories": item.get("categories", []),
            "experiences": item.get("experiences", []),
            "sourceUrl": item.get("sourceUrl", "https://uae-apife.voxcinemas.com/v1/vox2-0/content/movies?region=UAE"),
        } for item in extraction.get("catalog", [])]
    else:
        metadata = normalize_customer_facing_punctuation(read_json(METADATA))
    rows, raw_count, duplicate_count = parse_rows(extraction)
    dates, metadata_by_code = validate(extraction, metadata, rows, raw_count)

    cinemas = [
        {"ID": code, "Name": f"VOX - {name}", "City": "UAE", "CurrencyCode": "AED"}
        for code, name in sorted(extraction["cinemas"].items(), key=lambda item: item[1])
    ]
    film_cinemas = sorted({(row["cinemaCode"], row["code"]) for row in rows})
    films = []
    for cinema_code, film_code in film_cinemas:
        meta = metadata_by_code[film_code]
        films.append({
            "ScheduledFilmId": film_code,
            "CinemaId": cinema_code,
            "Title": meta["title"],
            "Rating": meta["rating"],
            "Language": meta["language"],
            "LanguageName": meta.get("languageName", ""),
            "RunTime": meta.get("runtime", 0),
            "Genres": meta["genres"],
            "genre": meta["genres"][0],
            "Synopsis": meta["synopsis"],
            "Subtitles": meta.get("subtitles", []),
            "posterUrl": meta.get("posterUrl", ""),
            "PosterStatus": meta.get("posterStatus", "official" if meta.get("posterUrl") else "missing_at_source"),
            "backdropUrl": meta.get("backdropUrl", ""),
            "images": meta.get("images", {}),
            "movieUrl": meta.get("movieUrl", ""),
            "sourcePageUrl": meta.get("sourcePageUrl", ""),
            "tint": list(tint(film_code)),
        })

    sessions = []
    for index, row in enumerate(rows, start=100001):
        session_key = "|".join((
            row["date"], row["code"], row["cinemaCode"], row["experience"], row["time"]
        ))
        sessions.append({
            "CinemaId": row["cinemaCode"],
            "ScheduledFilmId": row["code"],
            "SessionId": row.get("sessionId") or str(index),
            "Showtime": row.get("showtime") or f"{row['date']}T{row['time']}:00",
            "SourceDate": row["date"],
            "SourceProgrammingDate": row["programmingDate"],
            "ScreenName": row["experience"],
            "SeatsAvailable": stable_seats(session_key, row["status"]),
            "SessionAttributesNames": [row["experience"]],
            "TimeSlot": row["timeSlot"],
            "Status": row["status"],
            "ExperienceCode": row.get("experienceCode", ""),
            "IsAvailableForOffer": row.get("isAvailableForOffer", True),
            "Comment": row.get("comment", ""),
        })

    experiences = sorted({row["experience"] for row in rows})
    date_counts = {date: sum(row["programmingDate"] == date for row in rows) for date in dates}
    source_raw_count = int(extraction.get("crawl", {}).get("rawSessionCount", raw_count))
    source_duplicate_count = int(extraction.get("crawl", {}).get("duplicateCount", duplicate_count))
    stats = {
        "extractedAt": extraction.get("extractedAt"),
        "sourceDates": dates,
        "filmCount": len(metadata),
        "cinemaCount": len(cinemas),
        "rawSessionCount": source_raw_count,
        "sessionCount": len(sessions),
        "duplicateCount": source_duplicate_count,
        "experiences": experiences,
        "sessionsByDate": date_counts,
        "experienceMediaCount": len({
            re.sub(r"^_+|_+$", "", re.sub(r"[^A-Z0-9]+", "_", str(item.get("name") or item.get("code", "")).upper()))
            for item in extraction.get("experienceMedia", [])
            if item.get("name") or item.get("code")
        }),
        "offerMediaCount": len(extraction.get("offerMedia", [])),
        "crawl": extraction.get("crawl", {}),
    }

    def media_key(value: str) -> str:
        return re.sub(r"^_+|_+$", "", re.sub(r"[^A-Z0-9]+", "_", str(value).upper()))

    experience_media = {
        media_key(item.get("name") or item.get("code")): item
        for item in extraction.get("experienceMedia", [])
        if media_key(item.get("name") or item.get("code"))
    }
    offer_media = extraction.get("offerMedia", [])

    booking_title = metadata[0]["title"]
    output = f'''// ============================================================================
//  REAL VOX UAE DATA: generated from a validated official VOX extraction
//  Coverage: {dates[0]} to {dates[-1]} | Cinemas: {len(cinemas)} | Films: {len(metadata)} | Sessions: {len(sessions)}
//  Regenerate with: python convert_extraction.py
// ============================================================================

export const DATA_STATS = {json.dumps(stats, ensure_ascii=False, indent=2)};

export const DATA_DATES = {json.dumps(dates)};

export const EXPERIENCE_MEDIA = {json.dumps(experience_media, ensure_ascii=False, indent=2)};

export const OFFER_MEDIA = {json.dumps(offer_media, ensure_ascii=False, indent=2)};

export const CINEMAS = {json.dumps(cinemas, ensure_ascii=False, indent=2)};

export const FILMS = {json.dumps(films, ensure_ascii=False, indent=2)};

export const SESSIONS = {json.dumps(sessions, ensure_ascii=False, separators=(",", ":"))};

// Deterministic seat plan in the real Vista seat-plan shape.
export function seatPlan(seed = 7) {{
  let n = seed || 1;
  const rnd = () => {{ n = (n * 9301 + 49297) % 233280; return n / 233280; }};
  const rows = "ABCDEFGH".split("").map((name, ri) => ({{
    RowIndexZeroBased: ri,
    PhysicalName: name,
    Seats: Array.from({{ length: 12 }}, (_, ci) => ({{
      Position: {{ AreaNumber: 1, RowIndex: ri, ColumnIndex: ci }},
      Id: String(ci + 1),
      Status: rnd() < 0.22 ? 1 : 0,
      SeatStyle: 0,
      areaCategoryCode: ri >= 5 ? "0000000001" : "0000000002",
    }})),
  }}));
  return {{
    SeatLayoutData: {{
      Areas: [{{ AreaCategoryCode: "0000000002", Description: "REGULAR", Rows: rows, RowCount: 8, ColumnCount: 12 }}],
      AreaCategories: [
        {{ AreaCategoryCode: "0000000002", Name: "REGULAR" }},
        {{ AreaCategoryCode: "0000000001", Name: "PREMIUM" }},
      ],
    }},
    ResponseCode: 0,
    ErrorDescription: null,
  }};
}}

export const BOOKING = {{
  BookingId: "WL59LFJ",
  BookingNumber: 8608,
  FilmTitle: {json.dumps(booking_title)},
  Showtime: "{dates[0]}T18:40:00",
  Seats: ["C5", "C6"],
  TotalValueCents: 12600,
  ScreenName: "MAX",
}};
'''
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    # Generated artifacts must be byte-stable across Windows and Linux runners.
    OUTPUT.write_text(output, encoding="utf-8", newline="\n")
    print(
        f"Wrote {OUTPUT}: {len(cinemas)} cinemas, {len(metadata)} films, "
        f"{len(sessions)} sessions ({source_duplicate_count} source duplicates removed), dates {dates[0]}..{dates[-1]}"
    )


if __name__ == "__main__":
    build()
