"""Загрузка скриншотов в App Store Connect.
Порядок у Apple такой: создать набор → зарезервировать файл → залить байты
по выданным адресам → подтвердить контрольной суммой."""
import hashlib, importlib.util, json, os, urllib.request, urllib.error
spec = importlib.util.spec_from_file_location('asc','asc.py'); asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)
VID='d98f5a08-4d50-4543-b6f7-087427d3b640'
FILES=['as-1-home.png','as-2-grid.png','as-3-court.png','as-4-tournaments.png','as-5-club.png']

st,out = asc.call('GET', f'/v1/appStoreVersions/{VID}/appStoreVersionLocalizations')
loc = out['data'][0]['id']

st,out = asc.call('POST','/v1/appScreenshotSets', {"data":{"type":"appScreenshotSets",
  "attributes":{"screenshotDisplayType":"APP_IPHONE_67"},
  "relationships":{"appStoreVersionLocalization":{"data":{
      "type":"appStoreVersionLocalizations","id":loc}}}}})
if st != 201:
    print('набор не создан:', st, json.dumps(out, ensure_ascii=False)[:300]); raise SystemExit(1)
sid = out['data']['id']
print('набор скриншотов создан:', sid)

for i, f in enumerate(FILES, 1):
    data = open(f,'rb').read()
    st,out = asc.call('POST','/v1/appScreenshots', {"data":{"type":"appScreenshots",
      "attributes":{"fileSize":len(data),"fileName":f},
      "relationships":{"appScreenshotSet":{"data":{"type":"appScreenshotSets","id":sid}}}}})
    if st != 201:
        print(f'  ✗ {f}: резерв не удался', st, json.dumps(out, ensure_ascii=False)[:200]); continue
    shot = out['data']; ops = shot['attributes']['uploadOperations']
    for op in ops:
        chunk = data[op['offset']:op['offset']+op['length']]
        req = urllib.request.Request(op['url'], method=op['method'], data=chunk)
        for h in op['requestHeaders']: req.add_header(h['name'], h['value'])
        urllib.request.urlopen(req, timeout=120).read()
    st,out = asc.call('PATCH', f"/v1/appScreenshots/{shot['id']}", {"data":{
      "type":"appScreenshots","id":shot['id'],
      "attributes":{"uploaded":True,"sourceFileChecksum":hashlib.md5(data).hexdigest()}}})
    print(f'  {"✓" if st==200 else "✗"} {i}. {f} — {len(data)//1024} КБ')
