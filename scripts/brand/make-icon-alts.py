#!/usr/bin/env python3
"""Альтернативные иконки iOS: тот же логотип, другие фоны."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
LOGO = ROOT / "mobile" / "assets" / "img" / "logo.png"
CURRENT = ROOT / "mobile" / "assets" / "icon.png"
OUT = ROOT / "design" / "icon-alts"
FONT = ROOT / "mobile" / "assets" / "fonts" / "Inter-SemiBold.ttf"
ASSETS = Path("/root/.cursor/projects/root-projects-Magas-Paddle/assets")

SIZE = 1024
FILL = 0.88


def load_bg(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)


def lift_vignette(im: Image.Image, strength: float = 0.38, power: float = 1.45) -> Image.Image:
    """Смягчает тёмную рамку, которую модель рисует по углам."""
    rgb = np.asarray(im).astype(np.float32)
    h, w = rgb.shape[:2]
    y, x = np.ogrid[:h, :w]
    r = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2)
    r = np.clip(r, 0, 1) ** power
    sample = rgb[h // 2 - 40 : h // 2 + 40, w // 2 - 40 : w // 2 + 40].mean(axis=(0, 1))
    lift = (r * strength)[..., None]
    out = rgb * (1 - lift) + sample * lift
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def grade_lime(im: Image.Image) -> Image.Image:
    """Подтягивает поле к фирменному #C6F033, сохраняя свет."""
    rgb = np.asarray(im).astype(np.float32) / 255.0
    target = np.array([198, 240, 51], dtype=np.float32) / 255.0
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # Яркость оставляем, цвет — лайм бренда с лёгким запасом на блики.
    tinted = target * (0.55 + 0.75 * luma[..., None])
    mixed = 0.42 * rgb + 0.58 * tinted
    return Image.fromarray(np.clip(mixed * 255, 0, 255).astype(np.uint8), "RGB")


def fitted_logo(fill: float = FILL) -> Image.Image:
    mark = Image.open(LOGO).convert("RGBA")
    h = round(SIZE * fill)
    w = round(mark.width * h / mark.height)
    return mark.resize((w, h), Image.LANCZOS)


def shadow_layer(mark: Image.Image, color, opacity: float, blur: int, dy: int) -> Image.Image:
    pad = blur * 3
    layer = Image.new("RGBA", (mark.width + pad * 2, mark.height + pad * 2), (0, 0, 0, 0))
    alpha = mark.getchannel("A").point(lambda p: int(p * opacity))
    blob = Image.new("RGBA", mark.size, (*color, 0))
    blob.putalpha(alpha)
    layer.alpha_composite(blob, (pad, pad + dy))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def glow_layer(mark: Image.Image, color, opacity: float, blur: int) -> Image.Image:
    """Мягкое свечение силуэта — для ночного изумрудного поля."""
    return shadow_layer(mark, color, opacity, blur, dy=0)


def place_logo(
    bg: Image.Image,
    mark: Image.Image,
    shadow_color,
    opacity,
    blur,
    dy,
    glow=None,
) -> Image.Image:
    canvas = bg.convert("RGBA")
    x = (SIZE - mark.width) // 2
    y = (SIZE - mark.height) // 2
    if glow:
        gl = glow_layer(mark, glow[0], glow[1], glow[2])
        gx = x - (gl.width - mark.width) // 2
        gy = y - (gl.height - mark.height) // 2
        canvas.alpha_composite(gl, (gx, gy))
    sh = shadow_layer(mark, shadow_color, opacity, blur, dy)
    sx = x - (sh.width - mark.width) // 2
    sy = y - (sh.height - mark.height) // 2
    canvas.alpha_composite(sh, (sx, sy))
    canvas.alpha_composite(mark, (x, y))
    return canvas.convert("RGB")


def squircle_mask(size: int, n: float = 4.8) -> Image.Image:
    coords = np.linspace(-1.0, 1.0, size)
    x, y = np.meshgrid(coords, coords)
    d = np.abs(x) ** n + np.abs(y) ** n
    inner, outer = 0.965, 1.015
    alpha = np.clip((outer - d) / (outer - inner), 0, 1)
    return Image.fromarray((alpha * 255).astype(np.uint8), "L")


def as_squircle(im: Image.Image, size: int) -> Image.Image:
    icon = im.resize((size, size), Image.LANCZOS).convert("RGBA")
    icon.putalpha(squircle_mask(size))
    return icon


def icon_shadow(size: int) -> Image.Image:
    m = squircle_mask(size)
    pad = 28
    layer = Image.new("RGBA", (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
    blob = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    blob.putalpha(m.point(lambda p: int(p * 0.38)))
    layer.alpha_composite(blob, (pad, pad + 6))
    return layer.filter(ImageFilter.GaussianBlur(10))


def font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), px)


def board(icons: list[tuple[str, Image.Image]]) -> Image.Image:
    """Тёмная подложка в духе скрина домашнего экрана."""
    w, h = 1680, 980
    bg = Image.new("RGB", (w, h), (6, 48, 62))
    px = np.asarray(bg).astype(np.float32)
    yy, xx = np.ogrid[:h, :w]
    glow = np.exp(-((xx - w / 2) ** 2 + (yy - h * 0.42) ** 2) / (2 * 520 ** 2))
    px += np.stack([glow * 10, glow * 22, glow * 18], axis=-1)
    bg = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8), "RGB")
    canvas = bg.convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    title = "Magas Padel — варианты иконки iOS"
    sub = "Логотип тот же. Меняется только поле вокруг щита."
    tw = draw.textlength(title, font=font(36))
    draw.text(((w - tw) / 2, 48), title, fill=(236, 244, 232), font=font(36))
    sw = draw.textlength(sub, font=font(20))
    draw.text(((w - sw) / 2, 100), sub, fill=(156, 184, 176), font=font(20))

    large = 280
    gap = (w - large * 4) / 5
    y = 170
    for i, (label, im) in enumerate(icons):
        x = int(gap + i * (large + gap))
        sh = icon_shadow(large)
        canvas.alpha_composite(sh, (x - 28, y - 22))
        canvas.alpha_composite(as_squircle(im, large), (x, y))
        lw = draw.textlength(label, font=font(22))
        draw.text((x + (large - lw) / 2, y + large + 28), label, fill=(230, 238, 226), font=font(22))

    # Мелкий ряд — как на домашнем экране (~60 pt @3x).
    small = 120
    caption = "Так будет выглядеть на домашнем экране"
    cw = draw.textlength(caption, font=font(16))
    draw.text(((w - cw) / 2, 620), caption, fill=(130, 160, 154), font=font(16))
    total = small * 4 + 36 * 3
    sx0 = (w - total) // 2
    sy = 668
    for i, (label, im) in enumerate(icons):
        x = sx0 + i * (small + 36)
        sh = icon_shadow(small)
        canvas.alpha_composite(sh, (x - 28, sy - 22))
        canvas.alpha_composite(as_squircle(im, small), (x, sy))
        lw = draw.textlength(label, font=font(14))
        draw.text((x + (small - lw) / 2, sy + small + 16), label, fill=(176, 196, 188), font=font(14))

    return canvas.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    mark = fitted_logo()

    porcelain_bg = lift_vignette(load_bg(ASSETS / "bg-porcelain.png"), 0.48, 1.35)
    lime_bg = grade_lime(lift_vignette(load_bg(ASSETS / "bg-lime.png"), 0.22, 1.3))
    emerald_bg = load_bg(ASSETS / "bg-emerald.png")
    sage_bg = lift_vignette(load_bg(ASSETS / "bg-sage.png"), 0.30, 1.5)

    porcelain = place_logo(porcelain_bg, mark, (28, 48, 22), 0.26, 32, 18)
    lime = place_logo(lime_bg, mark, (40, 72, 0), 0.30, 28, 16)
    emerald = place_logo(
        emerald_bg,
        mark,
        (0, 20, 8),
        0.18,
        22,
        10,
        glow=((198, 240, 51), 0.55, 48),
    )
    sage = place_logo(sage_bg, mark, (32, 48, 28), 0.24, 30, 16)
    current = Image.open(CURRENT).convert("RGB")

    porcelain.save(OUT / "01-porcelain.png")
    lime.save(OUT / "02-lime.png")
    emerald.save(OUT / "03-emerald.png")
    sage.save(OUT / "04-sage.png")

    as_squircle(porcelain, 512).save(OUT / "preview-porcelain.png")
    as_squircle(lime, 512).save(OUT / "preview-lime.png")
    as_squircle(emerald, 512).save(OUT / "preview-emerald.png")
    as_squircle(sage, 512).save(OUT / "preview-sage.png")
    as_squircle(current, 512).save(OUT / "preview-current.png")

    sheet = board(
        [
            ("Сейчас", current),
            ("Белый фарфор", porcelain),
            ("Лайм", lime),
            ("Ночной корт", emerald),
        ]
    )
    sheet.save(OUT / "comparison.png", quality=95)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
