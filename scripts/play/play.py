"""Клиент Google Play Developer API для Padel Magas.

Ключ сервисного аккаунта padel-magas-publisher лежит в secrets/play.json
(в Git не попадает) и в вывод не печатается. Аккаунт отдельный, как у xtrud
и Quran: ключ одного приложения не даёт доступа к другим.

    python3 scripts/play/play.py            # проверить доступ
"""
import json, sys, time, pathlib, urllib.parse, urllib.request, urllib.error
import jwt

KEY = pathlib.Path(__file__).resolve().parents[2] / 'secrets' / 'play.json'
PKG = 'ru.padelmagas.app'
BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'
SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

_tok = {'v': None, 'exp': 0}


def token():
    if _tok['v'] and time.time() < _tok['exp'] - 60:
        return _tok['v']
    k = json.loads(KEY.read_text())
    now = int(time.time())
    assertion = jwt.encode({'iss': k['client_email'], 'scope': SCOPE, 'aud': k['token_uri'],
                            'iat': now, 'exp': now + 3600}, k['private_key'], algorithm='RS256')
    data = urllib.parse.urlencode({
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': assertion}).encode()
    with urllib.request.urlopen(urllib.request.Request(k['token_uri'], data=data), timeout=30) as r:
        out = json.loads(r.read())
    _tok['v'], _tok['exp'] = out['access_token'], now + out.get('expires_in', 3600)
    return _tok['v']


def call(method, path, body=None, upload=None, ctype=None):
    """upload — байты файла: тогда запрос идёт на адрес загрузки Google."""
    url = (UPLOAD if upload is not None else BASE) + path
    data = upload if upload is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + token())
    req.add_header('Content-Type', ctype or 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw.decode(errors='replace')[:500]}


def app(path=''):
    return f'/applications/{PKG}{path}'


if __name__ == '__main__':
    k = json.loads(KEY.read_text())
    print('аккаунт:', k['client_email'])
    st, ed = call('POST', app('/edits'), {})
    print('открыть черновик правок: HTTP', st)
    if st != 200:
        print(' ', (ed.get('error') or {}).get('message', ed))
        sys.exit(1)
    st2, _ = call('DELETE', app(f"/edits/{ed['id']}"))
    print('удалить черновик: HTTP', st2)
    print('✓ доступ к Padel Magas есть')
