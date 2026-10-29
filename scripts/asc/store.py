"""Выпуск новой версии в App Store: новая карточка версии, сборка, заявка.

    python3 scripts/asc/store.py --version 1.0.6 --build 77 --notes notes.txt        # план
    python3 scripts/asc/store.py --version 1.0.6 --build 77 --notes notes.txt --go   # выполнить

Карточку версии создаём заново (прошлая уже в продаже). Тексты страницы
(описание, ключевые слова, снимки) Apple сам переносит с прошлой версии —
меняем только «Что нового» (из файла --notes) и адрес поддержки.

Вызовы сверены с документацией Apple (App Store Connect API):
  POST  /v1/appStoreVersions               platform, versionString + app, build
  PATCH /v1/appStoreVersionLocalizations   whatsNew, supportUrl
  POST  /v1/reviewSubmissions              platform + app
  POST  /v1/reviewSubmissionItems          reviewSubmission + appStoreVersion
  PATCH /v1/reviewSubmissions/{id}         submitted: true
"""
import importlib.util, pathlib, sys, time

APP       = '6808335944'
def arg(name):
    if name not in sys.argv: sys.exit(f'нужен {name}')
    return sys.argv[sys.argv.index(name) + 1]

TARGET    = arg('--version')
BUILD_NUM = arg('--build')
SUPPORT   = 'https://padelmagas.ru'

WHATS_NEW = pathlib.Path(arg('--notes')).read_text(encoding='utf-8').strip()

spec = importlib.util.spec_from_file_location('asc', pathlib.Path(__file__).parent / 'asc.py')
asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)
GO = '--go' in sys.argv


def must(st, out, label, ok=(200, 201, 204)):
    if st in ok:
        print(f'  ✓ {label} (HTTP {st})')
        return out
    print(f'  ✗ {label}: HTTP {st}')
    for e in (out or {}).get('errors', [{}]):
        print(f'    {e.get("title")}: {e.get("detail")}')
    sys.exit(1)


print(f'План: App Store {TARGET}, сборка {BUILD_NUM}')

# Сборка должна быть обработана Apple
st, out = asc.call('GET', f'/v1/builds?filter[app]={APP}&filter[version]={BUILD_NUM}&limit=1')
build = (out.get('data') or [None])[0]
if not build:
    print(f'  ✗ сборки {BUILD_NUM} в кабинете ещё нет — запустите позже'); sys.exit(1)
state = build['attributes']['processingState']
print(f'  сборка {BUILD_NUM}: {state}')
if state != 'VALID':
    print('  ✗ Apple ещё обрабатывает сборку — запустите позже'); sys.exit(1)
BUILD_ID = build['id']

# Карточка версии: могла остаться от прошлого запуска
st, out = asc.call('GET', f'/v1/apps/{APP}/appStoreVersions?filter[versionString]={TARGET}')
ver = (out.get('data') or [None])[0]
print(f'  карточка {TARGET}: {ver["attributes"]["appStoreState"] if ver else "нет, будет создана"}')
print(f'  «Что нового»: {len(WHATS_NEW)}/4000 знаков')
if len(WHATS_NEW) > 4000:
    print('  ✗ «Что нового» длиннее 4000'); sys.exit(1)
if not GO:
    print('\nЭто был только план. Выполнить: добавьте --go'); sys.exit(0)

print()
if not ver:
    st, o = asc.call('POST', '/v1/appStoreVersions', {"data": {
        "type": "appStoreVersions",
        # Выйти сразу после одобрения: исправления нужны людям как можно раньше
        "attributes": {"platform": "IOS", "versionString": TARGET, "releaseType": "AFTER_APPROVAL"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}},
                          "build": {"data": {"type": "builds", "id": BUILD_ID}}}}})
    ver = must(st, o, f'карточка {TARGET} создана со сборкой {BUILD_NUM}', ok=(201,))['data']
else:
    st, o = asc.call('PATCH', f'/v1/appStoreVersions/{ver["id"]}', {"data": {
        "type": "appStoreVersions", "id": ver['id'],
        "relationships": {"build": {"data": {"type": "builds", "id": BUILD_ID}}}}})
    must(st, o, f'к карточке {TARGET} приложена сборка {BUILD_NUM}')
VID = ver['id']

# Тексты: Apple переносит их с прошлой версии не мгновенно — ждём русскую
for _ in range(10):
    st, out = asc.call('GET', f'/v1/appStoreVersions/{VID}/appStoreVersionLocalizations')
    ru = next((l for l in out.get('data', []) if l['attributes']['locale'] == 'ru'), None)
    if ru: break
    time.sleep(3)
if not ru:
    print('  ✗ у карточки нет русского текста'); sys.exit(1)
st, o = asc.call('PATCH', f"/v1/appStoreVersionLocalizations/{ru['id']}", {"data": {
    "type": "appStoreVersionLocalizations", "id": ru['id'],
    "attributes": {"whatsNew": WHATS_NEW, "supportUrl": SUPPORT}}})
must(st, o, f'«Что нового» и поддержка ({SUPPORT})')

# Заявка: пустую незавершённую Apple отозвать не даёт, но её можно
# использовать — берём такую, если есть, иначе создаём
st, out = asc.call('GET', f'/v1/reviewSubmissions?filter[app]={APP}&filter[state]=READY_FOR_REVIEW')
SUB = None
for s in out.get('data', []):
    st2, it = asc.call('GET', f'/v1/reviewSubmissions/{s["id"]}/items')
    if not it.get('data'):
        SUB = s['id']; print(f'  ✓ беру пустую прошлую заявку {SUB[:8]}'); break
if not SUB:
    st, o = asc.call('POST', '/v1/reviewSubmissions', {"data": {
        "type": "reviewSubmissions", "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
    SUB = must(st, o, 'заявка создана', ok=(201,))['data']['id']

st, o = asc.call('POST', '/v1/reviewSubmissionItems', {"data": {
    "type": "reviewSubmissionItems",
    "relationships": {
        "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": SUB}},
        "appStoreVersion": {"data": {"type": "appStoreVersions", "id": VID}}}}})
must(st, o, f'версия {TARGET} вложена в заявку', ok=(201,))

st, o = asc.call('PATCH', f'/v1/reviewSubmissions/{SUB}', {"data": {
    "type": "reviewSubmissions", "id": SUB, "attributes": {"submitted": True}}})
must(st, o, 'заявка отправлена на проверку')
print(f'    состояние: {o["data"]["attributes"].get("state")}')
print('\nСостояние потом: python3 scripts/asc/check-review.py')
