#!/usr/bin/env python3
"""Verify the fresh official extraction and legacy compact compatibility path."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location("convert_extraction", ROOT / "convert_extraction.py")
converter = module_from_spec(spec)
spec.loader.exec_module(converter)

compact = converter.read_json(ROOT / "data" / "vox_sessions_08-15Jul.json.gz")
metadata = converter.read_json(ROOT / "data" / "movie_metadata_08-15Jul.json")
compact_rows, compact_raw, compact_duplicates = converter.parse_rows(compact)
converter.validate(compact, metadata, compact_rows, compact_raw)

flat = {
    "catalog": metadata,
    "cinemas": compact["cinemas"],
    "sessions": compact_rows,
}
flat_rows, flat_raw, flat_duplicates = converter.parse_rows(flat)
converter.validate(flat, metadata, flat_rows, flat_raw)

assert len(compact_rows) == len(flat_rows) == 6500
assert compact_duplicates == 1
assert flat_duplicates == 0
assert compact_rows == flat_rows

current = converter.read_json(ROOT / "data" / "vox_showtimes_full.json")
current_metadata = [{
    "code": item["code"],
    "title": item.get("title", ""),
    "rating": item.get("rating", ""),
    "genres": item.get("genres", []),
    "synopsis": item.get("synopsis", ""),
    "posterUrl": item.get("posterUrl", ""),
} for item in current["catalog"]]
current_rows, current_raw, current_duplicates = converter.parse_rows(current)
current_dates, _ = converter.validate(current, current_metadata, current_rows, current_raw)
assert current_dates == current["programmingDates"]
assert current["crawl"]["complete"] is True
assert current["crawl"]["rawSessionCount"] == len(current_rows) + current["crawl"]["duplicateCount"]
assert current_duplicates == 0
assert len(current.get("experienceMedia", [])) >= 13
assert len(current.get("offerMedia", [])) >= 19
print(f"Validated current official extraction ({len(current_rows):,} sessions / {len(current_dates)} dates) and legacy compact compatibility (6,500 sessions).")
