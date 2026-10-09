"""Выпуск версии: сборка уходит и в TestFlight, и в App Store.

    python3 scripts/asc/release.py          # только план, ничего не меняет
    python3 scripts/asc/release.py --go     # выполнить

Почему так: две версии одновременно на проверке Apple держать не даёт.
Поэтому заявка на прежнюю версию отзывается, карточке присваивается новый
номер, к ней прикладывается новая сборка — и заявка отправляется заново.

Вызовы сверены с документацией Apple 09.10.2026:
  PATCH /v1/reviewSubmissions/{id}                 attributes.canceled | submitted
  PATCH /v1/appStoreVersions/{id}                  attributes.versionString + relationships.build
  POST  /v1/reviewSubmissions                      relationships.app
  POST  /v1/reviewSubmissionItems                  relationships.reviewSubmission + appStoreVersion
  POST  /v1/betaGroups/{id}/relationships/builds   data[] = {type: builds, id}
  POST  /v1/betaBuildLocalizations                 attributes.locale + relationships.build
"""
import importlib.util, pathlib, sys, time

APP         = '6808335944'
VERSION_ID  = '36215d4b-1d43-46da-bc51-616c40582fe7'   # карточка версии в магазине
TARGET      = '1.0.4'                                   # номер, который должен в ней стоять
BUILD_NUM   = '69'                                      # номер сборки
GROUP_FRIEND= 'ef6e1f33-4e97-48b4-9dbf-4aab01165420'   # внешняя группа «Друзья»
OLD_SUB     = '9068f2ef-2bec-4f1f-8f55-213f802b2ead'   # заявка на 1.0.3, стоит в очереди
EMPTY_SUBS  = ['d19a82fa-b21b-4bb2-8648-777e26faa6e2',  # пустые заявки от неудачных
               '5a38229d-df61-44c4-b05c-855a86a06481',  # попыток — мешают создать новую
               '5d534c86-e420-401d-85d7-c7a78ee9cb5d']
MODEL_BUILD = 'c826c5bf-6f6b-488a-841b-1033a63c9f85'   # сборка 68: с неё берём «что тестировать»

spec = importlib.util.spec_from_file_location('asc', pathlib.Path(__file__).parent / 'asc.py')
asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)

GO = '--go' in sys.argv
DEAD = ('CANCELED', 'COMPLETE', 'CANCELLED')


def step(text):
    print(f'\n— {text}')


def explain(out):
    for e in (out or {}).get('errors', [{}]):
        print(f'    {e.get("title")}: {e.get("detail")}')


def must(st, out, label, ok=(200, 201, 204)):
    if st in ok:
        print(f'  ✓ {label} (HTTP {st})')
        return out
    print(f'  ✗ {label}: HTTP {st}')
    explain(out)
    sys.exit(1)


def soft(st, out, label, ok=(200, 201, 204)):
    """Для необязательных шагов: сообщаем и идём дальше, выпуск не останавливаем."""
    if st in ok:
        print(f'  ✓ {label} (HTTP {st})')
        return True
    print(f'  ! {label}: HTTP {st} — пропускаю')
    explain(out)
    return False


def wait(label, probe, done, limit=900, pause=20):
    """Опрашиваем, пока состояние не станет ожидаемым. Без этого следующий шаг падает."""
    waited = 0
    while True:
        value = probe()
        if done(value):
            print(f'  ✓ {label}: {value}')
            return value
        if waited >= limit:
            print(f'  ✗ {label}: за {limit // 60} мин осталось {value}')
            sys.exit(1)
        print(f'    {label}: {value}, ждём…')
        time.sleep(pause); waited += pause


def build_state(bid):
    st, out = asc.call('GET', f'/v1/builds/{bid}')
    return (out.get('data') or {}).get('attributes', {}).get('processingState')


def sub_state(sid):
    st, out = asc.call('GET', f'/v1/reviewSubmissions/{sid}')
    return (out.get('data') or {}).get('attributes', {}).get('state')


def version_state():
    st, out = asc.call('GET', f'/v1/appStoreVersions/{VERSION_ID}')
    return (out.get('data') or {}).get('attributes', {}).get('appStoreState')


# ── сборка ────────────────────────────────────────────────────────────────────
step(f'Ищу сборку {BUILD_NUM}')
st, out = asc.call('GET', f'/v1/builds?filter[app]={APP}&limit=10&sort=-version')
build = next((b for b in out.get('data', []) if b['attributes']['version'] == BUILD_NUM), None)
if not build:
    print(f'  ✗ сборки {BUILD_NUM} в App Store Connect нет — Apple её ещё не приняла')
    sys.exit(1)
BUILD_ID = build['id']
print(f'  ✓ id {BUILD_ID}, состояние {build["attributes"]["processingState"]}')

wait('обработка сборки', lambda: build_state(BUILD_ID), lambda v: v == 'VALID')

st, out = asc.call('GET', f'/v1/builds/{BUILD_ID}/preReleaseVersion')
carried = (out.get('data') or {}).get('attributes', {}).get('version')
print(f'  номер версии внутри сборки: {carried}')
if carried != TARGET:
    print(f'  ✗ внутри сборки {carried}, а в магазин идёт {TARGET} — Apple отклонит как INVALID_BINARY')
    sys.exit(1)

if not GO:
    print('\nЭто был только план. Чтобы выполнить: python3 scripts/asc/release.py --go')
    sys.exit(0)

# ── TestFlight: внешняя группа и бета-проверка ────────────────────────────────
step('TestFlight: «что тестировать» для сборки')
st, out = asc.call('GET', f'/v1/builds/{BUILD_ID}/betaBuildLocalizations')
mine = {l['attributes']['locale']: l for l in out.get('data', [])}
st, out = asc.call('GET', f'/v1/builds/{MODEL_BUILD}/betaBuildLocalizations')
model = {l['attributes']['locale']: l['attributes'].get('whatsNew') for l in out.get('data', [])}

for locale, text in model.items():
    if not text:
        continue
    have = mine.get(locale)
    if have and (have['attributes'].get('whatsNew') or '').strip():
        print(f'  ✓ {locale}: текст уже есть, не трогаю')
    elif have:
        st, o = asc.call('PATCH', f'/v1/betaBuildLocalizations/{have["id"]}', {"data": {
            "type": "betaBuildLocalizations", "id": have['id'],
            "attributes": {"whatsNew": text}}})
        must(st, o, f'{locale}: текст дописан')
    else:
        st, o = asc.call('POST', '/v1/betaBuildLocalizations', {"data": {
            "type": "betaBuildLocalizations",
            "attributes": {"locale": locale, "whatsNew": text},
            "relationships": {"build": {"data": {"type": "builds", "id": BUILD_ID}}}}})
        must(st, o, f'{locale}: текст добавлен')

step('TestFlight: сборка в группу «Друзья»')
st, out = asc.call('GET', f'/v1/builds/{BUILD_ID}/betaGroups')
if any(g['id'] == GROUP_FRIEND for g in out.get('data', [])):
    print('  ✓ сборка уже в группе')
else:
    st, o = asc.call('POST', f'/v1/betaGroups/{GROUP_FRIEND}/relationships/builds',
                     {"data": [{"type": "builds", "id": BUILD_ID}]})
    must(st, o, 'сборка добавлена в группу')

step('TestFlight: отправка на бета-проверку')
st, out = asc.call('GET', f'/v1/builds/{BUILD_ID}/betaAppReviewSubmission')
already = (out.get('data') or {}).get('attributes', {}).get('betaReviewState')
if already:
    print(f'  ✓ уже отправлена, состояние {already}')
else:
    st, o = asc.call('POST', '/v1/betaAppReviewSubmissions', {"data": {
        "type": "betaAppReviewSubmissions",
        "relationships": {"build": {"data": {"type": "builds", "id": BUILD_ID}}}}})
    must(st, o, 'отправлена на бета-проверку')
    print(f'    состояние: {o["data"]["attributes"].get("betaReviewState")}')

# ── App Store: освобождаем карточку ───────────────────────────────────────────
# Пустые заявки от прошлых неудачных попыток Apple отзывать не даёт: отвечает
# 409 «not in cancellable state». Зато такую заявку можно использовать повторно —
# вложить в неё версию и отправить. Поэтому сначала ищем годную, и только если
# её нет, создаём новую.
step('App Store: ищу годную пустую заявку среди прошлых')
REUSABLE = None
for sid in EMPTY_SUBS:
    st, it = asc.call('GET', f'/v1/reviewSubmissions/{sid}/items')
    if it.get('data'):
        print(f'  · {sid[:8]}: в заявке есть позиции — не трогаю')
        continue
    state = sub_state(sid)
    if state == 'READY_FOR_REVIEW':
        REUSABLE = sid
        print(f'  ✓ {sid[:8]}: пустая и готова — использую её')
        break
    print(f'  · {sid[:8]}: состояние {state}, не годится')

step('App Store: отзываю заявку на прежнюю версию')
state = sub_state(OLD_SUB)
if state in DEAD:
    print(f'  ✓ уже {state}')
else:
    st, o = asc.call('PATCH', f'/v1/reviewSubmissions/{OLD_SUB}', {"data": {
        "type": "reviewSubmissions", "id": OLD_SUB, "attributes": {"canceled": True}}})
    must(st, o, f'заявка отозвана (была {state})')
    wait('состояние заявки', lambda: sub_state(OLD_SUB), lambda v: v in DEAD)

# После своего же отзыва карточка встаёт в DEVELOPER_REJECTED, а не
# в PREPARE_FOR_SUBMISSION. Оба состояния редактируемые: номер версии и сборку
# менять можно, заявку отправлять заново — тоже.
EDITABLE = ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED',
            'METADATA_REJECTED', 'INVALID_BINARY')
wait('карточка версии', version_state, lambda v: v in EDITABLE)

# ── App Store: новый номер, новая сборка, новая заявка ────────────────────────
step(f'App Store: номер версии → {TARGET}, сборка → {BUILD_NUM}')
st, o = asc.call('PATCH', f'/v1/appStoreVersions/{VERSION_ID}', {"data": {
    "type": "appStoreVersions", "id": VERSION_ID,
    "attributes": {"versionString": TARGET},
    "relationships": {"build": {"data": {"type": "builds", "id": BUILD_ID}}}}})
must(st, o, f'версия {TARGET} со сборкой {BUILD_NUM}')

step('App Store: заявка на проверку')
if REUSABLE:
    SUB = REUSABLE
    print(f'  ✓ беру прошлую пустую заявку, id {SUB}')
else:
    st, o = asc.call('POST', '/v1/reviewSubmissions', {"data": {
        "type": "reviewSubmissions",
        "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
    must(st, o, 'заявка создана', ok=(201,))
    SUB = o['data']['id']
    print(f'    id {SUB}')

st, o = asc.call('POST', '/v1/reviewSubmissionItems', {"data": {
    "type": "reviewSubmissionItems",
    "relationships": {
        "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": SUB}},
        "appStoreVersion": {"data": {"type": "appStoreVersions", "id": VERSION_ID}}}}})
must(st, o, f'версия {TARGET} вложена в заявку', ok=(201,))

st, o = asc.call('PATCH', f'/v1/reviewSubmissions/{SUB}', {"data": {
    "type": "reviewSubmissions", "id": SUB, "attributes": {"submitted": True}}})
must(st, o, 'заявка отправлена')
print(f'    состояние заявки: {o["data"]["attributes"].get("state")}')

# ── что получилось ────────────────────────────────────────────────────────────
step('Итог')
print(f'  App Store: версия {TARGET}, сборка {BUILD_NUM}, карточка {version_state()}')
st, out = asc.call('GET', f'/v1/builds/{BUILD_ID}/betaAppReviewSubmission')
print(f'  TestFlight: бета-проверка {(out.get("data") or {}).get("attributes", {}).get("betaReviewState")}')
print('  Ссылка для друзей: https://testflight.apple.com/join/ujgg3cvu')
print('\nСостояние потом проверять так: python3 scripts/asc/check-review.py')
