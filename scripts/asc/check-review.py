"""Состояние проверки TestFlight и работает ли публичная ссылка.

    ASC_KEY_ID=... ASC_ISSUER_ID=... python3 scripts/asc/check-review.py
"""
import importlib.util, pathlib, urllib.request

BUILD = '58f1dd55-f041-4f3a-873e-ec8b0b43b153'
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

st, out = asc.call('GET', f'/v1/builds/{BUILD}/betaAppReviewSubmission')
state = (out.get('data') or {}).get('attributes', {}).get('betaReviewState', '—')
print('проверка TestFlight:', state, '—', STATES.get(state, ''))

try:
    with urllib.request.urlopen(LINK, timeout=20) as r:
        page = r.read().decode('utf-8', 'replace')
    closed = "isn't accepting any new testers" in page
    print('публичная ссылка:', 'пока закрыта' if closed else 'ОТКРЫТА, можно раздавать')
except Exception as e:
    print('публичная ссылка: не удалось проверить —', e)
print(LINK)
