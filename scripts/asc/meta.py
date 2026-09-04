import json, importlib.util
spec = importlib.util.spec_from_file_location('asc','asc.py'); asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)
APP='6808335944'; VID='d98f5a08-4d50-4543-b6f7-087427d3b640'
PRIVACY='https://padel.217-114-8-196.sslip.io/privacy.html'
SUPPORT='https://padel.217-114-8-196.sslip.io/'

def show(l, st, out):
    ok = st in (200,201,204)
    print(f'  {"✓" if ok else "✗"} {l}: HTTP {st}')
    if not ok:
        for e in out.get('errors',[])[:2]: print('     ', str(e.get('detail'))[:180])
    return ok

# 1. Описание в магазине
st,out = asc.call('GET', f'/v1/appStoreVersions/{VID}/appStoreVersionLocalizations')
loc = out['data'][0]['id']
st,out = asc.call('PATCH', f'/v1/appStoreVersionLocalizations/{loc}', {"data":{
  "type":"appStoreVersionLocalizations","id":loc,"attributes":{
    "description":
      "Запись на корт в падел-центре Magas Padel — в два нажатия.\n\n"
      "СВОБОДНОЕ ВРЕМЯ СРАЗУ ВИДНО\n"
      "Открываете приложение и видите, сколько часов свободно сегодня и когда "
      "ближайшее окно. Не нужно звонить и уточнять.\n\n"
      "ВЫБОР НА ОДНОМ ЭКРАНЕ\n"
      "Сетка показывает часы и площадки вместе. Нажали на клетку — выбрали "
      "и время, и корт. Можно взять час, два или три подряд: приложение само "
      "покажет, сколько времени свободно, и не даст выбрать больше.\n\n"
      "ЧЕСТНАЯ ЦЕНА\n"
      "Стоимость считается по часам: если игра начинается днём и заходит "
      "на вечер, часы складываются по своим тарифам. Итог виден до записи.\n\n"
      "ТУРНИРЫ\n"
      "Ближайшие турниры клуба: дата, формат, взнос и сколько мест осталось. "
      "Запись в одно нажатие, отмена — тоже.\n\n"
      "СВОИ ЗАПИСИ ПОД РУКОЙ\n"
      "Все брони и записи на турниры в одном списке. Планы изменились — "
      "отмена в одно нажатие, время сразу освобождается для других игроков.\n\n"
      "Шесть падел-кортов и мини-футбольное поле в Магасе.",
    "keywords":"падел,корт,запись,бронь,магас,теннис,спорт,турнир,мини-футбол",
    "promotionalText":"Свободное время всех кортов на одном экране. Запись в два нажатия.",
    "supportUrl":SUPPORT,
    "whatsNew":"Первая версия приложения."}}})
show('описание, ключевые слова, поддержка', st, out)

# 2. Политика конфиденциальности и подзаголовок
st,out = asc.call('GET', f'/v1/apps/{APP}/appInfos')
info = out['data'][0]['id']
st,out = asc.call('GET', f'/v1/appInfos/{info}/appInfoLocalizations')
il = out['data'][0]['id']
st,out = asc.call('PATCH', f'/v1/appInfoLocalizations/{il}', {"data":{
  "type":"appInfoLocalizations","id":il,
  "attributes":{"subtitle":"Запись на корт в Магасе","privacyPolicyUrl":PRIVACY}}})
show('политика конфиденциальности и подзаголовок', st, out)

# 3. Категория
st,out = asc.call('PATCH', f'/v1/appInfos/{info}', {"data":{
  "type":"appInfos","id":info,
  "relationships":{"primaryCategory":{"data":{"type":"appCategories","id":"SPORTS"}}}}})
show('категория «Спорт»', st, out)
