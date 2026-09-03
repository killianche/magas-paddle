# Выпуск iOS-сборки

Собирается на macOS-раннере GitHub Actions. Облако Expo не используется:
`expo prebuild` создаёт нативный проект, дальше обычные `xcodebuild` и `altool`.

## Как запустить

**Пушем в ветку:**
```bash
git push origin main:build-ios
```
**Или кнопкой:** вкладка Actions → «iOS TestFlight» → Run workflow.
Кнопка требует права Actions у токена; пуш в ветку — только права на код.

Ход сборки: https://github.com/killianche/magas-paddle/actions

## Что где лежит

| Что | Где |
|---|---|
| Сборка | `.github/workflows/ios.yml` |
| Приложение | Magas Padel, `id 6808335944` |
| Bundle ID | `ru.padelmagas.app`, идентификатор `G7ZQYVHS44` |
| Team ID | `SGS6KFDCD4` |
| Сертификат | Apple Distribution `797Y7V69RB`, до 03.09.2027 |
| Профиль | «Magas Padel App Store», ACTIVE |

Секреты репозитория: `APPLE_CERT_P12_BASE64`, `APPLE_CERT_P12_PASSWORD`,
`APPLE_PROFILE_BASE64`, `ASC_KEY_P8_BASE64`, `ASC_KEY_ID`, `ASC_ISSUER_ID`.
Их копии на сервере — в `secrets/`, права `600`, в git не попадают.

## Как это работает

1. `expo prebuild --platform ios` — из `app.json` создаётся папка `ios/`
2. `pod install`
3. Сертификат импортируется во временную связку ключей, живущую один запуск
4. Профиль кладётся в `~/Library/MobileDevice/Provisioning Profiles`
5. `xcodebuild archive` с ручной подписью, затем экспорт `.ipa`
6. `xcrun altool --upload-app` с ключом App Store Connect
7. `.ipa` дополнительно сохраняется артефактом запуска

**Проверено:** `altool` устарел только для нотаризации macOS
([TN3147](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool)),
для загрузки в App Store Connect остаётся штатным.

## Не проверено

- **Первая сборка ещё не проходила.** Нативный проект генерируется впервые:
  возможны правки по именам схем, подам и новой архитектуре RN.
- Требуется ли Beta App Review для внутренних тестировщиков TestFlight.
- Поведение приложения на настоящем устройстве.

## После публикации

**Отозвать ключ App Store Connect** (`QCSQ66NC4Y`) и токен GitHub — оба проходили
через переписку. Ключ видит весь аккаунт, включая опубликованный an-Nur:
ограничить командный ключ приложениями Apple не позволяет.
