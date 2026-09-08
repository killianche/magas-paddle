"""Где сейчас обе проверки Apple: TestFlight и App Store.

    ASC_KEY_ID=... ASC_ISSUER_ID=... python3 scripts/asc/check-review.py
"""
import importlib.util, pathlib, urllib.request

# Сборки TestFlight: свежая сверху. Добавляя новую, дописывайте строку сюда.
BUILDS = [
    ('5', '54d2badb-9c41-415e-b849-01684ff6ef23'),
    ('4', 'ce655eb2-2646-4c2a-9b9a-6f941aed71e9'),
    ('3', '517e057a-1cc3-400b-a858-b2cc258651cb'),
    ('2', '3528cbc0-74d0-47cc-af8e-80ae160e3865'),
    ('1', '58f1dd55-f041-4f3a-873e-ec8b0b43b153'),
]
VID   = 'd98f5a08-4d50-4543-b6f7-087427d3b640'
LINK  = 'https://testflight.apple.com/join/ujgg3cvu'

here = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('asc', here / 'asc.py')
asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)

STATES = {
    'WAITING_FOR_REVIEW': 'ждёт очереди на проверку',
    'IN_REVIEW':          'Apple смотрит сборку',
    'REJECTED':           'отклонено — смотрите письмо от Apple',
    'APPROVED':           'одобрено, ссылка работает',
}

print('TestFlight, проверка сборок:')
for num, bid in BUILDS:
    st, out = asc.call('GET', f'/v1/builds/{bid}/betaAppReviewSubmission')
    state = (out.get('data') or {}).get('attributes', {}).get('betaReviewState', '—')
    print(f'  сборка {num}: {state} — {STATES.get(state, "")}')
print()

try:
    with urllib.request.urlopen(LINK, timeout=20) as r:
        page = r.read().decode('utf-8', 'replace')
    # В HTML апостроф приходит как &#39;, из-за чего прямой поиск не срабатывал
    import html as _html, re as _re
    plain = _re.sub(r'<[^>]+>', ' ', _html.unescape(page))
    closed = 'accepting any new testers' in plain
    print('публичная ссылка:', 'пока закрыта' if closed else 'ОТКРЫТА, можно раздавать')
except Exception as e:
    print('публичная ссылка: не удалось проверить —', e)
print(LINK)

STORE = {
    'PREPARE_FOR_SUBMISSION': 'ещё не отправлено',
    'WAITING_FOR_REVIEW':     'ждёт очереди на проверку',
    'IN_REVIEW':              'Apple смотрит приложение',
    'PENDING_DEVELOPER_RELEASE': 'одобрено, ждёт публикации с вашей стороны',
    'READY_FOR_SALE':         'опубликовано в App Store',
    'REJECTED':               'отклонено — смотрите письмо от Apple',
    'METADATA_REJECTED':      'отклонены описание или скриншоты',
}
st, out = asc.call('GET', f'/v1/appStoreVersions/{VID}?fields[appStoreVersions]=appStoreState')
state = (out.get('data') or {}).get('attributes', {}).get('appStoreState', '—')
print()
print('App Store:', state, '—', STORE.get(state, ''))
