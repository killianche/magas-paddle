"""Выпуск Padel Magas в Google Play через API.

    python3 scripts/play/release.py --aab путь/app-release.aab          # план, ничего не меняет
    python3 scripts/play/release.py --aab путь/app-release.aab --go     # загрузить

Что делает: загружает сборку, создаёт ЧЕРНОВИК выпуска в production,
заполняет страницу магазина (тексты, иконка, баннер, скриншоты) и сайт.

Почему черновик. Первый выпуск Google не даёт отправить на проверку через
API — так было и у xtrud (TASKS №162). Кнопку «Send for review» в Play
Console нажимает владелец; следующие обновления можно выпускать отсюда.

Тексты страницы — те же, что в App Store, чтобы магазины не расходились.
Картинки лежат рядом, в scripts/play/assets и scripts/asc/gp-*.png.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from play import call, app, PKG

ROOT = pathlib.Path(__file__).resolve().parents[2]
GO = '--go' in sys.argv
AAB = pathlib.Path(sys.argv[sys.argv.index('--aab') + 1]) if '--aab' in sys.argv else None
# draft — черновик, нужный для самого первого выпуска (его отправляет
# владелец кнопкой). completed — выпуск сразу на выход: так заменяем сборку
# в выпуске, уже отправленном на проверку, — черновик откатил бы его назад
STATUS = sys.argv[sys.argv.index('--status') + 1] if '--status' in sys.argv else 'draft'
LANG = 'ru-RU'
VERSION_NAME = '1.0.7'

TITLE = 'Padel Magas'
SHORT = 'Запись на корт в Магасе: свободное время, цены и турниры — в два нажатия'
FULL = '''Запись на корт в падел-центре Padel Magas — в два нажатия.

СВОБОДНОЕ ВРЕМЯ СРАЗУ ВИДНО
Открываете приложение и видите, сколько часов свободно сегодня и когда ближайшее окно. Не нужно звонить и уточнять.

ВЫБОР НА ОДНОМ ЭКРАНЕ
Сетка показывает часы и площадки вместе. Нажали на клетку — выбрали и время, и корт. Можно взять час, два или три подряд: приложение само покажет, сколько времени свободно, и не даст выбрать больше.

ЧЕСТНАЯ ЦЕНА
Стоимость считается по часам: если игра начинается днём и заходит на вечер, часы складываются по своим тарифам. Итог виден до записи.

ТУРНИРЫ
Ближайшие турниры клуба: дата, формат, взнос и сколько мест осталось. Запись в одно нажатие, отмена — тоже.

СВОИ ЗАПИСИ ПОД РУКОЙ
Все брони и записи на турниры в одном списке. Планы изменились — отмена в одно нажатие, время сразу освобождается для других игроков.

Шесть падел-кортов и мини-футбольное поле в Магасе.'''
NOTES = ('Первый выпуск Padel Magas для Android: запись на корт и мини-футбольное поле, '
         'цены по часам, турниры, вход по номеру телефона, отмена записи прямо в приложении.')
if STATUS not in ('draft', 'completed'):
    print(f'✗ --status: draft или completed, а не {STATUS}'); sys.exit(1)
WEBSITE = 'https://padelmagas.ru'
# Контакт на странице магазина. Без него Google не применяет правку
# («This app does not have a contact email address set»). Владелец велел
# взять тот же, что у xtrud (14.10.2026); в xtrud он прямо не записан, но
# единственный адрес владельца там — этот (оператор данных, Expo, оповещения)
EMAIL = 'pmrhhm@gmail.com'

ICON = ROOT / 'scripts/play/assets/icon-512.png'
FEATURE = ROOT / 'scripts/play/assets/feature-1024x500.png'
SHOTS = sorted((ROOT / 'scripts/asc').glob('gp-*.png'))


def must(st, out, what, ok=(200, 204)):
    if st in ok:
        print(f'  ✓ {what}')
        return out
    print(f'  ✗ {what}: HTTP {st} — {(out.get("error") or {}).get("message", out)}')
    sys.exit(1)


# ── проверки до любых изменений ───────────────────────────────────────────
print('План выпуска в Google Play')
problems = []
if not AAB or not AAB.exists():
    problems.append('не указан файл сборки: --aab путь/app-release.aab')
if len(TITLE) > 30: problems.append(f'название {len(TITLE)} > 30 знаков')
if len(SHORT) > 80: problems.append(f'краткое описание {len(SHORT)} > 80 знаков')
if len(FULL) > 4000: problems.append(f'полное описание {len(FULL)} > 4000 знаков')
if len(NOTES) > 500: problems.append(f'что нового {len(NOTES)} > 500 знаков')
for f in [ICON, FEATURE, *SHOTS]:
    if not f.exists(): problems.append(f'нет файла {f}')
if len(SHOTS) < 2: problems.append('скриншотов меньше двух — Google не примет')

print(f'  сборка: {AAB} ({AAB.stat().st_size // 1048576} МБ)' if AAB and AAB.exists() else '  сборка: —')
print(f'  название: {TITLE} ({len(TITLE)}/30)')
print(f'  краткое описание: {len(SHORT)}/80 · полное: {len(FULL)}/4000 · что нового: {len(NOTES)}/500')
print(f'  иконка, баннер, скриншотов: {len(SHOTS)}')
print(f'  выпуск: {STATUS}')
if problems:
    print('\n✗ Нельзя: ' + '; '.join(problems))
    sys.exit(1)
if not GO:
    print('\nЭто был только план. Загрузить: добавьте --go')
    sys.exit(0)

# ── загрузка: всё одной правкой, применяется только целиком ───────────────
st, ed = call('POST', app('/edits'), {})
eid = must(st, ed, 'открыта правка')['id']
E = app(f'/edits/{eid}')

print('  загружаю сборку…')
st, b = call('POST', E + '/bundles?uploadType=media', upload=AAB.read_bytes(),
             ctype='application/octet-stream')
vc = must(st, b, 'сборка загружена')['versionCode']
print(f'    номер сборки у Google: {vc}')

must(*call('PUT', E + '/tracks/production', {
    'track': 'production',
    'releases': [{
        'name': VERSION_NAME, 'versionCodes': [str(vc)], 'status': STATUS,
        'releaseNotes': [{'language': LANG, 'text': NOTES}],
    }],
}), f'выпуск в production ({STATUS})')

must(*call('PUT', E + f'/listings/{LANG}', {
    'language': LANG, 'title': TITLE, 'shortDescription': SHORT, 'fullDescription': FULL,
}), 'тексты страницы')

# Картинки: сначала убираем прежние этого вида, потом кладём свои — иначе
# повторный запуск дописывал бы скриншоты к старым
for kind, files in (('icon', [ICON]), ('featureGraphic', [FEATURE]), ('phoneScreenshots', SHOTS)):
    call('DELETE', E + f'/listings/{LANG}/{kind}')
    for f in files:
        must(*call('POST', E + f'/listings/{LANG}/{kind}?uploadType=media',
                   upload=f.read_bytes(), ctype='image/png'), f'{kind}: {f.name}')

must(*call('PATCH', E + '/details', {'contactWebsite': WEBSITE, 'contactEmail': EMAIL}),
     f'контакты: {WEBSITE}, {EMAIL}')

st, out = call('POST', E + ':commit')
if st != 200 and 'changesNotSentForReview' in str(out):
    # Google просит не отправлять изменения на проверку автоматически —
    # ровно то, что нам и нужно: отправит владелец кнопкой
    st, out = call('POST', E + ':commit?changesNotSentForReview=true')
must(st, out, 'правка применена')
print(f'\n✓ Готово. ' + (f'Черновик выпуска {VERSION_NAME} ждёт кнопки «Send for review» в Play Console.'
      if STATUS == 'draft' else f'Выпуск {VERSION_NAME} со сборкой {vc} ушёл на выход.'))
