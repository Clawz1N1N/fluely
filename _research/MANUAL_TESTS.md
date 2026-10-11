# MANUAL TESTS (Українською)

## Як запустити з джерела (from source)
1. Відкрий термінал у папці `pluely` (тут `package.json`).
2. `npm install` — встановити залежності (перше запускання, ~2-5 хв).
3. `npm run tauri dev` — запустити Tauri у режимі розробки (dev-сервер http://localhost:1420).
   - Перше зібрання Rust триває довше (~5-15 хв).
   - З'явиться вікно Pluely зверху екрана.
4. `npm run tauri build` — зібрати інсталятор (Windows MSI/NSIS) у `src-tauri/target/release`.

## Фаза 0 — перевірка базової лінії (baseline)
- [ ] `npm install` завершився без помилок.
- [ ] `npm run build` завершився без помилок (TypeScript + Vite). Зафіксувати попередження.
- [ ] `cargo check` (у `src-tauri`) завершився без помилок. Зафіксувати попередження.
- [ ] `npm run tauri dev` — вікно відкривається зверху, без помилок у консолі.
- [ ] Порівняти рядки UI зі скріншотами: якщо бачиш "Listen to the conversation", "waiting for audio", "Not listening", "FOLLOW-UPS", "Your plan", "Enable Pluely API" — це НЕ ця папка (див. CHANGELOG). Зупинитись.

(Подальші фази 1-6 додадуться після зняття блокування Фази 0.)


## Phase 2 — shell оверлей
### Test 1: три стани UI
1. Запусти `npm run tauri dev`.
2. Відкрий Dashboard → Settings → UI mode.
3. Перемикни `ui_mode`: side / top / buttons.
4. Переконайся, що з'являються відповідні вікна (смуги або кнопки).
5. `[NEEDS HUMAN CHECK]` — як виглядають смуги/кнопки на екрані.

### Test 2: завжди зверху
1. Відкри Task Manager → "Always on top".
2. Переконайся, що shell вікна залишаються над Task Manager.
3. `[NEEDS HUMAN CHECK]` — поведінка в exclusive fullscreen (відео гра).

### Test 3: непрозорість кліків
1. Клікни поза shell UI (на робочий стіл / іншу програму).
2. Переконайся, що клік проходить далі (вікно не блокує).
3. `[NEEDS HUMAN CHECK]` — чи дійсно кліки проходять.

### Test 4: захист від захоплення
1. Натисни Win+Shift+S (Snipping Tool) → зроби скріншот.
2. Натисни PrintScreen.
3. Відкри OBS → вікневий/екранний capture.
4. Переконайся, що shell НЕ видно на скріншотах/в OBS.
5. `[NEEDS HUMAN CHECK]` — результат Win+Shift+S / PrintScreen / OBS.
6. Запусти команду `get_window_display_affinity` для кожного shell-вікна — має повернути `WDA_EXCLUDEFROMCAPTURE` (значення 17) на Windows.

### Test 5: axis-locked drag
1. Перетягни бічну смугу (side) — має рухатися ТІЛЬКИ по горизонталі (y не змінюється).
2. Перетягни верхню смугу (top) — тільки по вертикалі.
3. `[NEEDS HUMAN CHECK]`.

### Test 6: reset layout
1. Натисни hotkey reset layout (або кнопку в Settings).
2. Переконайся, що всі вікна повертаються на початкові позиції.

## Phase 3 — continuous mode
### Test 7: dedup
1. Запусти continuous mode (Settings → Capture → mode=interval, interval=5s).
2. Залиш екран нерухомим — запити НЕ відправляються (нічого не змінилось).
3. Зміни щось на екрані — після інтервалу відправляється один запит.
4. `[NEEDS HUMAN CHECK]`.

### Test 8: one-request batcher
1. Поговори (STT) і зміни екран одночасно.
2. Переконайся, що приходить ОДИН запит (транскрипт + кадри).

### Test 9: vision (text-only model)
1. Налаштуй текстовий провайдер з `supportsImages=false`.
2. Запитай щось про вміст екрана.
3. Переконайся, що модель отримує "SCREEN CONTEXT" (OCR текст).
4. `[NEEDS HUMAN CHECK]` — якість OCR.

## Phase 4 — провайдери / ліміти
### Test 10: fallback
1. Налаштуй два провайдери (rank 1 і 2).
2. Зроби rank-1 недоступним (невірний ключ / URL).
3. Переконайся, що запит автоматично йде на rank-2.
4. `[NEEDS HUMAN CHECK]`.

### Test 11: neutral mode
1. Вистав низький ліміт (наприклад, 2 на хвилину).
2. Перевищ ліміт — переконайся, що агент нічого не sendить.
3. UI показує лічильник і countdown.
4. `[NEEDS HUMAN CHECK]`.

## Phase 5 — structured output / TTS
### Test 12: теги main/side/speak
1. Запитай щось — переконайся, що MAIN потрапляє в головну панель, SIDE — в бічну, SPEAK — під відповіддю.
2. `[NEEDS HUMAN CHECK]`.

### Test 13: KaTeX
1. Запитай щось з формулами (`$x^2$`, `$$...$$`, `\(...\)`, `\[...\]`).
2. Переконайся, що формули рендеряться (не сирий текст).
3. `[NEEDS HUMAN CHECK]` — рендеринг Streamdown.

### Test 14: TTS
1. Увімкни TTS (Settings → TTS).
2. Переконайся, що озвучує українською (список голосів на цій машині).
3. Перевір pause / stop / seek / speed.
4. Перевір hotkey Ctrl+Shift+T (вимкнути TTS).
5. `[NEEDS HUMAN CHECK]` — як звучить, які голоси доступні.

### Test 15: підсвітка слів
1. Під час озвучення переконайся, що поточне слово підсвічується.
2. `[NEEDS HUMAN CHECK]`.
