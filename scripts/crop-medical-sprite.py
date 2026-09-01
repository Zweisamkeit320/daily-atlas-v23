from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "medical" / "medical-themes-sprite.png"
OUTPUT = ROOT / "assets" / "medical"

CROPS = {
    "sleep": (27, 26, 505, 500),
    "activity": (530, 26, 1005, 500),
    "nutrition": (1031, 26, 1510, 500),
    "immunity": (27, 524, 505, 995),
    "brain": (530, 524, 1005, 995),
    "emergency": (1031, 524, 1510, 995),
}


def main() -> None:
    with Image.open(SOURCE) as image:
        for name, bounds in CROPS.items():
            panel = image.crop(bounds)
            panel.save(OUTPUT / f"{name}.webp", "WEBP", quality=88, method=6)


if __name__ == "__main__":
    main()
