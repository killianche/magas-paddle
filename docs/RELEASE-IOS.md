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

## Первая сборка: что пришлось починить

Пять заходов, каждая ошибка настоящая:

1. **`MAC verification failed during PKCS12 import`** — keychain macOS не принимает
   контейнеры, которые OpenSSL 3 делает по умолчанию (MAC sha256, AES-256).
   Пересобрали с `-legacy`, MAC sha1 и 3DES.
2. **Схема определилась как `contentsdata`** — `ls` без `-d` показывал содержимое
   каталога `.xcworkspace`, а не его имя. Заодно добавили `set -o pipefail`:
   статус `xcodebuild` терялся в конвейере с `xcpretty`, и провал считался успехом.
3. **`RuntimeScheduler cannot be annotated with SWIFT_RETURNS_RETAINED`** —
   раннер по умолчанию даёт Xcode 16.4, он слишком старый для SDK 57.
   Явно выбираем новейший установленный.
4. **Xcode 26.3 тоже не подошёл** — та же ошибка Swift/C++. Перешли на образ `macos-26`,
   там Xcode 26.6.
5. **`no member named 'executeSync' in worklets::WorkletRuntime`** — `expo-modules-core`
   ждал API, которого нет в установленной версии worklets. `expo install --fix`
   поднял expo до 57.0.19, core до 57.0.15.

Сборка №6 прошла целиком: архив, `.ipa` 17 МБ, загрузка без ошибок,
`UPLOAD SUCCEEDED`. В App Store Connect состояние **VALID**.

Создана внутренняя группа тестирования «Команда клуба» с доступом ко всем сборкам,
владелец аккаунта добавлен тестировщиком.

## Не проверено

- Поведение приложения на настоящем устройстве — **НЕ ПРОВЕРЕНО**.
- Пуш-уведомления в Магасе на мобильном интернете.

## После публикации

**Отозвать ключ App Store Connect** (`QCSQ66NC4Y`) и токен GitHub — оба проходили
через переписку. Ключ видит весь аккаунт, включая опубликованный an-Nur:
ограничить командный ключ приложениями Apple не позволяет.
