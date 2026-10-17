# Дневник калорий — Android

Обёртка артефакта https://claude.ai/artifact/3e8FTVNy5bn9VtCbsT53AR в WebView, плюс напоминания о еде и виджеты.

## Что где

- `assets/index.html` — HTML артефакта, пропатченный `build_html.py` (тексты ошибок, `native.js`, сводка дня для виджетов и напоминаний).
- `assets/native.js` — подмена `window.claude`: `db` в IndexedDB на телефоне, `sample` через odirouter (OpenAI-совместимый `/chat/completions`), окно настроек (напоминания, копия данных).
- `src/app/caloriediary/`
  - `MainActivity` — WebView, HTTP-запросы в Java без CORS, выбор фото с камерой.
  - `Reminders` — ежедневные напоминания (завтрак, обед, перекус, ужин); не приходят, если этот приём уже записан сегодня. Перезапускаются после перезагрузки.
  - `Widgets` — три виджета: А 2×2 (кольцо), Б 4×2 (кольцо, БЖУ, «Записать»), В 4×1 (остаток, «+»).
  - `CamProvider` — файл для снимка с камеры.

## Настройки сборки

Ключ, модель и адрес API задаются при сборке. Порядок: переменные окружения, затем `secrets.properties` (в git не попадает, образец — `secrets.properties.example`), затем значения по умолчанию.

| Имя | По умолчанию |
| --- | --- |
| `ODIROUTER_API_KEY` | пусто: тогда ключ вводится в настройках приложения |
| `ODIROUTER_MODEL` | `free-vclaude-haiku-4.5` |
| `ODIROUTER_BASE` | `https://api.odirouter.ai/v1` |
| `SIGNING_KEYSTORE` | `signing/release.p12` (PKCS12, alias `diary`) |
| `SIGNING_PASSWORD` | — |

Ключ, зашитый в APK, можно достать из файла, поэтому APK никому не отдавай. Обновления подписывай тем же ключом, иначе Android не поставит их поверх.

## Сборка

**GitHub Actions** (`.github/workflows/apk.yml`): каждый пуш в `main` собирает подписанный APK, он лежит в артефакте `calorie-diary` у запуска. Нужны:

- секреты `ODIROUTER_API_KEY`, `SIGNING_KEYSTORE_BASE64` (`base64 -w0 release.p12`), `SIGNING_PASSWORD`;
- переменная `ODIROUTER_MODEL`, если нужна не модель по умолчанию.

**Локально с Android SDK:** `gradle assembleRelease` (AGP 8.5, Gradle 8.7, JDK 17), APK в `build/outputs/apk/release/`.

**Без Android SDK** (например, в облачном контейнере): `TOOLS=~/tools ./build.sh`, APK в `out/calorie-diary.apk`. В `TOOLS` нужны `aapt2` (npm-пакет `aaptjs3`), `android.jar` 34 (github Reginer/aosp-android-jar), `dx.jar` (Maven `com.jakewharton.android.repackaged:dalvik-dx:16.0.1`), `apksig.jar` (Maven `com.android.tools.build:apksig:2.3.0`). Подпись только v2.
