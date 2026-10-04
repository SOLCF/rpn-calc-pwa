"""Generate PWA icons. Run: py tools/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "icons"
BG = (11, 13, 18)
PANEL = (29, 34, 45)
HEX = (255, 170, 60)
TXT = (238, 240, 244)
BIN = (230, 120, 230)
FONT = "C:/Windows/Fonts/consolab.ttf"


def draw(size: int, maskable: bool) -> Image.Image:
    s = 4  # supersample
    n = size * s
    img = Image.new("RGB", (n, n), BG)
    d = ImageDraw.Draw(img)
    # Maskable icons must keep content inside the central 80% circle.
    pad = int(n * (0.2 if maskable else 0.06))
    if not maskable:
        img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG)
    inner = n - 2 * pad
    big = ImageFont.truetype(FONT, int(inner * 0.42))
    small = ImageFont.truetype(FONT, int(inner * 0.17))
    cx = n // 2
    d.text((cx, pad + inner * 0.36), "0x", font=big, fill=HEX, anchor="mm")
    d.text((cx, pad + inner * 0.70), "RPN", font=small, fill=TXT, anchor="mm")
    # a row of bits as a small accent
    bw = inner * 0.09
    y = pad + inner * 0.86
    for i, on in enumerate([1, 0, 1, 1, 0, 1]):
        x0 = cx - 3 * bw * 1.25 + i * bw * 1.25
        d.rounded_rectangle([x0, y, x0 + bw, y + bw * 0.55], radius=int(bw * 0.15),
                            fill=BIN if on else PANEL)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw(192, False).save(OUT / "icon-192.png")
draw(512, False).save(OUT / "icon-512.png")
draw(512, True).save(OUT / "maskable-512.png")
print("icons written to", OUT)
