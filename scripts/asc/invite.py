"""Приглашает друзей во внутреннее тестирование Magas Padel.

Каждый становится пользователем аккаунта с ролью MARKETING и доступом ТОЛЬКО
к нашему приложению: чужой проект an-Nur они не видят. Роль выбрана намеренно —
она не даёт доступа к сертификатам, иначе ограничение по приложениям не работает.

Использование: список правится ниже, затем python3 invite.py
"""
import json, importlib.util, sys
spec = importlib.util.spec_from_file_location('asc','asc.py'); asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)
APP = '6808335944'
GROUP = '459c22b5-496f-4f43-ad5f-bbf4acdc4c74'   # «Команда клуба»

# email, имя, фамилия
PEOPLE = [
    # ('friend@example.com', 'Имя', 'Фамилия'),
]

if not PEOPLE:
    print('Список пуст. Впишите друзей в PEOPLE и запустите снова.'); sys.exit(0)

for email, first, last in PEOPLE:
    st, out = asc.call('POST', '/v1/userInvitations', {"data": {"type": "userInvitations",
        "attributes": {"email": email, "firstName": first, "lastName": last,
                       "roles": ["MARKETING"],
                       "allAppsVisible": False,        # видит только то, что укажем
                       "provisioningAllowed": False},  # без доступа к сертификатам
        "relationships": {"visibleApps": {"data": [{"type": "apps", "id": APP}]}}}})
    if st == 201:
        print(f'  ✓ {email} — приглашение отправлено')
    else:
        detail = (out.get('errors') or [{}])[0]
        print(f'  ✗ {email} — HTTP {st}: {str(detail.get("detail"))[:140]}')
