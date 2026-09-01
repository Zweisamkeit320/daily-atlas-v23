"""Build or verify 480x270 city derivatives for mobile and weak networks."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "visuals" / "cities"
OUTPUT_DIR = ROOT / "assets" / "visuals" / "cities-mobile"
SOURCE_MANIFEST = SOURCE_DIR / "manifest.json"
OUTPUT_MANIFEST = OUTPUT_DIR / "manifest.json"
OUTPUT_SCRIPT = OUTPUT_DIR / "manifest.js"
SIZE = (480, 270)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def expected_items() -> list[dict[str, object]]:
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    if source.get("schemaVersion") != 1 or source.get("count") != 200 or len(source.get("items", [])) != 200:
        raise RuntimeError("source city manifest must contain exactly 200 reviewed items")
    items: list[dict[str, object]] = []
    for entry in source["items"]:
        city_id = str(entry.get("id", ""))
        if not city_id.startswith("city-"):
            raise RuntimeError(f"invalid city id: {city_id}")
        source_path = SOURCE_DIR / f"{city_id}.webp"
        output_path = OUTPUT_DIR / f"{city_id}.webp"
        if not source_path.is_file() or not output_path.is_file():
            raise RuntimeError(f"missing city image: {city_id}")
        with Image.open(output_path) as image:
            if image.size != SIZE or image.format != "WEBP":
                raise RuntimeError(f"invalid mobile city derivative: {city_id} {image.size} {image.format}")
        items.append({
            "id": city_id,
            "path": f"./assets/visuals/cities-mobile/{city_id}.webp",
            "sourcePath": f"./assets/visuals/cities/{city_id}.webp",
            "sourceSha256": sha256(source_path),
            "sha256": sha256(output_path),
            "bytes": output_path.stat().st_size,
            "width": SIZE[0],
            "height": SIZE[1],
        })
    return items


def render_manifest(items: list[dict[str, object]]) -> str:
    payload = {"schemaVersion": 1, "count": len(items), "items": items}
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def render_script(manifest_text: str) -> str:
    compact = json.dumps(json.loads(manifest_text), ensure_ascii=False, separators=(",", ":"))
    return f"globalThis.DAILY_ATLAS_CITY_MOBILE_VISUALS = Object.freeze({compact});\n"


def build() -> None:
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    expected_ids = {str(entry["id"]) for entry in source["items"]}
    for existing in OUTPUT_DIR.glob("city-*.webp"):
        if existing.stem not in expected_ids:
            raise RuntimeError(f"unexpected derivative refuses overwrite cleanup: {existing.name}")
    for entry in source["items"]:
        city_id = str(entry["id"])
        source_path = SOURCE_DIR / f"{city_id}.webp"
        output_path = OUTPUT_DIR / f"{city_id}.webp"
        with Image.open(source_path) as image:
            converted = image.convert("RGB")
            if converted.size != SIZE:
                converted = converted.resize(SIZE, Image.Resampling.LANCZOS)
            converted.save(output_path, "WEBP", quality=82, method=6, exact=True)
    items = expected_items()
    manifest_text = render_manifest(items)
    OUTPUT_MANIFEST.write_text(manifest_text, encoding="utf-8", newline="\n")
    OUTPUT_SCRIPT.write_text(render_script(manifest_text), encoding="utf-8", newline="\n")


def check() -> None:
    items = expected_items()
    expected_json = render_manifest(items)
    expected_js = render_script(expected_json)
    if OUTPUT_MANIFEST.read_text(encoding="utf-8") != expected_json:
        raise RuntimeError("mobile city manifest is stale")
    if OUTPUT_SCRIPT.read_text(encoding="utf-8") != expected_js:
        raise RuntimeError("mobile city script manifest is stale")
    files = sorted(OUTPUT_DIR.glob("city-*.webp"))
    if len(files) != 200:
        raise RuntimeError(f"expected 200 mobile city derivatives, found {len(files)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        check()
        print("PASS: 200 mobile city derivatives match the reviewed 960x540 source set")
    else:
        build()
        print("PASS: built 200 mobile city derivatives at 480x270")


if __name__ == "__main__":
    main()
