# Дневник калорий — Android

Два приложения из одного кода, плюс напоминания о еде и виджеты:

- **classic** «Дневник калорий» (`app.caloriediary`): обёртка артефакта https://claude.ai/artifact/3e8FTVNy5bn9VtCbsT53AR в WebView;
- **pet** «Пиксельный дневник» (`app.caloriediary.pet`): пиксельный тамагочи-дневник из папки `pet/`, с голосовыми сообщениями.

Это варианты сборки (product flavors) Gradle: Java, `native.js`, виджеты и напоминания общие, меняется только страница, имя и иконка. Пакеты разные, поэтому оба приложения ставятся рядом, и у каждого свои записи (перенести можно через «Сохранить копию» и «Загрузить из файла»).

## Что где

- `assets/index.html` — HTML артефакта, пропатченный `build_html.py` (тексты ошибок, `native.js`, сводка дня для виджетов и напоминаний).
- `pet/` — исходники пиксельной версии (`python3 pet/build.py` собирает `pet/index.html`). При каждой сборке варианта pet Gradle (задача `petHtml`) и `build.sh` прогоняют её через `build_html.py --pet` в `build/pet-assets/index.html`, он заменяет `assets/index.html`.
- `flavors/pet/` — что отличается у пиксельной версии: имя, иконка, шрифт Handjet (вшит, чтобы работал без сети), разрешение на микрофон.
- `assets/native.js` — подмена `window.claude`: `db` в IndexedDB на телефоне, `sample` через odirouter (OpenAI-совместимый `/chat/completions`), окно настроек (напоминания, копия данных; в пиксельной версии открывается из меню питомца), `window.__transcribe` для голоса: запись переводится в WAV 16 кГц и уходит в Gemini на odirouter.
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
| `ODIROUTER_AUDIO_MODEL` | пусто: первая бесплатная модель Gemini (flash) из списка odirouter |
| `SIGNING_KEYSTORE` | `signing/release.p12` (PKCS12, alias `diary`) |
| `SIGNING_PASSWORD` | — |

Ключ, зашитый в APK, можно достать из файла, поэтому APK никому не отдавай. Обновления подписывай тем же ключом, иначе Android не поставит их поверх.

## Сборка

**GitHub Actions** (`.github/workflows/apk.yml`): каждый пуш в `main` или `develop` собирает оба подписанных APK (`calorie-diary-…` и `pixel-diary-…`) и выкладывает их в релиз (из `develop` с префиксом `dev-`). PR в эти ветки собирает оба APK в артефакты запуска, без релиза. Нужны:

- секреты `ODIROUTER_API_KEY`, `SIGNING_KEYSTORE_BASE64` (`base64 -w0 release.p12`), `SIGNING_PASSWORD`;
- переменные `ODIROUTER_MODEL` и `ODIROUTER_AUDIO_MODEL`, если нужны не модели по умолчанию.

**Локально с Android SDK:** `gradle assembleClassicRelease assemblePetRelease` (AGP 8.5, Gradle 8.7, JDK 17, нужен `python3`), APK в `build/outputs/apk/<classic|pet>/release/`.

**Без Android SDK** (например, в облачном контейнере): `TOOLS=~/tools ./build.sh` (классическая, `out/classic/calorie-diary.apk`) и `FLAVOR=pet TOOLS=~/tools ./build.sh` (пиксельная, `out/pet/pixel-diary.apk`). В `TOOLS` нужны `aapt2` (npm-пакет `aaptjs3`), `android.jar` 34 (github Reginer/aosp-android-jar), `dx.jar` (Maven `com.jakewharton.android.repackaged:dalvik-dx:16.0.1`), `apksig.jar` (Maven `com.android.tools.build:apksig:2.3.0`). Подпись только v2.

## Веб-превью пиксельной версии

`python3 preview/build.py` собирает `preview/out/index.html`: та же страница, что в APK, но вместо Android-моста заглушка `preview/native-stub.js`. Её публикуют как Artifact на claude.ai (capability `sample` с картинками): ИИ идёт через Claude, голос подставляет пример фразы, напоминания, виджеты и выгрузка файла ничего не делают, записи хранятся только в браузере. Превью ветки develop: https://claude.ai/artifact/Vb5hi4MzZnYgV3gqzBHR5i. Для PR-ветки собирают тот же скрипт на её коде и публикуют отдельный Artifact, ссылку дают в треде.
