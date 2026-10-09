"""Клиент App Store Connect API. Ключ читается из файла, в вывод не попадает."""
import os, time, json, sys, pathlib, urllib.request, urllib.error
import jwt

KEY_PATH = os.environ.get('ASC_KEY_PATH', '/root/projects/Magas Paddle/secrets/AuthKey.p8')

def _ident(name):
    """Идентификатор ключа: из окружения, иначе из asc.env рядом с самим ключом.
    Так скрипты запускаются одной командой, без подстановки переменных руками."""
    if os.environ.get(name):
        return os.environ[name]
    envfile = pathlib.Path(KEY_PATH).with_name('asc.env')
    if envfile.exists():
        for line in envfile.read_text().splitlines():
            line = line.strip()
            if line.startswith('export '):
                line = line[7:].strip()
            if line.startswith(name + '='):
                return line.split('=', 1)[1].strip().strip('\'"')
    raise SystemExit(f'Не найден {name}. Задайте его в окружении или в {envfile}')

KEY_ID   = _ident('ASC_KEY_ID')
ISSUER   = _ident('ASC_ISSUER_ID')
BASE     = 'https://api.appstoreconnect.apple.com'

def token(exp=1200):
    with open(KEY_PATH) as f:
        key = f.read()
    now = int(time.time())
    return jwt.encode(
        {'iss': ISSUER, 'iat': now, 'exp': now + exp, 'aud': 'appstoreconnect-v1'},
        key, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header('Authorization', 'Bearer ' + token())
    req.add_header('Content-Type', 'application/json')
    data = json.dumps(body).encode() if body else None
    try:
        with urllib.request.urlopen(req, data, timeout=40) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

if __name__ == '__main__':
    st, out = call(sys.argv[1] if len(sys.argv) > 1 else 'GET',
                   sys.argv[2] if len(sys.argv) > 2 else '/v1/apps?limit=200')
    print('HTTP', st)
    print(json.dumps(out, ensure_ascii=False, indent=2))
