# Pluely Fork (custom-overlay)

Це форк Pluely (GPL-3.0) з кастомним оверлеєм, безплатними функціями, локальними провайдерами та без telemetry/updater.

## Що змінено

- **Вилучено все платне/віддалене/telemetry**: ліцензії, квоти, Pluely API, PostHog, auto-updater. Маршрутизатор завжди локальний.
- **Новий shell оверлей**: замість одного вікна 600x54 — кілька вікон (strips / buttons / answer), завжди зверху, захищені від захоплення екрана (`contentProtected` > `WDA_EXCLUDEFROMCAPTURE` на Windows).
- **Три стани UI** (`ui_mode`): `side` (бічні смуги), `top` (верх/низ), `buttons` (окремі кнопки).
- **Неперервний режим (mode 3)**: Rust-цикл захоплення кадрів + dedup + батчер (один запит).
- **Vision для текстових моделей**: OCR (Windows.Media.Ocr), UI Automation, VLM.
- **Провайдери**: реєстр з ранжуванням, fallback, лімітами запитів, neutral mode.
- **Структурована відповідь**: `<main>`, `<side>`, `<speak>` теги + стримінг парсер.
- **TTS**: системні голоси (Web Speech API) з підсвіткою слів.

## Як запустити / зібрати

Потрібні: Node.js 18+, Rust (stable), Windows 10/11, Tauri deps (https://tauri.app/start/prerequisites).

```
npm install
npm run dev          # або: npm run tauri dev
npm run build        # tsc + vite
cd src-tauri
cargo check
npm run tauri build  # Windows installer (MSI/NSIS) у src-tauri/target/release/bundle
```

## Де знаходяться налаштування

- **Режим UI / shimmer / прозорість answer**: `shell_layout.json` (директорія даних додатку); команди `set_ui_mode`, `set_shimmer`, `set_answer_opacity`.
- **Захоплення (continuous)**: `get_capture_settings` / `update_capture_settings` (режим, інтервал, монітор, max_frames, downscale, JPEG quality, dedup threshold).
- **Vision**: `get_vision_settings` / `update_vision_settings` (mode: ocr/ocr+ui/vlm/full).
- **Провайдери / ліміти / neutral**: `list_providers`, `upsert_provider`, `pick_provider`, `set_global_daily_limit`, `set_neutral_mode`.
- **TTS**: `get_tts_settings` / `update_tts_settings` / `set_tts_enabled`.
- **Користувацькі провайдери**: сторінка "Dev space" (шаблони curl).

## Горячі клавіші (типові)

- Toggle Dashboard: `Ctrl+Shift+D`
- Toggle Window: `Ctrl+\`
- System Audio: `Ctrl+Shift+M`
- Voice Input: `Ctrl+Shift+A`
- Screenshot: `Ctrl+Shift+S`
- TTS Toggle: `Ctrl+Shift+T`
- TTS Stop: `Ctrl+Shift+O`
- TTS Pause: `Ctrl+Shift+P`
- TTS Seek Back/Forward: `Ctrl+Shift+<` / `Ctrl+Shift+>`

(Налаштовується на сторінці "Cursor & Shortcuts".)

## Як додати провайдер

1. Сторінка "Dev space" > "Add Custom Provider".
2. Вставте шаблон curl з місцями `{{API_KEY}}`, `{{MODEL}}`, `{{SYSTEM_PROMPT}}`, `{{TEXT}}`, `{{IMAGE}}`.
3. Вкажіть `responseContentPath` (шлях JSON до відповіді).
4. Для текстових моделей вимкніть `supportsImages` — тоді використовується Vision pipeline (OCR/UI/VLM).

## Відомі обмеження

- **Linux/Wayland**: захоплення екрана та завжди-верху обмежені (Wayland не дозволяє произвольні topmost вікна).
- **Exclusive fullscreen**: справжній exclusive fullscreen (наприклад, гра) володіє дисплеєм — нічого не може бути зверху.
- **OCR / UI Automation**: потребують увімкнення feature `Media_Ocr` / `Accessibility` crates `windows` та встановленого OCR language pack (Windows). Зараз заглушки з TODO (див. `_research/BLOCKED.md`).
- **VLM mode**: потребує налаштування vision-провайдера (Phase 4); зараз placeholder.
- **KaTeX**: `remark-math` + `rehype-katex` встановлені; рендеринг через Streamdown — потребує ручної перевірки `[NEEDS HUMAN CHECK]`.

## Як продовжити роботу

Див. `_research/IMPLEMENTATION_STATE.md`, `_research/PHASES_SPEC.md`, `_research/DECISIONS.md`, `_research/BLOCKED.md`, `_research/MANUAL_TESTS.md`.

Це форк під GPL-3.0. LICENSE збережено.
