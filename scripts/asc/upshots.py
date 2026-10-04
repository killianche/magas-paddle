"""Замена скриншотов в App Store Connect.

Старые снимки версия наследует от предыдущей — их надо удалить, иначе
в магазине останутся прежние экраны. Порядок у Apple такой: удалить старые →
создать набор (если его нет) → зарезервировать файл → залить байты по выданным
адресам → подтвердить контрольной суммой.

    ASC_KEY_ID=... ASC_ISSUER_ID=... python3 scripts/asc/upshots.py
"""
import hashlib, importlib.util, json, pathlib, urllib.request
spec = importlib.util.spec_from_file_location('asc', pathlib.Path(__file__).parent / 'asc.py')
asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)

VID = '36215d4b-1d43-46da-bc51-616c40582fe7'   # 1.0.3
FILES = ['as-1-home.png', 'as-2-courts.png', 'as-3-court.png', 'as-4-prices.png', 'as-5-club.png']
HERE = pathlib.Path(__file__).parent

st, out = asc.call('GET', f'/v1/appStoreVersions/{VID}/appStoreVersionLocalizations')
loc = out['data'][0]['id']

# ── старые снимки ───────────────────────────────────────────────────────
st, out = asc.call('GET', f'/v1/appStoreVersionLocalizations/{loc}/appScreenshotSets')
sid = None
for s in out.get('data', []):
    if s['attributes'].get('screenshotDisplayType') != 'APP_IPHONE_67':
        continue
    sid = s['id']
    st2, old = asc.call('GET', f"/v1/appScreenshotSets/{sid}/appScreenshots")
    for sh in old.get('data', []):
        d, _ = asc.call('DELETE', f"/v1/appScreenshots/{sh['id']}")
        print(f"  удалён старый {sh['attributes'].get('fileName')}: HTTP {d}")

if not sid:
    st, out = asc.call('POST', '/v1/appScreenshotSets', {"data": {
        "type": "appScreenshotSets",
        "attributes": {"screenshotDisplayType": "APP_IPHONE_67"},
        "relationships": {"appStoreVersionLocalization": {
            "data": {"type": "appStoreVersionLocalizations", "id": loc}}}}})
    if st != 201:
        print('набор не создан:', st, json.dumps(out, ensure_ascii=False)[:300]); raise SystemExit(1)
    sid = out['data']['id']
    print('набор скриншотов создан:', sid)

# ── новые ───────────────────────────────────────────────────────────────
for i, f in enumerate(FILES, 1):
    data = (HERE / f).read_bytes()
    st, out = asc.call('POST', '/v1/appScreenshots', {"data": {
        "type": "appScreenshots",
        "attributes": {"fileSize": len(data), "fileName": f},
        "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": sid}}}}})
    if st != 201:
        print(f'  ✗ {f}: резерв не удался', st, json.dumps(out, ensure_ascii=False)[:200]); continue
    shot = out['data']
    for op in shot['attributes']['uploadOperations']:
        chunk = data[op['offset']:op['offset'] + op['length']]
        req = urllib.request.Request(op['url'], method=op['method'], data=chunk)
        for h in op['requestHeaders']:
            req.add_header(h['name'], h['value'])
        urllib.request.urlopen(req, timeout=180).read()
    st, out = asc.call('PATCH', f"/v1/appScreenshots/{shot['id']}", {"data": {
        "type": "appScreenshots", "id": shot['id'],
        "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}})
    print(f'  {"✓" if st == 200 else "✗"} {i}. {f} — {len(data) // 1024} КБ')
