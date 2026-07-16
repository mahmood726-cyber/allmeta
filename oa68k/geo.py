"""African-site classification for registry trial locations.

Why an explicit allowlist and not a pattern: a regex over country names looks
tempting and is wrong. `/guinea/i` matches **Papua New Guinea** (Oceania) while
Guinea, Guinea-Bissau and Equatorial Guinea are all African; `/niger/i` matches
both Niger and Nigeria (fine) but also nothing else only by luck. The flag feeds
an equity claim ("this trial ran on the continent"), so it is a curated set
matched exactly, not a heuristic.

The strings are the ones AACT actually ships (verified against
`SELECT DISTINCT country FROM facilities` on the 2026-04-12 snapshot, 225
distinct values, 54 African). AACT writes `Côte d’Ivoire` with U+2019 (curly
apostrophe), so we normalise apostrophes before matching rather than trusting a
literal to survive a copy-paste.

Mayotte and Réunion are French overseas territories; they are geographically
African and counted as such — a trial site there is on the continent's shelf.
`is_african_country()` returns False for anything unrecognised, and
`unknown_countries()` exists so a future AACT snapshot that renames a country
surfaces as an explicit gap instead of a silent False.
"""
from __future__ import annotations

import unicodedata

# 54 strings, exactly as they appear in AACT 2026-04-12 `facilities.country`.
AFRICAN_COUNTRIES_RAW = [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
    "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
    "Côte d’Ivoire", "Democratic Republic of the Congo", "Djibouti", "Egypt",
    "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Ghana",
    "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya",
    "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Mayotte",
    "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
    "Republic of the Congo", "Reunion", "Rwanda", "Senegal", "Sierra Leone",
    "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania",
    "The Gambia", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
]

# Historical / alternate spellings seen in older snapshots and other registries.
# Kept separate from the verified-live list so provenance stays legible.
AFRICAN_ALIASES = [
    "Ivory Coast", "Cote d'Ivoire", "Congo, The Democratic Republic of the",
    "Congo", "Democratic Republic of Congo", "Gambia", "Swaziland",
    "Cape Verde", "Tanzania, United Republic of", "Libyan Arab Jamahiriya",
    "Réunion", "Sao Tome and Principe", "Western Sahara", "Zanzibar",
    "Saint Helena", "Burkina-Faso",
]

# Explicitly NOT African despite matching naive substring rules. Documented so
# nobody "fixes" the allowlist back into a regex.
NOT_AFRICAN_LOOKALIKES = ["Papua New Guinea", "New Guinea", "French Guiana", "Guyana"]


def normalize_country(name: str | None) -> str:
    """Casefold + NFKC + straighten apostrophes, so `Côte d’Ivoire` == `Cote d'Ivoire`."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKC", name).strip()
    for ch in ("’", "‘", "ʼ", "`"):
        s = s.replace(ch, "'")
    # strip accents so Réunion == Reunion
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")
    return " ".join(s.casefold().split())


_AFRICA = {normalize_country(x) for x in AFRICAN_COUNTRIES_RAW + AFRICAN_ALIASES}
_NOT_AFRICA = {normalize_country(x) for x in NOT_AFRICAN_LOOKALIKES}


def is_african_country(name: str | None) -> bool:
    n = normalize_country(name)
    if not n or n in _NOT_AFRICA:
        return False
    return n in _AFRICA


def unknown_countries(names) -> set:
    """Country strings we neither accept nor explicitly reject — i.e. the
    non-African world plus anything newly renamed. Callers diff this against a
    known-good set to detect snapshot drift rather than silently mis-flagging."""
    return {n for n in names if normalize_country(n)
            and not is_african_country(n) and normalize_country(n) not in _NOT_AFRICA}


def africa_sql_list() -> str:
    """SQL literal list for duckdb-side flagging (normalised, apostrophe-safe)."""
    vals = sorted(_AFRICA)
    return "[" + ",".join("'" + v.replace("'", "''") + "'" for v in vals) + "]"
