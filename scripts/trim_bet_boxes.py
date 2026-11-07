"""Trim football bet_box PNGs and make near-black pixels transparent."""
from pathlib import Path

from PIL import Image

SRC_DIR = Path(r"d:\game\api-games\public\football")
MULTIPLIERS = [2, 5, 8, 18, 20, 30, 50, 66, 88, 100]
BLACK_THRESH = 28


def process(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r <= BLACK_THRESH and g <= BLACK_THRESH and b <= BLACK_THRESH:
                pixels[x, y] = (0, 0, 0, 0)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    return img


def main() -> None:
    for m in MULTIPLIERS:
        long_name = SRC_DIR / f"d__game_api-games_public_football_bet_box_x{m}.png"
        short_name = SRC_DIR / f"bet_box_x{m}.png"
        src = long_name if long_name.exists() else short_name
        if not src.exists():
            print("MISSING", m)
            continue
        with Image.open(src) as im:
            out = process(im)
            out.save(short_name, "PNG")
            print(f"x{m}: {im.size} -> {out.size}  -> {short_name.name}")
    print("done")


if __name__ == "__main__":
    main()
