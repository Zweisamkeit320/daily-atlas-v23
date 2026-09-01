#!/usr/bin/env python3
"""Curate openly licensed city images from public Wikimedia Commons HTML.

This tool deliberately does not call the MediaWiki API. Discovery uses the
public Special:MediaSearch HTML page, and licence/author evidence is captured
from each selected Commons File page. Network results are staged until a human
visual review is recorded; search results are never promoted automatically.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import gzip
import hashlib
import html
import io
import json
import math
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent.parent
CITIES_FILE = ROOT / "data" / "raw" / "cities200.json"
CANDIDATES_FILE = ROOT / "data" / "visuals" / "city-commons-candidates.v1.json"
REVIEWS_FILE = ROOT / "data" / "visuals" / "city-commons-reviews.v1.json"
GENERATED_OVERRIDES_FILE = ROOT / "data" / "visuals" / "city-commons-overrides.generated.json"
OFFICIAL_OVERRIDES_FILE = ROOT / "data" / "visuals" / "city-commons-overrides.json"
AUDIT_REPORT = ROOT / "data" / "visuals" / "CITY_COMMONS_AUDIT_v2.4.md"
EVIDENCE_DIR = ROOT / "data" / "visuals" / "evidence" / "commons-city-pages"
STAGED_DIR = ROOT / "assets" / "visuals" / "cities-staged"
FINAL_DIR = ROOT / "assets" / "visuals" / "cities"
CITY_MANIFEST_JSON = FINAL_DIR / "manifest.json"
CITY_MANIFEST_JS = FINAL_DIR / "manifest.js"
CONTACT_DIR = ROOT / "data" / "visuals" / "city-review-evidence"
USER_AGENT = (
    "DailyAtlasV2.4CityCuration/1.0 "
    "(non-commercial educational PWA; public HTML evidence capture)"
)
TARGET_SIZE = (960, 540)

ALLOWED_LICENSES = {
    "CC0-1.0": ("CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"),
    "PDM-1.0": ("Public Domain Mark 1.0", "https://creativecommons.org/publicdomain/mark/1.0/"),
    "CC-BY-2.0": ("Creative Commons Attribution 2.0", "https://creativecommons.org/licenses/by/2.0/"),
    "CC-BY-2.5": ("Creative Commons Attribution 2.5", "https://creativecommons.org/licenses/by/2.5/"),
    "CC-BY-3.0": ("Creative Commons Attribution 3.0", "https://creativecommons.org/licenses/by/3.0/"),
    "CC-BY-4.0": ("Creative Commons Attribution 4.0", "https://creativecommons.org/licenses/by/4.0/"),
    "CC-BY-SA-2.0": ("Creative Commons Attribution-ShareAlike 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"),
    "CC-BY-SA-2.5": ("Creative Commons Attribution-ShareAlike 2.5", "https://creativecommons.org/licenses/by-sa/2.5/"),
    "CC-BY-SA-3.0": ("Creative Commons Attribution-ShareAlike 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
    "CC-BY-SA-4.0": ("Creative Commons Attribution-ShareAlike 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"),
    "CC-BY-SA-3.0-DE": ("Attribution-ShareAlike 3.0 Germany", "https://creativecommons.org/licenses/by-sa/3.0/de/"),
    "CC-BY-SA-3.0-EE": ("Attribution-ShareAlike 3.0 Estonia", "https://creativecommons.org/licenses/by-sa/3.0/ee/"),
    "CC-BY-3.0-PL": ("Attribution 3.0 Poland", "https://creativecommons.org/licenses/by/3.0/pl/"),
    "CC-BY-3.0-BR": ("Attribution 3.0 Brazil", "https://creativecommons.org/licenses/by/3.0/br/"),
    "CC-BY-2.5-AU": ("Attribution 2.5 Australia", "https://creativecommons.org/licenses/by/2.5/au/"),
}
LICENSE_URL_TO_CODE = {url.rstrip("/"): code for code, (_, url) in ALLOWED_LICENSES.items()}
PORTED_SUFFIXES = {"DE", "EE", "PL", "BR", "AU"}
CITY_ID = re.compile(r"^city-[a-z0-9]+(?:-[a-z0-9]+)*$")
SHA256 = re.compile(r"^[A-F0-9]{64}$")
ISO_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
AUTHOR_MAX_LENGTH = 240
ATTRIBUTION_MAX_LENGTH = 1000
AUTHOR_POLLUTION_MARKERS = (
    ".mw-parser-output",
    "@media",
    "background-image",
    "background-color",
    "box-sizing",
    "url(",
    "http://",
    "https://",
    "<style",
    "</style",
)
DISALLOWED_TITLE_TOKENS = {
    " map ", " locator ", " location ", " flag ", " logo ", " emblem ",
    " coat of arms ", " seal ", " icon ", " diagram ", " route ",
    " railway map ", " metro map ", " subway map ", " street sign ",
    " postage ", " stamp ", " census ", " population ", " district map ",
}
DISALLOWED_PAGE_MARKERS = {
    "copyright warning: a subject in this image is protected by copyright",
    "template:nofoP".lower(),
    "template:non-free",
    "this media may be deleted",
    "speedy deletion",
    "deletion request",
    "fair use",
}
POSITIVE_TOKENS = {
    "skyline": 18,
    "cityscape": 18,
    "panorama": 16,
    "panoramic": 16,
    "aerial": 12,
    "view": 8,
    "downtown": 8,
    "old town": 7,
    "city centre": 7,
    "city center": 7,
}

COUNTRY_ALIASES = {
    "Czechia": ["czech republic"],
    "Côte d’Ivoire": ["cote d ivoire", "ivory coast"],
    "South Korea": ["republic of korea", "korea"],
    "Türkiye": ["turkey"],
    "United Kingdom": ["great britain", "england", "scotland", "wales", "northern ireland"],
    "United States": ["united states of america", "usa", "u.s.a."],
}

# Cities with common names or known misleading search results require explicit
# source-page geography. Each inner list is an OR group; every group must match.
GEOGRAPHY_RULES = {
    "city-victoria-bc": {
        "required": [["victoria"], ["canada", "british columbia", "vancouver island", "victoria bc"]],
        "forbidden": ["hong kong"],
    },
    "city-maputo": {"required": [["maputo"], ["mozambique"]], "forbidden": ["ethekwini", "durban"]},
    "city-arusha": {"required": [["arusha"], ["tanzania"]], "forbidden": ["nairobi", "kenya"]},
    "city-oaxaca": {
        "required": [["oaxaca"], ["mexico"]],
        "forbidden": ["huatulco", "puerto angel", "tehuantepec", "miahuatlan"],
    },
    "city-delhi": {"required": [["delhi"], ["india"]], "forbidden": ["madrid", "spain"]},
    "city-puebla": {
        "required": [["puebla"], ["mexico"]],
        "forbidden": ["cholula"],
    },
    "city-trujillo-peru": {
        "required": [["trujillo"], ["peru", "la libertad"]],
        "forbidden": ["trujillo spain", "caceres", "extremadura"],
    },
    "city-asuncion": {"required": [["asuncion"], ["paraguay"]], "forbidden": ["cordoba argentina"]},
    "city-charleston": {"required": [["charleston"], ["south carolina"]], "forbidden": []},
    "city-newcastle-australia": {
        "required": [["newcastle"], ["australia", "new south wales"]],
        "forbidden": ["newcastle upon tyne", "united kingdom"],
    },
    "city-cordoba-argentina": {"required": [["cordoba"], ["argentina"]], "forbidden": ["spain"]},
    "city-santa-fe": {"required": [["santa fe"], ["new mexico"]], "forbidden": ["argentina"]},
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n").encode("utf-8")


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        temp_path = Path(handle.name)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_path, path)


def atomic_json(path: Path, value: Any) -> None:
    atomic_write(path, canonical_json_bytes(value))


def clean_url(value: str) -> str:
    parts = urlsplit(html.unescape(value))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def canonical_license_url(value: str) -> str:
    """Canonicalize a Commons JSON-LD deed/legalcode URL without losing jurisdiction."""
    cleaned = clean_url(value).replace("http://", "https://")
    parts = urlsplit(cleaned)
    if parts.scheme != "https" or parts.hostname not in {"creativecommons.org", "www.creativecommons.org"}:
        return ""
    path = re.sub(r"/+", "/", parts.path).casefold()
    licence = re.fullmatch(
        r"/licenses/(by|by-sa)/(\d+\.\d+)(?:/([a-z]{2}))?(?:/(?:deed(?:\.[a-z-]+)?|legalcode))?/?",
        path,
    )
    if licence:
        family, version, jurisdiction = licence.groups()
        jurisdiction_path = f"{jurisdiction}/" if jurisdiction else ""
        return f"https://creativecommons.org/licenses/{family}/{version}/{jurisdiction_path}"
    public_domain = re.fullmatch(
        r"/publicdomain/(zero|mark)/(\d+\.\d+)(?:/(?:deed(?:\.[a-z-]+)?|legalcode))?/?",
        path,
    )
    if public_domain:
        family, version = public_domain.groups()
        return f"https://creativecommons.org/publicdomain/{family}/{version}/"
    return ""


def license_transition_allowed(previous: dict[str, Any], current: dict[str, Any]) -> bool:
    if previous == current:
        return True
    old_code = str(previous.get("code") or "")
    new_code = str(current.get("code") or "")
    suffix = new_code.rsplit("-", 1)[-1]
    if suffix not in PORTED_SUFFIXES:
        return False
    base_code = new_code.rsplit("-", 1)[0]
    return (
        old_code == base_code
        and old_code in ALLOWED_LICENSES
        and previous.get("url") == ALLOWED_LICENSES[old_code][1]
    )


def require_https_host(value: str, hosts: set[str], label: str) -> str:
    parts = urlsplit(value)
    if parts.scheme != "https" or parts.hostname not in hosts or parts.username or parts.password:
        raise ValueError(f"{label} must be HTTPS on {sorted(hosts)}")
    return value


def normalize_text(value: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", value).strip().casefold()


def normalize_commons_file_title(value: str) -> str:
    return normalize_text(str(value or "").replace("_", " "))


def file_title_from_commons_page_url(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme != "https" or parts.hostname != "commons.wikimedia.org" or not parts.path.startswith("/wiki/"):
        return ""
    return unquote(parts.path[len("/wiki/"):]).replace("_", " ")


def plain_text(fragment: str) -> str:
    fragment = re.sub(r"<(?:br|p|div|li)\b[^>]*>", " ", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()


def safe_author_text(value: str) -> bool:
    """Reject creator-template CSS/URLs instead of truncating corrupted credit."""
    if not value or len(value) > AUTHOR_MAX_LENGTH or any(ord(char) < 32 for char in value):
        return False
    lowered = value.casefold()
    if any(marker in lowered for marker in AUTHOR_POLLUTION_MARKERS):
        return False
    return not any(char in value for char in ("{", "}"))


def safe_attribution_text(value: str) -> bool:
    if not value or len(value) > ATTRIBUTION_MAX_LENGTH or any(ord(char) < 32 for char in value):
        return False
    lowered = value.casefold()
    return not any(marker in lowered for marker in AUTHOR_POLLUTION_MARKERS) and not any(
        char in value for char in ("{", "}")
    )


def extract_file_author(document: str) -> str:
    """Extract a literal author from the Commons Author table cell.

    Creator templates embed a large <style> block before their actual name.
    Prefer the template's semantic ``.fn`` value; only use the legacy plain
    cell fallback when the result passes the same fail-closed safety rules.
    """
    marker = re.search(r'id="fileinfotpl(?:&#95;|_)aut"[^>]*>', document, flags=re.I)
    if not marker:
        return ""
    next_field = re.search(
        r'id="fileinfotpl(?:&#95;|_)(?:perm|ver|src|desc|date)"[^>]*>',
        document[marker.end():],
        flags=re.I,
    )
    end = marker.end() + (next_field.start() if next_field else 100_000)
    segment = document[marker.end():min(len(document), end)]
    creator_names: list[str] = []
    for raw in re.findall(
        r'<span[^>]*class=["\'][^"\']*\bfn\b[^"\']*["\'][^>]*>([\s\S]*?)</span>',
        segment,
        flags=re.I,
    ):
        name = plain_text(raw)
        if safe_author_text(name) and name not in creator_names:
            creator_names.append(name)
    if creator_names:
        combined = ", ".join(creator_names)
        return combined if safe_author_text(combined) else ""

    legacy = re.search(r'</td>\s*<td[^>]*>([\s\S]*?)</td>', segment, flags=re.I)
    author = plain_text(legacy.group(1)) if legacy else ""
    return author if safe_author_text(author) else ""


def safe_relative(path: Path) -> str:
    resolved_root = ROOT.resolve()
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError(f"path escapes workspace: {path}") from exc
    return relative.as_posix()


def load_cities() -> list[dict[str, Any]]:
    payload = json.loads(CITIES_FILE.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or len(payload) != 200:
        raise ValueError("cities200.json must contain exactly 200 cities")
    seen: set[str] = set()
    for city in payload:
        city_id = city.get("id")
        if not isinstance(city_id, str) or not CITY_ID.fullmatch(city_id) or city_id in seen:
            raise ValueError(f"invalid or duplicate city ID: {city_id}")
        seen.add(city_id)
    return payload


def parse_rlconf(document: str) -> dict[str, Any]:
    marker = "RLCONF="
    start = document.find(marker)
    if start < 0:
        raise ValueError("RLCONF not found in Commons HTML")
    start += len(marker)
    endings = [document.find(";\nRLSTATE=", start), document.find(";RLSTATE=", start)]
    endings = [item for item in endings if item >= 0]
    if not endings:
        raise ValueError("RLCONF terminator not found in Commons HTML")
    return json.loads(document[start:min(endings)])


def search_results(document: str) -> list[dict[str, Any]]:
    conf = parse_rlconf(document)
    raw = conf.get("sdmsInitialSearchResults", {}).get("results", {})
    values = list(raw.values()) if isinstance(raw, dict) else raw if isinstance(raw, list) else []
    return sorted((item for item in values if isinstance(item, dict)), key=lambda item: int(item.get("index", 9999)))


def city_terms(city: dict[str, Any]) -> list[str]:
    terms = [normalize_text(city["cityEn"])]
    aliases = {
        "Xi'an": ["xian", "xi an"],
        "Marrakesh": ["marrakech"],
        "Ho Chi Minh City": ["saigon"],
        "Mexico City": ["ciudad de mexico"],
        "São Paulo": ["sao paulo"],
        "Kraków": ["krakow"],
        "Córdoba": ["cordoba"],
        "Québec City": ["quebec city", "ville de quebec"],
        "Cologne": ["koln", "koeln"],
        "Munich": ["munchen", "muenchen"],
        "Florence": ["firenze"],
        "Venice": ["venezia"],
        "Vienna": ["wien"],
        "Prague": ["praha"],
        "Seville": ["sevilla"],
        "Lisbon": ["lisboa"],
        "Athens": ["athina"],
        "Cairo": ["al qahirah"],
        "Beijing": ["peking"],
        "Guangzhou": ["canton"],
        "Zanzibar City": ["zanzibar", "stone town"],
        "Cusco": ["cuzco"],
        "Salvador": ["salvador da bahia"],
        "Kashgar": ["kashi"],
        "Yogyakarta": ["jogja", "jogjakarta", "djokjakarta"],
        "Chiang Mai": ["chiangmai"],
        "Addis Ababa": ["addis abeba"],
        "Gondar": ["gonder"],
        "Victoria Falls": ["mosi oa tunya"],
        "Dar es Salaam": ["dar-es-salaam"],
        "Washington, D.C.": ["washington dc", "washington d.c."],
        "Belém": ["belem"],
        "Asunción": ["asuncion"],
    }
    terms.extend(normalize_text(alias) for alias in aliases.get(city["cityEn"], []))
    return sorted(set(term for term in terms if term), key=len, reverse=True)


def country_terms(city: dict[str, Any]) -> list[str]:
    values = [city["countryEn"], *COUNTRY_ALIASES.get(city["countryEn"], [])]
    return sorted(set(normalize_text(value) for value in values if value), key=len, reverse=True)


def source_geography_context(document: str) -> str:
    """Use only File-page title/categories/description, never the search query."""
    pieces: list[str] = []
    try:
        conf = parse_rlconf(document)
        for key in ("wgTitle", "wgPageName", "wgRelevantPageName"):
            if isinstance(conf.get(key), str):
                pieces.append(conf[key])
        categories = conf.get("wgCategories")
        if isinstance(categories, list):
            pieces.extend(str(value) for value in categories if isinstance(value, str))
    except (ValueError, TypeError, json.JSONDecodeError):
        pass
    marker = re.search(r'id="fileinfotpl(?:&#95;|_)desc"[^>]*>', document, flags=re.I)
    if marker:
        next_field = re.search(
            r'id="fileinfotpl(?:&#95;|_)(?:src|date|aut|perm|ver)"[^>]*>',
            document[marker.end():],
            flags=re.I,
        )
        end = marker.end() + (next_field.start() if next_field else 30_000)
        segment = document[marker.end():min(len(document), end)]
        cell = re.search(r'</td>\s*<td[^>]*>([\s\S]*?)</td>', segment, flags=re.I)
        if cell:
            pieces.append(plain_text(cell.group(1)))
    return normalize_text(" ".join(pieces))


def geography_signals(city: dict[str, Any], result: dict[str, Any], document: str) -> dict[str, Any]:
    search_context = normalize_text(f'{result.get("title", "")} {result.get("snippet", "")}')
    source_context = source_geography_context(document)
    city_search = any(term in search_context for term in city_terms(city))
    city_source = any(term in source_context for term in city_terms(city))
    country_search = any(term in search_context for term in country_terms(city))
    country_source = any(term in source_context for term in country_terms(city))
    rule = GEOGRAPHY_RULES.get(city["id"])
    if rule:
        required = all(any(normalize_text(term) in source_context for term in group) for group in rule["required"])
        conflict = any(normalize_text(term) in source_context for term in rule["forbidden"])
        passed = required and not conflict
        reason = None if passed else "ambiguous-city-source-geography-mismatch"
    else:
        passed = city_source or (city_search and country_source)
        reason = None if passed else "source-page-city-or-country-evidence-missing"
    return {
        "cityNameInTitleOrSnippet": city_search,
        "countryInTitleOrSnippet": country_search,
        "cityNameInSourceMetadata": city_source,
        "countryInSourceMetadata": country_source,
        "geographicGatePassed": passed,
        "geographicFailureReason": reason,
    }


def score_result(city: dict[str, Any], result: dict[str, Any], allow_manually_selected_wide: bool = False) -> tuple[int, str | None]:
    title = normalize_text(result.get("title", ""))
    snippet = normalize_text(result.get("snippet", ""))
    combined = f" {title} {snippet} "
    terms = city_terms(city)
    if not any(term in combined for term in terms):
        return -10_000, "city-name-missing"
    if any(token in combined for token in DISALLOWED_TITLE_TOKENS):
        return -10_000, "non-photographic-or-off-topic-title"
    info_list = result.get("imageinfo")
    info = info_list[0] if isinstance(info_list, list) and info_list else {}
    width = int(info.get("width") or 0)
    height = int(info.get("height") or 0)
    mime = str(info.get("mime") or "").lower()
    if mime not in {"image/jpeg", "image/png", "image/webp"}:
        return -10_000, "unsupported-media-type"
    if width < 960 or height < 540:
        return -10_000, "source-too-small"
    ratio = width / height
    maximum_ratio = 6.5 if allow_manually_selected_wide else 3.4
    if ratio < 1.25 or ratio > maximum_ratio:
        return -10_000, "not-suitable-landscape"
    score = 200 - min(160, int(result.get("index", 9999)) * 4)
    if any(term in title for term in terms):
        score += 45
    country = normalize_text(city["countryEn"])
    if country and country in combined:
        score += 20
    for token, bonus in POSITIVE_TOKENS.items():
        if token in combined:
            score += bonus
    score += min(20, int(math.log2(max(1, width * height / 1_000_000)) * 5))
    return score, None


def choose_download_url(info: dict[str, Any]) -> tuple[str, str]:
    original = clean_url(str(info.get("url") or ""))
    require_https_host(original, {"upload.wikimedia.org"}, "original URL")
    width = int(info.get("width") or 0)
    height = int(info.get("height") or 0)
    ratio = width / height
    if math.ceil(TARGET_SIZE[1] * ratio) > 1920:
        # An ultra-wide image needs the original to preserve >=540 source
        # pixels before the reviewed 16:9 centre crop.
        return original, original
    # Commons rejects arbitrary thumbnail widths for many originals. Use its
    # stable responsive breakpoints rather than emitting a mathematically exact
    # (but invalid) width such as 1759px.
    requested_width = 1280 if (1280 / ratio) >= TARGET_SIZE[1] else 1920
    responsive = info.get("responsiveUrls") if isinstance(info.get("responsiveUrls"), dict) else {}
    available = [clean_url(str(value)) for value in responsive.values() if isinstance(value, str)]
    thumb = clean_url(str(info.get("thumburl") or ""))
    if thumb:
        available.append(thumb)
    base = next((item for item in available if "/thumb/" in item and "px-" in item), "")
    if base:
        candidate = re.sub(r"/\d+px-([^/]+)$", rf"/{requested_width}px-\1", base)
        require_https_host(candidate, {"upload.wikimedia.org"}, "thumbnail URL")
        return original, candidate
    return original, original


def parse_file_page(document: str, page_bytes: bytes) -> dict[str, Any]:
    conf = parse_rlconf(document)
    source_file_title = str(conf.get("wgPageName") or "").replace("_", " ")
    if not source_file_title.startswith("File:"):
        raise ValueError("file-page-title-metadata-missing")
    json_ld_matches = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
        document,
        flags=re.I,
    )
    image_object: dict[str, Any] | None = None
    for raw in json_ld_matches:
        try:
            value = json.loads(html.unescape(raw))
        except (json.JSONDecodeError, TypeError):
            continue
        values = value if isinstance(value, list) else [value]
        for item in values:
            if isinstance(item, dict) and item.get("@type") == "ImageObject" and item.get("contentUrl"):
                image_object = item
                break
        if image_object:
            break
    if not image_object:
        raise ValueError("file-page-image-metadata-missing")

    licence_value = image_object.get("license")
    if isinstance(licence_value, list):
        licence_urls = [str(item) for item in licence_value]
    else:
        licence_urls = [str(licence_value or "")]
    code = None
    for value in licence_urls:
        normal = canonical_license_url(value).rstrip("/")
        if normal in LICENSE_URL_TO_CODE:
            code = LICENSE_URL_TO_CODE[normal]
            break
    if not code:
        # The hidden licence template is a file-level fallback. Do not use the
        # generic page <link rel=license>, which may cover only page text.
        shorts = re.findall(r'class="licensetpl(?:&#95;|_)short"[^>]*>(.*?)</span>', document, flags=re.I | re.S)
        short_text = " | ".join(plain_text(item) for item in shorts)
        compact_short = re.sub(r"[^a-z0-9]+", "", normalize_text(short_text))
        aliases = {
            "CC0-1.0": ["cc01.0", "cczero1.0"],
            "PDM-1.0": ["publicdomainmark1.0", "pdm1.0"],
            "CC-BY-2.0": ["ccby2.0"],
            "CC-BY-2.5": ["ccby2.5"],
            "CC-BY-3.0": ["ccby3.0"],
            "CC-BY-4.0": ["ccby4.0"],
            "CC-BY-SA-2.0": ["ccbysa2.0"],
            "CC-BY-SA-2.5": ["ccbysa2.5"],
            "CC-BY-SA-3.0": ["ccbysa3.0"],
            "CC-BY-SA-4.0": ["ccbysa4.0"],
        }
        for candidate, names in aliases.items():
            if any(re.sub(r"[^a-z0-9]+", "", name) in compact_short for name in names):
                code = candidate
                break
    if not code:
        raise ValueError("licence-not-allow-listed")

    author = extract_file_author(document)
    if not author:
        # Structured Commons metadata may encode a literal author name as a P2093 qualifier.
        try:
            conf = parse_rlconf(document)
            statements = conf.get("wbEntity", {}).get("statements", {}).get("P170", [])
            names: list[str] = []
            for statement in statements:
                qualifiers = statement.get("qualifiers", {}) if isinstance(statement, dict) else {}
                for qualifier in qualifiers.get("P2093", []) if isinstance(qualifiers, dict) else []:
                    value = qualifier.get("datavalue", {}).get("value") if isinstance(qualifier, dict) else None
                    if isinstance(value, str) and value.strip():
                        names.append(value.strip())
            author = ", ".join(dict.fromkeys(names))
        except (ValueError, TypeError, AttributeError):
            author = ""
    invalid_author = normalize_text(author)
    if not author or any(marker in invalid_author for marker in ("unknown", "no author information", "anonymous")):
        if code not in {"CC0-1.0", "PDM-1.0"}:
            raise ValueError("attribution-author-missing")
        author = "Unknown creator (as stated on the Commons file page)"
    if not safe_author_text(author):
        raise ValueError("attribution-author-unsafe")

    lowered = normalize_text(document)
    for marker in DISALLOWED_PAGE_MARKERS:
        if marker in lowered:
            raise ValueError("rights-warning-on-file-page")

    content_url = clean_url(str(image_object.get("contentUrl") or ""))
    require_https_host(content_url, {"upload.wikimedia.org"}, "content URL")
    return {
        "author": author,
        "license": {
            "code": code,
            "name": ALLOWED_LICENSES[code][0],
            "url": ALLOWED_LICENSES[code][1],
        },
        "jsonLdContentUrl": content_url,
        "sourceFileTitle": source_file_title,
        "sourceMetadataSha256": sha256_bytes(page_bytes),
    }


def render_webp(source: bytes, target: Path) -> dict[str, Any]:
    with Image.open(io.BytesIO(source)) as opened:
        opened.load()
        image = ImageOps.exif_transpose(opened).convert("RGB")
        if image.width < TARGET_SIZE[0] or image.height < TARGET_SIZE[1]:
            raise ValueError("downloaded-image-too-small")
        fitted = ImageOps.fit(image, TARGET_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        with io.BytesIO() as handle:
            fitted.save(handle, format="WEBP", quality=82, method=6, exact=True)
            payload = handle.getvalue()
    atomic_write(target, payload)
    return {
        "file": safe_relative(target),
        "sha256": sha256_bytes(payload),
        "width": TARGET_SIZE[0],
        "height": TARGET_SIZE[1],
        "bytes": len(payload),
    }


@dataclass
class Fetcher:
    retries: int
    timeout: float
    pause: float
    image_interval: float = 1.5
    rate_limit_cooldown: float = 45.0

    def __post_init__(self) -> None:
        self.local = threading.local()
        self.rate_lock = threading.Lock()
        self.next_request: dict[str, float] = {}
        self.blocked_until: dict[str, float] = {}

    def wait_for_host(self, host: str) -> None:
        interval = self.image_interval if host == "upload.wikimedia.org" else self.pause
        while True:
            with self.rate_lock:
                now = time.monotonic()
                ready_at = max(self.next_request.get(host, 0.0), self.blocked_until.get(host, 0.0))
                delay = max(0.0, ready_at - now)
                if delay <= 0:
                    self.next_request[host] = now + interval
                    return
            time.sleep(min(delay, 1.0))

    def block_host(self, host: str, seconds: float) -> None:
        with self.rate_lock:
            self.blocked_until[host] = max(self.blocked_until.get(host, 0.0), time.monotonic() + seconds)

    def session(self) -> requests.Session:
        session = getattr(self.local, "session", None)
        if session is None:
            session = requests.Session()
            session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en,zh;q=0.8"})
            self.local.session = session
        return session

    def get(self, url: str, expected: str) -> tuple[bytes, str]:
        last_error: Exception | None = None
        host = urlsplit(url).hostname or ""
        for attempt in range(self.retries):
            try:
                self.wait_for_host(host)
                response = self.session().get(url, timeout=self.timeout, allow_redirects=True)
                if response.status_code == 429:
                    retry_after = response.headers.get("retry-after", "")
                    try:
                        server_delay = float(retry_after)
                    except ValueError:
                        server_delay = 0.0
                    cooldown = max(server_delay, self.rate_limit_cooldown * (attempt + 1))
                    self.block_host(host, cooldown)
                    raise RateLimitError(f"HTTP 429 from {host}; global cooldown {cooldown:.0f}s")
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").lower()
                if expected == "html" and "text/html" not in content_type:
                    raise ValueError(f"unexpected content-type {content_type}")
                if expected == "image" and not content_type.startswith("image/"):
                    raise ValueError(f"unexpected content-type {content_type}")
                return response.content, response.url
            except (requests.RequestException, ValueError, RateLimitError) as exc:
                last_error = exc
                if attempt + 1 < self.retries:
                    if not isinstance(exc, RateLimitError):
                        time.sleep(min(8.0, 1.25 * (2**attempt)))
        if isinstance(last_error, RateLimitError):
            raise last_error
        raise RuntimeError(f"GET failed after {self.retries} attempts: {url}: {last_error}")


class RateLimitError(RuntimeError):
    """A host-level 429 remained after globally coordinated cooldowns."""


def evidence_path(city_id: str, kind: str) -> Path:
    return EVIDENCE_DIR / f"{city_id}.{kind}.html.gz"


def read_or_fetch_html(fetcher: Fetcher, url: str, path: Path, refresh: bool) -> tuple[bytes, str, str]:
    if path.exists() and not refresh:
        with gzip.open(path, "rb") as handle:
            payload = handle.read()
        return payload, "frozen-local-snapshot", datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    payload, final_url = fetcher.get(url, "html")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        temp_path = Path(handle.name)
        with gzip.GzipFile(filename="", mode="wb", fileobj=handle, mtime=0) as zipped:
            zipped.write(payload)
    os.replace(temp_path, path)
    return payload, final_url, now_iso()


def discover_city(
    city: dict[str, Any],
    fetcher: Fetcher,
    refresh: bool,
    max_pages: int,
    query_style: str,
    candidate_offset: int,
    file_title: str | None = None,
) -> dict[str, Any]:
    query_suffixes = {
        "cityscape": "cityscape",
        "panorama": "panorama",
        "skyline": "skyline",
        "view": "city view",
        "old-town": "old town",
        "aerial": "aerial view",
        "waterfront": "waterfront",
        "place": "",
    }
    query = f'{city["cityEn"]} {city["countryEn"]} {query_suffixes[query_style]}'.strip()
    search_url = f"https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image&search={quote(query)}"
    attempts: list[dict[str, Any]] = []
    try:
        search_bytes, final_search_url, search_retrieved_at = read_or_fetch_html(
            fetcher, search_url, evidence_path(city["id"], f"search-{query_style}"), refresh
        )
        search_text = search_bytes.decode("utf-8", errors="replace")
        results = search_results(search_text)
        if file_title:
            results = [result for result in results if result.get("title") == file_title]
    except Exception as exc:  # network/parser boundary is recorded per city
        return unresolved(city, query, search_url, attempts, f"search-failed:{type(exc).__name__}:{exc}")

    ranked: list[tuple[int, dict[str, Any]]] = []
    for result in results:
        score, failure = score_result(city, result, bool(file_title))
        if failure:
            attempts.append({"fileTitle": result.get("title"), "status": "rejected", "reason": failure})
        else:
            ranked.append((score, result))
    ranked.sort(key=lambda pair: (-pair[0], int(pair[1].get("index", 9999)), str(pair[1].get("title", ""))))

    for rank, (score, result) in enumerate(ranked[candidate_offset:candidate_offset + max_pages], start=candidate_offset + 1):
        title = str(result.get("title") or "")
        info_list = result.get("imageinfo")
        info = info_list[0] if isinstance(info_list, list) and info_list else {}
        page_url = clean_url(str(result.get("canonicalurl") or result.get("fullurl") or info.get("descriptionurl") or ""))
        attempt: dict[str, Any] = {"fileTitle": title, "status": "rejected", "score": score, "rank": rank, "pageUrl": page_url}
        try:
            require_https_host(page_url, {"commons.wikimedia.org"}, "file page URL")
            evidence_key = (
                f'manual-{hashlib.sha256(title.encode("utf-8")).hexdigest()[:16]}'
                if file_title
                else f"candidate-{query_style}-{rank:02d}"
            )
            page_file = evidence_path(city["id"], evidence_key)
            page_bytes, _, page_retrieved_at = read_or_fetch_html(fetcher, page_url, page_file, refresh)
            page_text = page_bytes.decode("utf-8", errors="replace")
            metadata = parse_file_page(page_text, page_bytes)
            if normalize_commons_file_title(metadata["sourceFileTitle"]) != normalize_commons_file_title(title):
                raise ValueError("search-and-file-page-title-mismatch")
            if normalize_commons_file_title(file_title_from_commons_page_url(page_url)) != normalize_commons_file_title(title):
                raise ValueError("published-page-url-title-mismatch")
            geo = geography_signals(city, result, page_text)
            if not geo["geographicGatePassed"]:
                raise ValueError(geo["geographicFailureReason"])
            original_url, thumbnail_url = choose_download_url(info)
            # File-page JSON-LD content must identify the same upload host asset.
            if unquote(urlsplit(metadata["jsonLdContentUrl"]).path).split("/")[-1] != unquote(urlsplit(original_url).path).split("/")[-1]:
                raise ValueError("search-and-file-page-image-mismatch")
            image_bytes, _ = fetcher.get(thumbnail_url, "image")
            staged_path = STAGED_DIR / f'{city["id"]}.webp'
            local = render_webp(image_bytes, staged_path)
            attempt["status"] = "staged"
            attempts.append(attempt)
            attribution = f'{metadata["author"]}, {title.removeprefix("File:")}, {metadata["license"]["code"]}, via Wikimedia Commons; cropped to 16:9 and resized.'
            selected = {
                "fileTitle": title,
                "pageUrl": page_url,
                "originalUrl": original_url,
                "thumbnailUrl": thumbnail_url,
                "author": metadata["author"],
                "attribution": attribution,
                "license": metadata["license"],
                "searchMetadataRetrievedAt": search_retrieved_at,
                "searchMetadataSha256": sha256_bytes(search_bytes),
                "sourceMetadataRetrievedAt": page_retrieved_at,
                "sourceMetadataSha256": metadata["sourceMetadataSha256"],
                "sourceWidth": int(info.get("width") or 0),
                "sourceHeight": int(info.get("height") or 0),
                "subjectSignals": {
                    **geo,
                    "landscape": True,
                    "filePageRightsWarningAbsent": True,
                    "visualReviewRequired": True,
                },
                "staged": local,
            }
            return {
                "id": city["id"],
                "cityZh": city["cityZh"],
                "cityEn": city["cityEn"],
                "countryEn": city["countryEn"],
                "query": query,
                "searchPage": final_search_url if final_search_url != "frozen-local-snapshot" else search_url,
                "status": "staged-awaiting-visual-review",
                "failureReason": None,
                "selected": selected,
                "attempts": attempts,
            }
        except Exception as exc:
            attempt["reason"] = f"{type(exc).__name__}:{exc}"
            attempts.append(attempt)
            if isinstance(exc, RateLimitError):
                return unresolved(city, query, search_url, attempts, "host-rate-limit-remained-after-coordinated-cooldown")
    reason = "no-candidate-passed-file-level-rights-and-format-checks" if ranked else "no-city-matched-landscape-search-result"
    return unresolved(city, query, search_url, attempts, reason)


def unresolved(city: dict[str, Any], query: str, search_page: str, attempts: list[dict[str, Any]], reason: str) -> dict[str, Any]:
    return {
        "id": city["id"],
        "cityZh": city["cityZh"],
        "cityEn": city["cityEn"],
        "countryEn": city["countryEn"],
        "query": query,
        "searchPage": search_page,
        "status": "unresolved",
        "failureReason": reason,
        "selected": None,
        "attempts": attempts,
    }


def candidates_payload(items: list[dict[str, Any]]) -> dict[str, Any]:
    staged = sum(item["status"] == "staged-awaiting-visual-review" for item in items)
    unresolved_count = len(items) - staged
    cities_hash = sha256_bytes(CITIES_FILE.read_bytes())
    return {
        "schemaVersion": 1,
        "scope": "Wikimedia Commons HTML-derived city image candidates. Staged is not approved; a visual review is required before promotion.",
        "catalog": {"file": safe_relative(CITIES_FILE), "sha256": cities_hash, "count": 200},
        "retrievalPolicy": {
            "discovery": "Public Special:MediaSearch HTML only; no API key and no access-control bypass.",
            "fileEvidence": "Gzip snapshots of public Commons File-page HTML with SHA-256.",
            "allowedLicenses": sorted(ALLOWED_LICENSES),
            "output": "960x540 WebP, sRGB/RGB, centered crop, metadata removed, Pillow quality 82 method 6 exact.",
            "promotion": "Explicit visual review only; unresolved and rejected items are never copied into the final city directory.",
        },
        "counts": {"cities": len(items), "staged": staged, "unresolved": unresolved_count},
        "items": items,
    }


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_candidates(items_by_id: dict[str, dict[str, Any]]) -> None:
    cities = load_cities()
    ordered = [items_by_id[city["id"]] for city in cities]
    payload = candidates_payload(ordered)
    atomic_json(CANDIDATES_FILE, payload)
    write_audit_report(payload)


def write_audit_report(payload: dict[str, Any], overrides: dict[str, Any] | None = None) -> None:
    reviews = load_json(REVIEWS_FILE) if REVIEWS_FILE.exists() else {"items": []}
    review_map = {item["id"]: item for item in reviews.get("items", []) if isinstance(item, dict) and "id" in item}
    approved = sum(item.get("status") == "approved" for item in review_map.values())
    rejected = sum(item.get("status") == "rejected" for item in review_map.values())
    licence_counts = Counter(
        item["selected"]["license"]["code"]
        for item in payload["items"]
        if item.get("selected")
    )
    lines = [
        "# Daily Atlas v2.4 城市开放图片审计",
        "",
        "> 候选来自 Wikimedia Commons 公开 HTML；候选状态不等于许可或主题已批准。只有通过文件级许可核验并在联系表中完成实际画面复核的项目才可进入正式目录。",
        "",
        f"- 城市目录：{payload['counts']['cities']} 条",
        f"- 已暂存、等待画面复核：{payload['counts']['staged']} 条",
        f"- 未解决：{payload['counts']['unresolved']} 条",
        f"- 画面复核批准：{approved} 条",
        f"- 画面复核拒绝：{rejected} 条",
        f"- 许可分布：{', '.join(f'{key}={value}' for key, value in sorted(licence_counts.items())) or '无'}",
        "",
        "| ID | 城市 | 国家 | 采集状态 | 复核 | 许可 | 文件页或失败原因 |",
        "|---|---|---|---|---|---|---|",
    ]
    for item in payload["items"]:
        selected = item.get("selected") or {}
        review = review_map.get(item["id"], {})
        page = selected.get("pageUrl") or item.get("failureReason") or "—"
        if str(page).startswith("https://"):
            page = f"[Commons]({page})"
        lines.append(
            f"| `{item['id']}` | {item['cityZh']} / {item['cityEn']} | {item['countryEn']} | "
            f"{item['status']} | {review.get('status', 'pending')} | "
            f"{selected.get('license', {}).get('code', '—')} | {str(page).replace('|', '/')} |"
        )
    if overrides:
        lines.extend(["", f"正式覆盖候选：{len(overrides.get('items', []))} 条。"])
    atomic_write(AUDIT_REPORT, ("\n".join(lines) + "\n").encode("utf-8"))


def build_contact_sheets() -> list[Path]:
    payload = load_json(CANDIDATES_FILE)
    staged = [item for item in payload["items"] if item.get("selected")]
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)
    for old in CONTACT_DIR.glob("contact-*.jpg"):
        old.unlink()
    page_paths: list[Path] = []
    cell_width, image_height, label_height = 480, 270, 58
    cols, rows = 4, 4
    page_size = (cell_width * cols, (image_height + label_height) * rows)
    font = ImageFont.load_default(size=18)
    for page_index in range(0, len(staged), cols * rows):
        page = Image.new("RGB", page_size, "#EFE9DD")
        draw = ImageDraw.Draw(page)
        for slot, item in enumerate(staged[page_index:page_index + cols * rows]):
            x = (slot % cols) * cell_width
            y = (slot // cols) * (image_height + label_height)
            local_path = ROOT / item["selected"]["staged"]["file"]
            with Image.open(local_path) as opened:
                visual = opened.convert("RGB").resize((cell_width, image_height), Image.Resampling.LANCZOS)
            page.paste(visual, (x, y))
            label = f"{item['id']} | {item['cityEn']}, {item['countryEn']}"
            draw.rectangle((x, y + image_height, x + cell_width, y + image_height + label_height), fill="#F8F4EC")
            draw.text((x + 8, y + image_height + 8), label, fill="#103F3A", font=font)
        target = CONTACT_DIR / f"contact-{page_index // (cols * rows) + 1:02d}.jpg"
        page.save(target, format="JPEG", quality=88, optimize=True)
        page_paths.append(target)
    index = {
        "schemaVersion": 1,
        "sourceManifestSha256": sha256_bytes(CANDIDATES_FILE.read_bytes()),
        "pages": [safe_relative(item) for item in page_paths],
        "pageEvidence": [{
            "file": safe_relative(item),
            "sha256": sha256_bytes(item.read_bytes()),
            "bytes": item.stat().st_size,
        } for item in page_paths],
        "itemsPerPage": cols * rows,
        "count": len(staged),
    }
    atomic_json(CONTACT_DIR / "index.json", index)
    return page_paths


def validate_review_binding(
    candidate: dict[str, Any],
    review: dict[str, Any],
    source_manifest_sha256: str,
) -> None:
    """Bind an approval to the exact staged pixels and frozen File-page evidence."""
    selected = candidate.get("selected")
    if not selected:
        raise ValueError(f"cannot approve unresolved city {candidate['id']}")
    expected = {
        "fileTitle": selected["fileTitle"],
        "visualSha256": selected["staged"]["sha256"],
        "stagedSha256": selected["staged"]["sha256"],
        "sourceMetadataSha256": selected["sourceMetadataSha256"],
        "contactSheetSourceManifestSha256": source_manifest_sha256,
    }
    for field, value in expected.items():
        if review.get(field) != value:
            raise ValueError(f"stale or mismatched review binding for {candidate['id']}: {field}")


def validate_reviews(candidates: dict[str, Any], reviews: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if reviews.get("schemaVersion") != 1 or not isinstance(reviews.get("items"), list):
        raise ValueError("review file must have schemaVersion 1 and items")
    source_manifest_sha256 = sha256_bytes(CANDIDATES_FILE.read_bytes())
    if reviews.get("sourceManifestSha256") != source_manifest_sha256:
        raise ValueError("review file is not bound to the current candidate manifest")
    if not CONTACT_DIR.joinpath("index.json").is_file():
        raise ValueError("contact-sheet index is missing")
    contact_index = load_json(CONTACT_DIR / "index.json")
    if contact_index.get("sourceManifestSha256") != source_manifest_sha256:
        raise ValueError("contact sheets are stale for the current candidate manifest")
    candidate_map = {item["id"]: item for item in candidates["items"]}
    result: dict[str, dict[str, Any]] = {}
    for review in reviews["items"]:
        city_id = review.get("id")
        if city_id in result or city_id not in candidate_map:
            raise ValueError(f"duplicate or unknown review ID: {city_id}")
        if review.get("status") not in {"approved", "rejected"}:
            raise ValueError(f"invalid review status for {city_id}")
        if not DATE.fullmatch(str(review.get("checkedAt") or "")) or not str(review.get("note") or "").strip():
            raise ValueError(f"review date/note missing for {city_id}")
        if review["status"] == "approved":
            validate_review_binding(candidate_map[city_id], review, source_manifest_sha256)
        result[city_id] = review
    return result


def finalize_reviews(confirmed_source_sha256: str, apply: bool) -> dict[str, Any]:
    """Create approvals only for an explicitly confirmed, current contact-sheet snapshot."""
    validate_outputs(require_complete=True)
    current_hash = sha256_bytes(CANDIDATES_FILE.read_bytes())
    confirmed = confirmed_source_sha256.strip().upper()
    if not SHA256.fullmatch(confirmed) or confirmed != current_hash:
        raise ValueError("confirmed contact-sheet source hash does not match current candidates")
    contact_index = load_json(CONTACT_DIR / "index.json")
    if contact_index.get("sourceManifestSha256") != current_hash or contact_index.get("count") != 200:
        raise ValueError("contact-sheet index is stale or incomplete")
    page_evidence = contact_index.get("pageEvidence")
    if not isinstance(page_evidence, list) or not page_evidence:
        raise ValueError("contact-sheet page evidence is missing")
    for page in page_evidence:
        path = ROOT / str(page.get("file") or "")
        if (
            not path.is_file()
            or not SHA256.fullmatch(str(page.get("sha256") or ""))
            or sha256_bytes(path.read_bytes()) != page["sha256"]
            or path.stat().st_size != page.get("bytes")
        ):
            raise ValueError(f"contact-sheet page changed or missing: {page.get('file')}")

    checked_at = datetime.now(timezone.utc).date().isoformat()
    candidates = load_json(CANDIDATES_FILE)
    items: list[dict[str, Any]] = []
    for candidate in candidates["items"]:
        selected = candidate["selected"]
        review = {
            "id": candidate["id"],
            "status": "approved",
            "checkedAt": checked_at,
            "note": "Contact-sheet image and frozen Commons File-page title, description and categories were jointly reviewed; city subject and visual quality accepted.",
            "geographicEvidence": "Target city/country, Commons File metadata and the staged image were checked together.",
            "fileTitle": selected["fileTitle"],
            "visualSha256": selected["staged"]["sha256"],
            "stagedSha256": selected["staged"]["sha256"],
            "sourceMetadataSha256": selected["sourceMetadataSha256"],
            "contactSheetSourceManifestSha256": current_hash,
        }
        validate_review_binding(candidate, review, current_hash)
        items.append(review)
    payload = {
        "schemaVersion": 1,
        "scope": "Editorial and visual review approvals bound to exact staged pixels, frozen Commons evidence and contact-sheet snapshot; this is not an expert-signature claim.",
        "sourceManifestSha256": current_hash,
        "contactSheets": page_evidence,
        "items": items,
    }
    if apply:
        atomic_json(REVIEWS_FILE, payload)
    return payload


def repair_attribution(apply: bool) -> dict[str, Any]:
    """Reparse selected author metadata from matching frozen Commons evidence."""
    candidates = load_json(CANDIDATES_FILE)
    city_map = {city["id"]: city for city in load_cities()}
    changed: list[str] = []
    verified: list[str] = []
    for candidate in candidates.get("items", []):
        selected = candidate.get("selected")
        if not selected:
            continue
        expected_hash = selected.get("sourceMetadataSha256")
        matches: list[tuple[Path, bytes]] = []
        evidence_files = list(EVIDENCE_DIR.glob(f'{candidate["id"]}.candidate-*.html.gz'))
        evidence_files.extend(EVIDENCE_DIR.glob(f'{candidate["id"]}.manual-*.html.gz'))
        for evidence in sorted(evidence_files):
            try:
                with gzip.open(evidence, "rb") as handle:
                    page_bytes = handle.read()
            except OSError:
                continue
            if sha256_bytes(page_bytes) == expected_hash:
                matches.append((evidence, page_bytes))
        if not matches:
            raise ValueError(f'frozen source evidence match count for {candidate["id"]}: 0')
        _, page_bytes = matches[0]
        page_text = page_bytes.decode("utf-8", errors="replace")
        metadata = parse_file_page(page_text, page_bytes)
        if normalize_commons_file_title(metadata["sourceFileTitle"]) != normalize_commons_file_title(selected["fileTitle"]):
            raise ValueError(f'source file title changed while reparsing: {candidate["id"]}')
        if normalize_commons_file_title(file_title_from_commons_page_url(selected["pageUrl"])) != normalize_commons_file_title(selected["fileTitle"]):
            raise ValueError(f'published File-page URL mismatch: {candidate["id"]}')
        if metadata["sourceMetadataSha256"] != expected_hash:
            raise ValueError(f'source hash changed while reparsing: {candidate["id"]}')
        if clean_url(metadata["jsonLdContentUrl"]) != clean_url(selected["originalUrl"]):
            raise ValueError(f'source image changed while reparsing: {candidate["id"]}')
        if metadata["license"] != selected["license"]:
            if not license_transition_allowed(selected["license"], metadata["license"]):
                raise ValueError(f'licence changed incompatibly while reparsing: {candidate["id"]}')
            selected["license"] = metadata["license"]
            if candidate["id"] not in changed:
                changed.append(candidate["id"])
        geo = geography_signals(city_map[candidate["id"]], {"title": selected["fileTitle"], "snippet": ""}, page_text)
        if not geo["geographicGatePassed"]:
            raise ValueError(f'geographic gate failed while reparsing: {candidate["id"]}:{geo["geographicFailureReason"]}')
        author = metadata["author"]
        attribution = (
            f'{author}, {selected["fileTitle"].removeprefix("File:")}, '
            f'{selected["license"]["code"]}, via Wikimedia Commons; cropped to 16:9 and resized.'
        )
        if not safe_author_text(author) or not safe_attribution_text(attribution):
            raise ValueError(f'unsafe reparsed attribution: {candidate["id"]}')
        if author != selected["author"] or attribution != selected["attribution"]:
            if candidate["id"] not in changed:
                changed.append(candidate["id"])
            selected["author"] = author
            selected["attribution"] = attribution
        selected.setdefault("subjectSignals", {}).update(geo)
        verified.append(candidate["id"])
    if apply:
        atomic_json(CANDIDATES_FILE, candidates)
    return {"verified": len(verified), "changed": changed, "applied": apply}


def audit_geography() -> dict[str, Any]:
    candidates = load_json(CANDIDATES_FILE)
    city_map = {city["id"]: city for city in load_cities()}
    failures: list[dict[str, Any]] = []
    passed = 0
    for candidate in candidates.get("items", []):
        selected = candidate.get("selected")
        if not selected:
            failures.append({"id": candidate["id"], "reason": "unresolved"})
            continue
        evidence_files = list(EVIDENCE_DIR.glob(f'{candidate["id"]}.candidate-*.html.gz'))
        evidence_files.extend(EVIDENCE_DIR.glob(f'{candidate["id"]}.manual-*.html.gz'))
        page_bytes = None
        for evidence in sorted(evidence_files):
            try:
                with gzip.open(evidence, "rb") as handle:
                    payload = handle.read()
            except OSError:
                continue
            if sha256_bytes(payload) == selected.get("sourceMetadataSha256"):
                page_bytes = payload
                break
        if page_bytes is None:
            failures.append({"id": candidate["id"], "reason": "frozen-evidence-missing"})
            continue
        signals = geography_signals(
            city_map[candidate["id"]],
            {"title": selected["fileTitle"], "snippet": ""},
            page_bytes.decode("utf-8", errors="replace"),
        )
        if signals["geographicGatePassed"]:
            passed += 1
        else:
            failures.append({"id": candidate["id"], "fileTitle": selected["fileTitle"], **signals})
    return {"cities": len(candidates.get("items", [])), "passed": passed, "failed": failures}


def generate_overrides(apply: bool) -> dict[str, Any]:
    candidates = load_json(CANDIDATES_FILE)
    reviews = load_json(REVIEWS_FILE)
    review_map = validate_reviews(candidates, reviews)
    approved_ids = {city_id for city_id, review in review_map.items() if review.get("status") == "approved"}
    if len(approved_ids) != 200 or approved_ids != {item["id"] for item in candidates["items"]}:
        raise ValueError(f"promotion requires exactly 200 current approved reviews, found {len(approved_ids)}")
    items: list[dict[str, Any]] = []
    staged_payloads: dict[str, bytes] = {}
    for candidate in candidates["items"]:
        review = review_map.get(candidate["id"])
        if not review or review["status"] != "approved":
            continue
        selected = candidate["selected"]
        staged = ROOT / selected["staged"]["file"]
        staged_bytes = staged.read_bytes() if staged.is_file() else b""
        if (
            not staged_bytes
            or sha256_bytes(staged_bytes) != selected["staged"]["sha256"]
            or len(staged_bytes) != selected["staged"].get("bytes")
        ):
            raise ValueError(f"staged image missing or changed: {candidate['id']}")
        staged_payloads[candidate["id"]] = staged_bytes
        final = FINAL_DIR / f"{candidate['id']}.webp"
        local = dict(selected["staged"])
        local["file"] = safe_relative(final)
        items.append({
            "id": candidate["id"],
            "reviewStatus": "approved",
            "fileTitle": selected["fileTitle"],
            "pageUrl": selected["pageUrl"],
            "originalUrl": selected["originalUrl"],
            "thumbnailUrl": selected["thumbnailUrl"],
            "author": selected["author"],
            "attribution": selected["attribution"],
            "license": selected["license"],
            "sourceMetadataRetrievedAt": selected["sourceMetadataRetrievedAt"],
            "sourceMetadataSha256": selected["sourceMetadataSha256"],
            "subjectReview": {
                "status": "approved",
                "checkedAt": review["checkedAt"],
                "note": review["note"],
            },
            "local": local,
        })
    items.sort(key=lambda item: item["id"])
    payload = {
        "schemaVersion": 1,
        "scope": "Visually reviewed Wikimedia Commons city images with file-level open-licence evidence.",
        "items": items,
    }
    city_manifest_items = [{
        "id": item["id"],
        "path": f'./{item["local"]["file"]}',
        "sourcePage": item["pageUrl"],
        "author": item["author"],
        "licenseCode": item["license"]["code"],
        "licenseName": item["license"]["name"],
        "licenseUrl": item["license"]["url"],
        "attribution": item["attribution"],
        "sha256": item["local"]["sha256"],
        "bytes": item["local"]["bytes"],
        "width": item["local"]["width"],
        "height": item["local"]["height"],
    } for item in items]
    city_manifest = {
        "schemaVersion": 1,
        "count": len(city_manifest_items),
        "items": city_manifest_items,
    }
    browser_payload = json.dumps(city_manifest, ensure_ascii=False, separators=(",", ":")).replace("</script", "<\\/script")
    manifest_script = (
        f'(function(root){{"use strict";root.DAILY_ATLAS_CITY_VISUALS={browser_payload};}})'
        '(typeof globalThis!=="undefined"?globalThis:this);\n'
    ).encode("utf-8")
    if not apply:
        return payload

    FINAL_DIR.parent.mkdir(parents=True, exist_ok=True)
    promotion_dir = Path(tempfile.mkdtemp(prefix=".cities-promotion-", dir=FINAL_DIR.parent))
    backup_dir = FINAL_DIR.parent / f".cities-backup-{os.getpid()}-{time.time_ns()}"
    metadata_paths = (GENERATED_OVERRIDES_FILE, OFFICIAL_OVERRIDES_FILE, AUDIT_REPORT)
    old_metadata = {path: path.read_bytes() if path.is_file() else None for path in metadata_paths}
    final_swapped = False
    try:
        for item in items:
            target = promotion_dir / f'{item["id"]}.webp'
            atomic_write(target, staged_payloads[item["id"]])
            if target.stat().st_size != item["local"]["bytes"] or sha256_bytes(target.read_bytes()) != item["local"]["sha256"]:
                raise ValueError(f"promotion copy verification failed: {item['id']}")
        atomic_json(promotion_dir / "manifest.json", city_manifest)
        atomic_write(promotion_dir / "manifest.js", manifest_script)
        readme = FINAL_DIR / "README.md"
        if readme.is_file():
            shutil.copy2(readme, promotion_dir / "README.md")
        written = sorted(path.name for path in promotion_dir.glob("city-*.webp"))
        if len(written) != 200 or written != sorted(f'{item["id"]}.webp' for item in items):
            raise ValueError("promotion directory does not contain the exact 200 approved city images")

        if FINAL_DIR.exists():
            os.replace(FINAL_DIR, backup_dir)
        os.replace(promotion_dir, FINAL_DIR)
        final_swapped = True
        atomic_json(GENERATED_OVERRIDES_FILE, payload)
        atomic_json(OFFICIAL_OVERRIDES_FILE, payload)
        write_audit_report(candidates, payload)
    except Exception:
        for path, previous in old_metadata.items():
            if previous is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, previous)
        if final_swapped and FINAL_DIR.exists():
            failed_dir = FINAL_DIR.parent / f".cities-failed-{os.getpid()}-{time.time_ns()}"
            os.replace(FINAL_DIR, failed_dir)
            if backup_dir.exists():
                os.replace(backup_dir, FINAL_DIR)
            shutil.rmtree(failed_dir)
        elif backup_dir.exists() and not FINAL_DIR.exists():
            os.replace(backup_dir, FINAL_DIR)
        raise
    finally:
        if promotion_dir.exists():
            shutil.rmtree(promotion_dir)
    if backup_dir.exists():
        shutil.rmtree(backup_dir)
    return payload


def validate_outputs(require_complete: bool = False, require_geography: bool = True) -> dict[str, Any]:
    cities = load_cities()
    payload = load_json(CANDIDATES_FILE)
    if payload.get("schemaVersion") != 1 or payload.get("counts", {}).get("cities") != 200:
        raise ValueError("candidate audit must contain 200 cities")
    if [item["id"] for item in payload["items"]] != [city["id"] for city in cities]:
        raise ValueError("candidate audit order/IDs do not match cities200")
    staged = 0
    for item in payload["items"]:
        selected = item.get("selected")
        if not selected:
            if item.get("status") != "unresolved" or not item.get("failureReason"):
                raise ValueError(f"unresolved evidence incomplete: {item['id']}")
            continue
        staged += 1
        for key in ("fileTitle", "pageUrl", "originalUrl", "thumbnailUrl", "author", "attribution", "sourceMetadataRetrievedAt", "sourceMetadataSha256"):
            if not selected.get(key):
                raise ValueError(f"missing {key}: {item['id']}")
        if not safe_author_text(selected["author"]) or not safe_attribution_text(selected["attribution"]):
            raise ValueError(f"unsafe author/attribution text: {item['id']}")
        signals = selected.get("subjectSignals", {})
        if require_geography and (signals.get("geographicGatePassed") is not True or signals.get("geographicFailureReason") is not None):
            raise ValueError(f"geographic subject gate missing or failed: {item['id']}")
        if require_geography and not (signals.get("cityNameInTitleOrSnippet") or signals.get("cityNameInSourceMetadata")):
            raise ValueError(f"city subject evidence missing: {item['id']}")
        licence_code = selected["license"]["code"]
        expected_licence = ALLOWED_LICENSES.get(licence_code)
        if not expected_licence or selected["license"] != {
            "code": licence_code,
            "name": expected_licence[0],
            "url": expected_licence[1],
        }:
            raise ValueError(f"invalid licence: {item['id']}")
        if not ISO_INSTANT.fullmatch(selected["sourceMetadataRetrievedAt"]):
            raise ValueError(f"invalid retrieval instant: {item['id']}")
        if not SHA256.fullmatch(selected["sourceMetadataSha256"]):
            raise ValueError(f"invalid source hash: {item['id']}")
        local = selected["staged"]
        local_path = ROOT / local["file"]
        if not local_path.is_file() or sha256_bytes(local_path.read_bytes()) != local["sha256"]:
            raise ValueError(f"staged file missing or hash mismatch: {item['id']}")
        with Image.open(local_path) as opened:
            if opened.format != "WEBP" or opened.size != TARGET_SIZE:
                raise ValueError(f"staged file format/size mismatch: {item['id']}")
    if payload["counts"] != {"cities": 200, "staged": staged, "unresolved": 200 - staged}:
        raise ValueError("candidate counts do not match items")
    if require_complete and staged != 200:
        raise ValueError(f"complete staging required, found {staged}/200")
    return {"cities": 200, "staged": staged, "unresolved": 200 - staged}


def self_test() -> None:
    fixture = {
        "sdmsInitialSearchResults": {
            "results": {
                "1": {"index": 2, "title": "File:Test City skyline.jpg"},
                "0": {"index": 1, "title": "File:Test City map.svg"},
            }
        }
    }
    html_fixture = f"<script>RLCONF={json.dumps(fixture)};\nRLSTATE={{}}</script>"
    parsed = search_results(html_fixture)
    assert [item["index"] for item in parsed] == [1, 2]
    assert clean_url("https://upload.wikimedia.org/a.jpg?tracking=1") == "https://upload.wikimedia.org/a.jpg"
    assert normalize_commons_file_title(file_title_from_commons_page_url("https://commons.wikimedia.org/wiki/File:Test_City.jpg")) == normalize_commons_file_title("File:Test City.jpg")
    ported_deeds = {
        "https://creativecommons.org/licenses/by-sa/3.0/de/deed.en": "CC-BY-SA-3.0-DE",
        "https://creativecommons.org/licenses/by-sa/3.0/de/legalcode": "CC-BY-SA-3.0-DE",
        "https://creativecommons.org/licenses/by-sa/3.0/ee/deed.en": "CC-BY-SA-3.0-EE",
        "https://creativecommons.org/licenses/by/3.0/pl/deed.en": "CC-BY-3.0-PL",
        "https://creativecommons.org/licenses/by/3.0/br/deed.pt": "CC-BY-3.0-BR",
        "https://creativecommons.org/licenses/by/2.5/au/deed.en": "CC-BY-2.5-AU",
    }
    for deed_url, expected_code in ported_deeds.items():
        canonical = canonical_license_url(deed_url)
        assert LICENSE_URL_TO_CODE[canonical.rstrip("/")] == expected_code
        assert canonical == ALLOWED_LICENSES[expected_code][1]
    assert canonical_license_url("https://creativecommons.org/licenses/by/3.0/deed.en") == ALLOWED_LICENSES["CC-BY-3.0"][1]
    assert canonical_license_url("https://example.invalid/licenses/by/3.0/pl/deed.en") == ""
    creator_fixture = (
        '<td id="fileinfotpl&#95;aut">Author</td><td><div class="commons-creator">'
        '<style>.mw-parser-output .creator{background-image:url("https://example.invalid/x")}</style>'
        '<span class="fn" id="creator"><bdi>Verified Creator</bdi></span></div></td></tr>'
        '<tr><td id="fileinfotpl&#95;perm">Permission</td>'
    )
    assert extract_file_author(creator_fixture) == "Verified Creator"
    assert not safe_author_text(".mw-parser-output { background-image:url(https://example.invalid) }")
    assert not safe_author_text("A" * (AUTHOR_MAX_LENGTH + 1))
    def geo_fixture(title: str, categories: list[str]) -> str:
        conf = {"wgTitle": title, "wgPageName": f"File:{title}", "wgCategories": categories}
        return f"<script>RLCONF={json.dumps(conf)};\nRLSTATE={{}}</script>"

    negative_geographies = [
        (
            {"id": "city-delhi", "cityEn": "Delhi", "countryEn": "India"},
            "File:Madrid más internacional también en La India 02.jpg",
            geo_fixture("Madrid más internacional también en La India 02.jpg", ["Madrid", "Spain"]),
        ),
        (
            {"id": "city-trujillo-peru", "cityEn": "Trujillo", "countryEn": "Peru"},
            "File:Trujillo panorâmica.jpg",
            geo_fixture("Trujillo panorâmica.jpg", ["Panoramas of Trujillo (Spain)", "Cáceres"]),
        ),
        (
            {"id": "city-victoria-bc", "cityEn": "Victoria", "countryEn": "Canada"},
            "File:Victoria Harbour from Victoria Peak.jpg",
            geo_fixture("Victoria Harbour from Victoria Peak.jpg", ["Victoria Harbour, Hong Kong", "Hong Kong"]),
        ),
        (
            {"id": "city-asuncion", "cityEn": "Asunción", "countryEn": "Paraguay"},
            "File:San Francisco Church, Córdoba.jpg",
            geo_fixture("San Francisco Church, Córdoba.jpg", ["Córdoba, Argentina", "Argentina"]),
        ),
    ]
    for city, title, document in negative_geographies:
        assert geography_signals(city, {"title": title, "snippet": ""}, document)["geographicGatePassed"] is False
    review_candidate = {
        "id": "city-test",
        "selected": {
            "fileTitle": "File:Test City skyline.jpg",
            "sourceMetadataSha256": "B" * 64,
            "staged": {"sha256": "A" * 64},
        },
    }
    review_snapshot = {
        "fileTitle": "File:Test City skyline.jpg",
        "visualSha256": "A" * 64,
        "stagedSha256": "A" * 64,
        "sourceMetadataSha256": "B" * 64,
        "contactSheetSourceManifestSha256": "C" * 64,
    }
    validate_review_binding(review_candidate, review_snapshot, "C" * 64)
    replaced_candidate = json.loads(json.dumps(review_candidate))
    replaced_candidate["selected"]["staged"]["sha256"] = "D" * 64
    try:
        validate_review_binding(replaced_candidate, review_snapshot, "C" * 64)
    except ValueError:
        pass
    else:
        raise AssertionError("a review for replaced staged pixels must be rejected")
    (ROOT / "test-results").mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=ROOT / "test-results") as directory:
        target = Path(directory) / "test.webp"
        image = Image.new("RGB", (1200, 800), "#123456")
        source = io.BytesIO()
        image.save(source, format="PNG")
        metadata = render_webp(source.getvalue(), target)
        assert metadata["width"] == 960 and metadata["height"] == 540
        assert SHA256.fullmatch(metadata["sha256"])
    print("city Commons pipeline self-test: PASS (geography negatives; stale-review rejection)")


def discover(args: argparse.Namespace) -> None:
    cities = load_cities()
    if args.replace_staged and not args.city:
        raise ValueError("--replace-staged requires at least one explicit --city ID")
    if args.file_title and (not args.city or len(args.city) != 1 or not args.file_title.startswith("File:")):
        raise ValueError("--file-title requires exactly one --city and an exact File: title")
    if args.city:
        wanted = set(args.city)
        unknown = wanted - {city["id"] for city in cities}
        if unknown:
            raise ValueError(f"unknown city IDs: {sorted(unknown)}")
        cities = [city for city in cities if city["id"] in wanted]
    prior_items: dict[str, dict[str, Any]] = {}
    if CANDIDATES_FILE.exists():
        prior = load_json(CANDIDATES_FILE)
        prior_items = {item["id"]: item for item in prior.get("items", [])}
    target_ids = {city["id"] for city in cities}
    if not args.refresh and not args.replace_staged:
        cities = [city for city in cities if prior_items.get(city["id"], {}).get("status") != "staged-awaiting-visual-review"]
    fetcher = Fetcher(args.retries, args.timeout, args.pause, args.image_interval, args.rate_limit_cooldown)
    total = len(cities)
    completed = 0
    lock = threading.Lock()

    def task(city: dict[str, Any]) -> dict[str, Any]:
        return discover_city(
            city,
            fetcher,
            args.refresh,
            args.max_file_pages,
            args.query_style,
            args.candidate_offset,
            args.file_title,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {executor.submit(task, city): city for city in cities}
        for future in concurrent.futures.as_completed(futures):
            city = futures[future]
            try:
                result = future.result()
            except Exception as exc:
                result = unresolved(city, "", "", [], f"unexpected:{type(exc).__name__}:{exc}")
            with lock:
                prior_items[result["id"]] = result
                completed += 1
                print(f"[{completed}/{total}] {result['id']}: {result['status']}", flush=True)
                # Checkpoint after every city; missing untouched cities stay explicit unresolved.
                all_cities = load_cities()
                for missing in all_cities:
                    if missing["id"] not in prior_items:
                        prior_items[missing["id"]] = unresolved(missing, "", "", [], "not-yet-run")
                write_candidates(prior_items)
    if not target_ids and total == 0:
        print("nothing to fetch; all requested cities already staged")
    summary = validate_outputs(require_geography=False)
    pages = build_contact_sheets()
    print(f"staged={summary['staged']} unresolved={summary['unresolved']} contactSheets={len(pages)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    fetch = sub.add_parser("discover", help="discover and stage city image candidates")
    fetch.add_argument("--city", action="append", help="stable city ID; repeatable")
    fetch.add_argument("--concurrency", type=int, default=3, choices=range(1, 7))
    fetch.add_argument("--retries", type=int, default=3, choices=range(1, 6))
    fetch.add_argument("--timeout", type=float, default=35.0)
    fetch.add_argument("--pause", type=float, default=0.15)
    fetch.add_argument("--image-interval", type=float, default=1.5, help="minimum seconds between upload.wikimedia.org requests across all workers")
    fetch.add_argument("--rate-limit-cooldown", type=float, default=45.0, help="base global host cooldown after HTTP 429")
    fetch.add_argument("--max-file-pages", type=int, default=6, choices=range(1, 11))
    fetch.add_argument("--query-style", choices=["cityscape", "panorama", "skyline", "view", "old-town", "aerial", "waterfront", "place"], default="cityscape")
    fetch.add_argument("--candidate-offset", type=int, default=0, choices=range(0, 21), help="skip this many ranked landscape results before file-level review")
    fetch.add_argument("--file-title", help="exact File: title from the selected public MediaSearch page; requires one --city")
    fetch.add_argument("--refresh", action="store_true", help="replace frozen evidence for requested cities")
    fetch.add_argument("--replace-staged", action="store_true", help="re-run explicitly requested staged cities with another query style")
    check = sub.add_parser("validate", help="validate local audit and staged files without network")
    check.add_argument("--require-complete", action="store_true")
    sub.add_parser("contact-sheets", help="rebuild visual-review contact sheets")
    reviews = sub.add_parser("finalize-reviews", help="bind 200 approvals to a confirmed current contact-sheet snapshot")
    reviews.add_argument("--confirmed-source-sha256", required=True, help="sourceManifestSha256 shown in the reviewed contact-sheet index")
    reviews.add_argument("--apply", action="store_true", help="atomically replace the review file")
    repair = sub.add_parser("repair-attribution", help="reparse author credit from frozen matching File-page evidence")
    repair.add_argument("--apply", action="store_true", help="atomically update the candidate audit after full validation")
    sub.add_parser("audit-geography", help="audit selected city geography against frozen File-page metadata")
    promote = sub.add_parser("promote", help="generate reviewed override payload and copy approved files")
    promote.add_argument("--apply", action="store_true", help="atomically publish the exact 200 reviewed city files and manifests")
    sub.add_parser("self-test", help="run deterministic parser/image smoke tests")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "discover":
        discover(args)
    elif args.command == "validate":
        print(json.dumps(validate_outputs(args.require_complete), ensure_ascii=False))
    elif args.command == "contact-sheets":
        pages = build_contact_sheets()
        print(f"contact sheets: {len(pages)}")
    elif args.command == "finalize-reviews":
        payload = finalize_reviews(args.confirmed_source_sha256, args.apply)
        print(f"bound reviews: {len(payload['items'])}; applied={args.apply}")
    elif args.command == "repair-attribution":
        print(json.dumps(repair_attribution(args.apply), ensure_ascii=False))
    elif args.command == "audit-geography":
        print(json.dumps(audit_geography(), ensure_ascii=False, indent=2))
    elif args.command == "promote":
        payload = generate_overrides(args.apply)
        print(f"approved overrides: {len(payload['items'])}; applied={args.apply}")
    elif args.command == "self-test":
        self_test()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
