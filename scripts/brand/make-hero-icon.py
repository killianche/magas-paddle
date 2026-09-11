#!/usr/bin/env python3
"""Иконка приложения по образцу заказчика preview-04-magas-hero.png.

Образец — превью 512 px со скруглением и прозрачными углами; для iOS нужен
квадрат 1024 без прозрачности (скругление iOS делает сам). Поэтому иконка
собирается заново: зелёный радиальный градиент, снятый с образца по радиусу,
и белые наклонные PADEL / MAGAS того же размера и на тех же местах. Наклон
подбирается по наибольшему совпадению с образцом.

    python3 scripts/brand/make-hero-icon.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'design' / 'icon-hero-reference.png'
FONT = ROOT / 'mobile' / 'assets' / 'fonts' / 'Inter-Black.ttf'
OUT = ROOT / 'design' / 'icon-hero-1024.png'
SIZE = 1024
WHITE = (255, 255, 255)

# Рамки строк на образце (512 px): x0, y0, x1, y1 — снято по белым пикселям
BOX = {'PADEL': (53, 169, 457, 262), 'MAGAS': (127, 291, 387, 342)}


def background() -> Image.Image:
    """Радиальный градиент: к центру светлее. Значения — с образца по радиусу."""
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(float)
    r = np.hypot(xx - (SIZE - 1) / 2, yy - (SIZE - 1) / 2) / 2      # в единицах образца
    g = np.clip(142 - 0.154 * r, 84, 255)
    b = 13 + 4.5 * np.clip(r / 240, 0, 1)
    rr = np.clip(1.2 - r / 200, 0, 2)
    return Image.fromarray(np.dstack([rr, g, b]).round().astype(np.uint8), 'RGB')


def word(text: str, shear: float) -> Image.Image:
    """Слово белым, наклонённое вправо, обрезанное по буквам (маска L)."""
    f = ImageFont.truetype(str(FONT), 400)
    l, t, r, b = f.getbbox(text)
    pad = 200
    im = Image.new('L', (r - l + pad * 2, b - t + pad * 2), 0)
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=f, fill=255)
    # x' = x + shear * (h - y): верх уходит вправо
    w, h = im.size
    im = im.transform((w, h), Image.AFFINE, (1, shear, -shear * h, 0, 1, 0), Image.BICUBIC)
    return im.crop(im.getbbox())


def render(shear: float) -> Image.Image:
    canvas = background()
    for text, (x0, y0, x1, y1) in BOX.items():
        m = word(text, shear)
        tw, th = (x1 - x0 + 1) * 2, (y1 - y0 + 1) * 2
        m = m.resize((tw, th), Image.LANCZOS)
        canvas.paste(Image.new('RGB', m.size, WHITE), (x0 * 2, y0 * 2), m)
    return canvas


def white_mask(im: Image.Image) -> np.ndarray:
    a = np.array(im.convert('RGB')).astype(int)
    return (a[..., 0] > 200) & (a[..., 1] > 200) & (a[..., 2] > 200)


def main() -> None:
    ref = Image.open(REF).convert('RGBA')
    ref_m = white_mask(ref) & (np.array(ref)[..., 3] > 200)
    best = None
    for shear in np.arange(0.10, 0.30, 0.01):
        im = render(shear)
        m = white_mask(im.resize((512, 512), Image.LANCZOS))
        iou = (m & ref_m).sum() / (m | ref_m).sum()
        if not best or iou > best[0]:
            best = (iou, shear, im)
    iou, shear, im = best
    im.save(OUT)
    print(f'наклон {shear:.2f}, совпадение с образцом {iou:.3f} → {OUT.relative_to(ROOT)}')

    # Рядом для глаза: образец и новая иконка в том же скруглении
    coords = np.linspace(-1, 1, 512)
    x, y = np.meshgrid(coords, coords)
    mask = Image.fromarray((np.clip((1.015 - (np.abs(x) ** 4.8 + np.abs(y) ** 4.8)) / 0.05, 0, 1) * 255)
                           .astype(np.uint8), 'L')
    mine = im.resize((512, 512), Image.LANCZOS).convert('RGBA'); mine.putalpha(mask)
    board = Image.new('RGBA', (1064, 552), (30, 30, 30, 255))
    board.alpha_composite(ref, (20, 20)); board.alpha_composite(mine, (532, 20))
    board.save(ROOT / 'design' / 'icon-hero-compare.png')


if __name__ == '__main__':
    main()
