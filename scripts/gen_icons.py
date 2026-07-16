#!/usr/bin/env python3
"""Generate SSH Command Center PWA icons (blueprint theme)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

NAVY = (6, 14, 28)
NAVY2 = (10, 21, 38)
GRID = (120, 170, 230)
AMBER = (255, 176, 32)
INK = (231, 238, 251)


def find_font(size, bold=True):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def draw_icon(size, maskable=False):
    img = Image.new("RGB", (size, size), NAVY)
    d = ImageDraw.Draw(img, "RGBA")
    pad = int(size * 0.14) if maskable else 0

    # subtle grid
    step = max(8, size // 16)
    for x in range(0, size, step):
        d.line([(x, 0), (x, size)], fill=GRID + (16,), width=1)
    for y in range(0, size, step):
        d.line([(0, y), (size, y)], fill=GRID + (16,), width=1)

    # amber frame (crosshair blueprint feel)
    inset = pad + int(size * 0.10)
    d.rectangle([inset, inset, size - inset, size - inset],
                outline=AMBER + (230,), width=max(2, size // 90))
    # corner ticks
    t = int(size * 0.06)
    for cx, cy in [(inset, inset), (size - inset, inset), (inset, size - inset), (size - inset, size - inset)]:
        d.line([(cx - t, cy), (cx + t, cy)], fill=AMBER, width=max(2, size // 120))
        d.line([(cx, cy - t), (cx, cy + t)], fill=AMBER, width=max(2, size // 120))

    # monogram
    font = find_font(int(size * 0.30))
    text = "SSH"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - int(size*0.02)),
           text, font=font, fill=AMBER)

    # small label
    lfont = find_font(int(size * 0.075))
    label = "COMMAND CENTER"
    lb = d.textbbox((0, 0), label, font=lfont)
    lw = lb[2] - lb[0]
    d.text(((size - lw) / 2 - lb[0], size * 0.66), label, font=lfont, fill=INK + (200,))
    return img


def main():
    draw_icon(192).save(os.path.join(OUT, "icon-192.png"))
    draw_icon(512).save(os.path.join(OUT, "icon-512.png"))
    draw_icon(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
    draw_icon(180).save(os.path.join(OUT, "apple-touch-icon.png"))
    print("Icons written to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
