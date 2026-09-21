#!/usr/bin/env python3
"""Иконки iOS только с названием PADEL / MAGAS на сплошном поле."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "design" / "icon-alts" / "wordmark"
FONTS = ROOT / "design" / "icon-alts" / "fonts"
UI = ROOT / "mobile" / "assets" / "fonts" / "Inter-SemiBold.ttf"

SIZE = 1024
LIME = (198, 240, 51)       # #C6F033
INK = (11, 15, 12)          # #0B0F0C
WHITE = (247, 248, 244)
DEEP = (27, 94, 32)         # #1B5E20 — заливка щита
ON_WHITE = (14, 42, 18)


def font(path: Path, px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), px)


def ui(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(UI), px)


def render_line(text: str, fnt: ImageFont.FreeTypeFont, fill, tracking: float = 0) -> Image.Image:
    dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    widths = [dummy.textlength(ch, font=fnt) for ch in text]
    ascent, descent = fnt.getmetrics()
    pad = 16
    w = int(sum(widths) + tracking * max(len(text) - 1, 0) + pad * 2)
    h = int(ascent + descent + pad * 2)
    im = Image.new("RGBA", (max(w, 1), max(h, 1)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = pad
    for i, ch in enumerate(text):
        d.text((x, pad), ch, font=fnt, fill=fill)
        x += widths[i] + tracking
    return crop_alpha(im)


def crop_alpha(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


def italicize(im: Image.Image, k: float = 0.16) -> Image.Image:
    w, h = im.size
    extra = int(abs(k) * h) + 2
    # Наклон как у PADEL на щите: верх вправо.
    out = im.transform(
        (w + extra, h),
        Image.AFFINE,
        (1, k, -k * h, 0, 1, 0),
        resample=Image.BICUBIC,
        fillcolor=(0, 0, 0, 0),
    )
    return crop_alpha(out)


def stack(lines: list[Image.Image], gap: int) -> Image.Image:
    w = max(im.width for im in lines)
    h = sum(im.height for im in lines) + gap * (len(lines) - 1)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y = 0
    for im in lines:
        canvas.alpha_composite(im, ((w - im.width) // 2, y))
        y += im.height + gap
    return canvas


def tracked_to_width(text: str, path: Path, px: int, fill, target: int) -> Image.Image:
    """Вразрядку, пока обрезанная ширина строки не совпадёт с якорем."""
    fnt = font(path, px)
    lo, hi = 0.0, 120.0
    best = render_line(text, fnt, fill, 0)
    if best.width >= target:
        return best
    for _ in range(18):
        mid = (lo + hi) / 2
        im = render_line(text, fnt, fill, mid)
        best = im
        if im.width < target:
            lo = mid
        else:
            hi = mid
    return best


def place(bg: tuple, mark: Image.Image, max_w=0.78, max_h=0.62, y_nudge=0) -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (*bg, 255))
    scale = min((SIZE * max_w) / mark.width, (SIZE * max_h) / mark.height, 1.0)
    if scale != 1:
        nw, nh = max(1, round(mark.width * scale)), max(1, round(mark.height * scale))
        mark = mark.resize((nw, nh), Image.LANCZOS)
    x = (SIZE - mark.width) // 2
    y = (SIZE - mark.height) // 2 + y_nudge
    canvas.alpha_composite(mark, (x, y))
    return canvas.convert("RGB")


def lockup_equal(path: Path, px: int, fill, gap: int) -> Image.Image:
    """Две строки одной ширины — как табличка на джерси."""
    magas = render_line("MAGAS", font(path, px), fill)
    padel = tracked_to_width("PADEL", path, px, fill, magas.width)
    return stack([padel, magas], gap)


def lockup_crest(path_bold: Path, path_mid: Path) -> Image.Image:
    padel = italicize(render_line("PADEL", font(path_bold, 300), (245, 247, 242)))
    magas = tracked_to_width("MAGAS", path_mid, 148, LIME, padel.width)
    return stack([padel, magas], 26)


def lockup_hero(path_bold: Path, path_mid: Path, padel_fill, magas_fill) -> Image.Image:
    padel = render_line("PADEL", font(path_mid, 112), padel_fill, tracking=20)
    magas = render_line("MAGAS", font(path_bold, 300), magas_fill, tracking=-8)
    return stack([padel, magas], 14)


def squircle_mask(size: int, n: float = 4.8) -> Image.Image:
    coords = np.linspace(-1.0, 1.0, size)
    x, y = np.meshgrid(coords, coords)
    d = np.abs(x) ** n + np.abs(y) ** n
    alpha = np.clip((1.015 - d) / 0.05, 0, 1)
    return Image.fromarray((alpha * 255).astype(np.uint8), "L")


def as_squircle(im: Image.Image, size: int) -> Image.Image:
    icon = im.resize((size, size), Image.LANCZOS).convert("RGBA")
    icon.putalpha(squircle_mask(size))
    return icon


def icon_shadow(size: int) -> Image.Image:
    from PIL import ImageFilter
    m = squircle_mask(size)
    pad = 28
    layer = Image.new("RGBA", (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
    blob = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    blob.putalpha(m.point(lambda p: int(p * 0.38)))
    layer.alpha_composite(blob, (pad, pad + 6))
    return layer.filter(ImageFilter.GaussianBlur(10))


def board(icons: list[tuple[str, Image.Image]]) -> Image.Image:
    w, h = 1680, 980
    bg = Image.new("RGB", (w, h), (6, 48, 62))
    px = np.asarray(bg).astype(np.float32)
    yy, xx = np.ogrid[:h, :w]
    glow = np.exp(-((xx - w / 2) ** 2 + (yy - h * 0.42) ** 2) / (2 * 520 ** 2))
    px += np.stack([glow * 10, glow * 22, glow * 18], axis=-1)
    canvas = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    title = "Только название — без герба"
    sub = "PADEL / MAGAS, как на щите и в приложении. Сплошное поле."
    tw = draw.textlength(title, font=ui(36))
    draw.text(((w - tw) / 2, 48), title, fill=(236, 244, 232), font=ui(36))
    sw = draw.textlength(sub, font=ui(20))
    draw.text(((w - sw) / 2, 100), sub, fill=(156, 184, 176), font=ui(20))

    large = 280
    gap = (w - large * 4) / 5
    y = 170
    for i, (label, im) in enumerate(icons):
        x = int(gap + i * (large + gap))
        sh = icon_shadow(large)
        canvas.alpha_composite(sh, (x - 28, y - 22))
        canvas.alpha_composite(as_squircle(im, large), (x, y))
        lw = draw.textlength(label, font=ui(22))
        draw.text((x + (large - lw) / 2, y + large + 28), label, fill=(230, 238, 226), font=ui(22))

    small = 120
    caption = "Так будет выглядеть на домашнем экране"
    cw = draw.textlength(caption, font=ui(16))
    draw.text(((w - cw) / 2, 620), caption, fill=(130, 160, 154), font=ui(16))
    total = small * 4 + 36 * 3
    sx0 = (w - total) // 2
    sy = 668
    for i, (label, im) in enumerate(icons):
        x = sx0 + i * (small + 36)
        canvas.alpha_composite(icon_shadow(small), (x - 28, sy - 22))
        canvas.alpha_composite(as_squircle(im, small), (x, sy))
        lw = draw.textlength(label, font=ui(14))
        draw.text((x + (small - lw) / 2, sy + small + 16), label, fill=(176, 196, 188), font=ui(14))
    return canvas.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bold = FONTS / "Oswald-Bold.ttf"
    medium = FONTS / "Oswald-Medium.ttf"

    lime = place(LIME, lockup_equal(bold, 280, INK, 10), max_w=0.84, max_h=0.66, y_nudge=-6)
    crest = place(INK, lockup_crest(bold, medium), max_w=0.82, max_h=0.66, y_nudge=-4)
    white = place(WHITE, lockup_equal(bold, 280, ON_WHITE, 10), max_w=0.84, max_h=0.66, y_nudge=-6)
    hero = place(DEEP, lockup_hero(bold, medium, LIME, WHITE), max_w=0.86, max_h=0.64, y_nudge=-2)

    names = [
        ("01-lime-stack.png", lime, "Лаймовый блок"),
        ("02-crest-type.png", crest, "Буквы со щита"),
        ("03-white-stack.png", white, "Белое поле"),
        ("04-magas-hero.png", hero, "MAGAS крупно"),
    ]
    for fname, im, _ in names:
        im.save(OUT / fname)
        as_squircle(im, 512).save(OUT / f"preview-{fname}")

    sheet = board([(label, im) for _, im, label in names])
    sheet.save(OUT / "comparison.png", quality=95)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
