"""Отправляет сборку на проверку TestFlight, после которой заработает
публичная ссылка https://testflight.apple.com/join/ujgg3cvu

Всё остальное уже заполнено. Не хватает единственного — телефона контактного
лица: поле обязательное у Apple, номер не публикуется, его видит только
проверяющий. Впишите его ниже и запустите:

    ASC_KEY_ID=... ASC_ISSUER_ID=... python3 scripts/asc/submit-beta.py
"""
import importlib.util, os, sys, pathlib

PHONE = ''          # ← сюда телефон в формате +7XXXXXXXXXX
FIRST = 'Jabrail'
LAST  = 'Tochiev'
EMAIL = 'nayzcrkkeq7677@hotmail.com'

APP   = '6808335944'
BUILD = '58f1dd55-f041-4f3a-873e-ec8b0b43b153'

here = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('asc', here / 'asc.py')
asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)

if not PHONE:
    print('Впишите телефон в переменную PHONE и запустите снова.'); sys.exit(1)

st, out = asc.call('GET', f'/v1/apps/{APP}/betaAppReviewDetail')
detail_id = out['data']['id']

st, out = asc.call('PATCH', f'/v1/betaAppReviewDetails/{detail_id}', {"data": {
    "type": "betaAppReviewDetails", "id": detail_id,
    "attributes": {"contactFirstName": FIRST, "contactLastName": LAST,
                   "contactEmail": EMAIL, "contactPhone": PHONE,
                   "demoAccountRequired": False,
                   "notes": "Вход в приложение не требуется, аккаунт не создаётся. "
                            "Данные демонстрационные: цены, часы и названия площадок учебные."}}})
print('контакт для проверки: HTTP', st)
if st != 200:
    print(out); sys.exit(1)

st, out = asc.call('POST', '/v1/betaAppReviewSubmissions', {"data": {
    "type": "betaAppReviewSubmissions",
    "relationships": {"build": {"data": {"type": "builds", "id": BUILD}}}}})
print('отправка на проверку: HTTP', st)
if st == 201:
    print('состояние:', out['data']['attributes'].get('betaReviewState'))
    print('после одобрения ссылка заработает: https://testflight.apple.com/join/ujgg3cvu')
else:
    print(out)
