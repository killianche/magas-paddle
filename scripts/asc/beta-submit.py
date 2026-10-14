"""Отправить сборку на бета-проверку TestFlight — ради публичной ссылки.

    python3 scripts/asc/beta-submit.py          # как дела
    python3 scripts/asc/beta-submit.py --go     # отправить

Зачем отдельно от release.py: тот выпускает версию в магазин целиком и на
уже вышедшей версии буксует. Здесь нужно ровно одно действие.

Apple держит в бета-проверке одну сборку за раз: пока прошлая не прошла,
новую не примет и ответит 422. Это не ошибка выпуска — просто ещё рано,
и запускать скрипт можно сколько угодно раз.

Внутренняя группа «Команда клуба» видит сборку и без всякой проверки —
бета-проверка нужна только публичной ссылке для друзей.
"""
import importlib.util, pathlib, sys

APP   = '6808335944'
BUILD = sys.argv[sys.argv.index('--build') + 1] if '--build' in sys.argv else '71'

# «Что тестировать» — без этого текста Apple не берёт сборку на внешнюю проверку
WHAT_TO_TEST = '''Отмена записи теперь работает прямо в приложении: кнопка «Отменить запись» отменяет сразу и предупреждает, если предоплата сгорит.

После входа выбранные корт, день, время и прокат сохраняются — заново выбирать не нужно.

На экране «Заявка отправлена» видно, до какого часа держат место.'''
GROUP = 'ef6e1f33-4e97-48b4-9dbf-4aab01165420'   # внешняя группа «Друзья»
LINK  = 'https://testflight.apple.com/join/ujgg3cvu'

spec = importlib.util.spec_from_file_location('asc', pathlib.Path(__file__).parent / 'asc.py')
asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)
GO = '--go' in sys.argv

st, out = asc.call('GET', f'/v1/builds?filter[app]={APP}&limit=10&sort=-version')
build = next((b for b in out.get('data', []) if b['attributes']['version'] == BUILD), None)
if not build:
    print(f'Сборки {BUILD} в кабинете нет'); sys.exit(1)
bid = build['id']
print(f'Сборка {BUILD}: {build["attributes"]["processingState"]}')

st, out = asc.call('GET', f'/v1/builds/{bid}/betaAppReviewSubmission')
state = (out.get('data') or {}).get('attributes', {}).get('betaReviewState')
if state:
    print(f'Бета-проверка: {state}')
    if state == 'APPROVED':
        print(f'Публичная ссылка раздаёт эту сборку: {LINK}')
    sys.exit(0)

print('Бета-проверка: не отправлялась')

# Текст «что тестировать» — дописываем, если его ещё нет
st, out = asc.call('GET', f'/v1/builds/{bid}/betaBuildLocalizations')
ru = next((l for l in out.get('data', []) if l['attributes']['locale'] == 'ru'), None)
has_text = bool(ru and (ru['attributes'].get('whatsNew') or '').strip())
print(f'«Что тестировать»: {"есть" if has_text else "нет"}')
if not GO:
    print('\nОтправить: python3 scripts/asc/beta-submit.py --go')
    sys.exit(0)

if not has_text:
    if ru:
        st, o = asc.call('PATCH', f"/v1/betaBuildLocalizations/{ru['id']}", {"data": {
            "type": "betaBuildLocalizations", "id": ru['id'], "attributes": {"whatsNew": WHAT_TO_TEST}}})
    else:
        st, o = asc.call('POST', '/v1/betaBuildLocalizations', {"data": {
            "type": "betaBuildLocalizations",
            "attributes": {"locale": "ru", "whatsNew": WHAT_TO_TEST},
            "relationships": {"build": {"data": {"type": "builds", "id": bid}}}}})
    print(f'Текст «что тестировать»: HTTP {st}')

# В группу «Друзья» — без этого публичная ссылка сборку не увидит
st, out = asc.call('GET', f'/v1/builds/{bid}/betaGroups')
if not any(g['id'] == GROUP for g in out.get('data', [])):
    st, o = asc.call('POST', f'/v1/betaGroups/{GROUP}/relationships/builds',
                     {"data": [{"type": "builds", "id": bid}]})
    print(f'В группу «Друзья»: HTTP {st}')

st, out = asc.call('POST', '/v1/betaAppReviewSubmissions', {"data": {
    "type": "betaAppReviewSubmissions",
    "relationships": {"build": {"data": {"type": "builds", "id": bid}}}}})
if st == 201:
    print(f'Отправлена, состояние: {out["data"]["attributes"].get("betaReviewState")}')
    print(f'После одобрения ссылка начнёт раздавать её: {LINK}')
else:
    detail = (out.get('errors') or [{}])[0].get('detail', '')
    print(f'Пока не принимает (HTTP {st}): {detail}')
    print('Это ожидаемо, если прошлая сборка ещё на проверке. Запустите позже.')
