#!/usr/bin/env python3
"""Собирает все иконки приложения из одного файла логотипа — pade.png.

Логотип не перерисовывается и не режется: он только масштабируется
и ставится на фирменный тёмный фон. Запускать из корня проекта:

    python3 scripts/brand/make-icons.py
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'pade.png')

INK = (11, 15, 12)        # #0B0F0C — фон приложения
INK_TOP = (19, 26, 19)    # чуть светлее сверху, чтобы иконка не была плоской


def logo():
    """Логотип, обрезанный по краям щита."""
    im = Image.open(SRC).convert('RGBA')
    return im.crop(im.getchannel('A').getbbox())


def backdrop(size):
    """Квадрат фирменного тёмного цвета с мягким вертикальным переходом."""
    bg = Image.new('RGB', (size, size), INK)
    px = bg.load()
    for y in range(size):
        k = y / (size - 1)
        row = tuple(round(INK_TOP[i] + (INK[i] - INK_TOP[i]) * k) for i in range(3))
        for x in range(size):
            px[x, y] = row
    return bg


def fitted(mark, box_h):
    """Логотип, вписанный по высоте."""
    w = round(mark.width * box_h / mark.height)
    return mark.resize((w, box_h), Image.LANCZOS)


def on_dark(mark, size, fill, keep_alpha=False, out=None):
    """Логотип на тёмном квадрате. fill — какую долю высоты занимает щит."""
    canvas = backdrop(size).convert('RGBA') if not keep_alpha \
        else Image.new('RGBA', (size, size), (0, 0, 0, 0))
    m = fitted(mark, round(size * fill))
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    img = canvas if keep_alpha else canvas.convert('RGB')
    if out:
        img.save(out)
        print('%-46s %dx%d' % (os.path.relpath(out, ROOT), size, size))
    return img


def main():
    mark = logo()
    print('логотип: %dx%d' % mark.size)

    p = lambda *a: os.path.join(ROOT, *a)

    # iOS и общая иконка приложения. Без прозрачности — Apple её не принимает.
    on_dark(mark, 1024, 0.88, out=p('mobile/assets/icon.png'))

    # Экран загрузки: щит на прозрачном, фон рисует expo-splash-screen.
    mark.save(p('mobile/assets/splash-icon.png'))
    print('%-46s %dx%d' % ('mobile/assets/splash-icon.png', *mark.size))

    # Android: передний слой адаптивной иконки живёт в центральных 66 %.
    on_dark(mark, 1024, 0.58, keep_alpha=True, out=p('mobile/assets/android-icon-foreground.png'))
    Image.new('RGB', (1024, 1024), INK).save(p('mobile/assets/android-icon-background.png'))
    print('%-46s %dx%d' % ('mobile/assets/android-icon-background.png', 1024, 1024))

    # Монохромная иконка Android — силуэт щита.
    sil = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    m = fitted(mark, round(1024 * 0.58))
    white = Image.new('RGBA', m.size, (255, 255, 255, 255))
    white.putalpha(m.getchannel('A'))
    sil.alpha_composite(white, ((1024 - m.width) // 2, (1024 - m.height) // 2))
    sil.save(p('mobile/assets/android-icon-monochrome.png'))
    print('%-46s %dx%d' % ('mobile/assets/android-icon-monochrome.png', 1024, 1024))

    # Логотип внутри приложения — на прозрачном фоне.
    mark.save(p('mobile/assets/img/logo.png'))
    print('%-46s %dx%d' % ('mobile/assets/img/logo.png', *mark.size))

    # Веб: вкладка браузера, экран «Домой», PWA.
    on_dark(mark, 196, 0.88, out=p('mobile/assets/favicon.png'))
    on_dark(mark, 32, 0.90, out=p('mobile/public/favicon.png'))
    on_dark(mark, 180, 0.86, out=p('mobile/public/apple-touch-icon.png'))
    on_dark(mark, 192, 0.88, out=p('mobile/public/icon-192.png'))
    on_dark(mark, 512, 0.88, out=p('mobile/public/icon-512.png'))
    # maskable: Android обрезает иконку в круг, щит держим в центральных 60 %.
    on_dark(mark, 512, 0.60, out=p('mobile/public/icon-maskable-512.png'))

    # Админка менеджера — своя вкладка в браузере.
    on_dark(mark, 64, 0.90, out=p('design/manager-favicon.png'))


if __name__ == '__main__':
    main()
