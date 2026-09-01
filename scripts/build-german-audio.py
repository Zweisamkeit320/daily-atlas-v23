#!/usr/bin/env python3
"""Build the 500 bundled German example narrations with a fixed Piper voice.

This script deliberately keeps the model/runtime outside the distributable app.
Pass their paths explicitly so the checked-in MP3 files remain auditable and
rebuildable; Piper/MP3 generation is not claimed to be byte-deterministic across
separate runs. The app does not need to ship the inference runtime or model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
GERMAN_PATH = ROOT / "data" / "raw" / "german500.json"
OUTPUT_DIR = ROOT / "assets" / "audio" / "german"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
ASSET_SNAPSHOT_AT = "2026-08-24"
EXPECTED_MODEL_SHA256 = "E88CF290FBFB768BF111330D2E8A46E376B0D85E3423A28BFEBBC863A260DAD8"
EXPECTED_CONFIG_SHA256 = "EF14B3DCB279AB4B18422A7A132877BEE7A148821BD91152FB7AE9C4B3D79625"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest().upper()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def load_lessons() -> list[dict]:
    lessons = json.loads(GERMAN_PATH.read_text(encoding="utf-8"))
    if not isinstance(lessons, list) or len(lessons) != 500:
        raise ValueError("german500.json must contain exactly 500 lessons")
    ids = [str(item.get("id", "")) for item in lessons]
    if len(set(ids)) != 500 or any(not re.fullmatch(r"de-[a-z0-9-]+", item_id) for item_id in ids):
        raise ValueError("German lesson IDs must be unique safe de-* identifiers")
    for item in lessons:
        sentence = str(item.get("exampleGerman", "")).strip()
        if not sentence:
            raise ValueError(f"{item['id']} has no exampleGerman")
    return lessons


def build_manifest(items: list[dict], model_path: Path, config_path: Path) -> dict:
    return {
        "schemaVersion": 1,
        "assetSnapshotAt": ASSET_SNAPSHOT_AT,
        "voice": {
            "engine": "Piper 1.6.0",
            "model": "de_DE-eva_k-x_low",
            "language": "de-DE",
            "speakerCount": 1,
            "speakerPresentation": "female",
            "quality": "x_low",
            "sampleRate": 16000,
            "modelSha256": sha256_file(model_path),
            "configSha256": sha256_file(config_path),
            "modelCard": "https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/eva_k/x_low/MODEL_CARD",
            "modelRepository": "https://huggingface.co/rhasspy/piper-voices/tree/main/de/de_DE/eva_k/x_low",
            "speakerEvidence": "https://www.isca-archive.org/interspeech_2019/chen19f_interspeech.pdf",
            "datasetLicense": "M-AILABS BSD-style data license; local notice retained in LICENSE-M-AILABS.txt"
        },
        "encoding": {
            "container": "MPEG audio layer III",
            "bitRateKbps": 48,
            "channels": 1,
            "sourceSampleRate": 16000
        },
        "durationBasis": "durationMs is computed from pre-encoding PCM sample count and is not the exact decoded MP3 playback duration",
        "phonemeNormalization": "Unicode NFC (joins decomposed IPA marks such as c + cedilla before ID lookup)",
        "source": {
            "lessons": "../../../data/raw/german500.json",
            "lessonsSha256": sha256_file(GERMAN_PATH),
            "field": "exampleGerman"
        },
        "count": len(items),
        "totalBytes": sum(item["bytes"] for item in items),
        "totalDurationMs": sum(item["durationMs"] for item in items),
        "items": items
    }


def validate_existing(lessons: list[dict], model_path: Path, config_path: Path) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("count") != 500 or len(manifest.get("items", [])) != 500:
        raise ValueError("audio manifest does not contain exactly 500 items")
    expected_ids = [item["id"] for item in lessons]
    actual_ids = [item.get("id") for item in manifest["items"]]
    if actual_ids != expected_ids:
        raise ValueError("audio manifest order/IDs do not match german500.json")
    if manifest["source"]["lessonsSha256"] != sha256_file(GERMAN_PATH):
        raise ValueError("audio manifest points to a different German lesson pool")
    if manifest["voice"]["modelSha256"] != sha256_file(model_path):
        raise ValueError("audio manifest model hash mismatch")
    if manifest["voice"]["configSha256"] != sha256_file(config_path):
        raise ValueError("audio manifest config hash mismatch")
    for lesson, entry in zip(lessons, manifest["items"]):
        sentence = lesson["exampleGerman"].strip()
        if entry.get("textSha256") != sha256_bytes(sentence.encode("utf-8")):
            raise ValueError(f"text hash mismatch for {lesson['id']}")
        audio_path = ROOT / entry["path"]
        if not audio_path.is_file() or audio_path.stat().st_size != entry.get("bytes"):
            raise ValueError(f"audio file missing/size mismatch for {lesson['id']}")
        if sha256_file(audio_path) != entry.get("sha256"):
            raise ValueError(f"audio hash mismatch for {lesson['id']}")
        if not (250 <= int(entry.get("durationMs", 0)) <= 30000):
            raise ValueError(f"implausible audio duration for {lesson['id']}")
    print(f"PASS: verified {len(lessons)} bundled German narrations")


def reusable_entries(model_path: Path, config_path: Path) -> dict[str, dict]:
    """Return only locally verified entries made with the same fixed voice."""
    if not MANIFEST_PATH.is_file():
        return {}
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    voice = manifest.get("voice", {})
    if voice.get("modelSha256") != sha256_file(model_path):
        return {}
    if voice.get("configSha256") != sha256_file(config_path):
        return {}
    reusable: dict[str, dict] = {}
    for entry in manifest.get("items", []):
        item_id = str(entry.get("id", ""))
        expected_path = f"assets/audio/german/{item_id}.mp3"
        audio_path = ROOT / expected_path
        if entry.get("path") != expected_path or not audio_path.is_file():
            continue
        if audio_path.stat().st_size != entry.get("bytes"):
            continue
        if sha256_file(audio_path) != entry.get("sha256"):
            continue
        if not (250 <= int(entry.get("durationMs", 0)) <= 30000):
            continue
        reusable[item_id] = entry
    return reusable


def synthesize_entry(lesson: dict, voice: object, synthesis: object, lameenc: object) -> dict:
    sentence = lesson["exampleGerman"].strip()
    pcm_parts: list[bytes] = []
    sample_count = 0
    sample_rate = 16000
    for chunk in voice.synthesize(sentence, syn_config=synthesis):
        pcm_parts.append(chunk.audio_int16_bytes)
        sample_count += len(chunk.audio_int16_bytes) // 2
        sample_rate = chunk.sample_rate
    pcm = b"".join(pcm_parts)
    if not pcm:
        raise ValueError(f"Piper produced no audio for {lesson['id']}")
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(48)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(2)
    mp3 = encoder.encode(pcm) + encoder.flush()
    relative_path = f"assets/audio/german/{lesson['id']}.mp3"
    output_path = ROOT / relative_path
    output_path.write_bytes(mp3)
    return {
        "id": lesson["id"],
        "path": relative_path,
        "textSha256": sha256_bytes(sentence.encode("utf-8")),
        "sha256": sha256_bytes(mp3),
        "bytes": len(mp3),
        "durationMs": round(sample_count * 1000 / sample_rate),
    }


def generate(lessons: list[dict], model_path: Path, config_path: Path) -> None:
    verified = reusable_entries(model_path, config_path)
    reusable: dict[str, dict] = {}
    for lesson in lessons:
        entry = verified.get(lesson["id"])
        sentence_hash = sha256_bytes(lesson["exampleGerman"].strip().encode("utf-8"))
        if entry and entry.get("textSha256") == sentence_hash:
            reusable[lesson["id"]] = entry

    missing = [lesson for lesson in lessons if lesson["id"] not in reusable]
    if missing:
        try:
            import lameenc  # type: ignore
            from piper import PiperVoice, SynthesisConfig  # type: ignore
        except ImportError as error:
            raise SystemExit(
                f"{len(missing)} narration(s) need generation; install "
                "piper-tts==1.6.0 and lameenc==1.8.1, or place them on PYTHONPATH"
            ) from error

        voice = PiperVoice.load(str(model_path), config_path=str(config_path), use_cuda=False)
        original_phonemize = voice.phonemize

        # Current espeak-ng may return some IPA symbols in decomposed form while
        # this frozen voice's ID map uses their NFC form (notably c + U+0327 -> ç).
        # Normalizing before ID lookup avoids silently dropping the distinction.
        def nfc_phonemize(text: str) -> list[list[str]]:
            return [list(unicodedata.normalize("NFC", "".join(sentence))) for sentence in original_phonemize(text)]

        voice.phonemize = nfc_phonemize  # type: ignore[method-assign]
        synthesis = SynthesisConfig(
            length_scale=1.0,
            noise_scale=0.667,
            noise_w_scale=0.8,
            normalize_audio=True,
            volume=0.9,
        )
    else:
        voice = synthesis = lameenc = None

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []
    generated_count = 0
    for position, lesson in enumerate(lessons, start=1):
        entry = reusable.get(lesson["id"])
        if entry:
            items.append(entry)
        else:
            items.append(synthesize_entry(lesson, voice, synthesis, lameenc))
            generated_count += 1
        if position % 25 == 0:
            print(f"processed {position}/{len(lessons)}")

    manifest = build_manifest(items, model_path, config_path)
    MANIFEST_PATH.write_text(canonical_json(manifest), encoding="utf-8", newline="\n")
    print(f"reused {len(reusable)}, generated {generated_count}")
    validate_existing(lessons, model_path, config_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    model_path = args.model.resolve()
    config_path = args.config.resolve()
    if not model_path.is_file() or not config_path.is_file():
        raise SystemExit("Piper model/config file is missing")
    if sha256_file(model_path) != EXPECTED_MODEL_SHA256:
        raise SystemExit("Unexpected Piper model SHA-256")
    if sha256_file(config_path) != EXPECTED_CONFIG_SHA256:
        raise SystemExit("Unexpected Piper config SHA-256")
    lessons = load_lessons()
    if args.check:
        validate_existing(lessons, model_path, config_path)
    else:
        generate(lessons, model_path, config_path)


if __name__ == "__main__":
    main()
