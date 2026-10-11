# Аудит передачі — 2026-10-11

Початковий стан: `custom-overlay`, HEAD `a954976`, тег `takeover-start`. Незакомічені lock-файли і зняття BOM з Cargo.toml збережені. Прочитані всі 55 наявних файлів `_research/` та кожен наявний змінений/доданий файл у `git diff master...custom-overlay`; видалення перевірені. Читання розділене між основним агентом і трьома незалежними аудиторами (фронтенд, Rust, історичні додатки); аудитори нічого не змінювали.

## Твердження попереднього FINAL_REPORT → реальність

| Твердження | Реальність і початковий доказ |
|---|---|
| All 6 phases implemented / correct-by-construction | Немає перевіреної збірки; baseline-typescript → exit 2, baseline-encoding → exit 1 (BUILD_LOG.md). |
| Усі ліцензійні залишки прибрані | Константи залишено: app.context.tsx:134,147; context.type.ts:43; ShortcutManager.tsx:262. |
| Новий shell замінив старе вікно | Старе `main` видиме: tauri.conf.json:32; смуги містять лише PLUELY: ShellSideStrip.tsx:26, ShellTopStrip.tsx:25. |
| Axis drag / DPI / монітори | clientX/clientY змішані з фізичними координатами: useShellDrag.ts:20; затиснення за старим монітором: shell.rs:264. Збереження лише за label, без монітора: shell.rs:72. |
| Вікно відповідей і чат | answer_ask відкидає питання: shell.rs:638; AnswerWindow.tsx:43 містить placeholder, setters відповіді не викликаються. Вікно не resizable/focusable: shell.rs:153,166. |
| Continuous capture / batcher повністю реалізовані | Немає слухача continuous-batch; сирий RGBA декодується як файл: continuous.rs:335,355; in-flight скидається через 2 секунди: continuous.rs:429. |
| Providers / ranking / neutral | Жоден реальний запит не викликає pick_provider; один RateWindow одночасно змінюється трьома allow: providers.rs:170. Немає секунди, збереження чи глобальних s/m/h. |
| Парсер толерантний | Побайтове приведення до char псує українську/може викликати panic: structured.rs:39,62; streaming-тести суперечать реалізації: :199,211. |
| KaTeX перевірений кодом | SSR на встановленому Streamdown: тільки $$ працює; три інші роздільники не створюють katex. Markdown/index.tsx:16 не передає plugins. |
| TTS + hotkeys | useTts ніде не монтується; третє речення не відтворюється через chain лише першого utterance: useTts.ts:115. Backend/voice/language не підключені. |
| Keychain fallback безпечний | Хибні import і сигнатури: secure.storage.ts:10. Реальні d.ts: saveItem(key,password), getItem(key), removeItem(key). Міграція не викликається; відкриті keys: app.context.tsx:409,419. |
| OCR/UIA достатньо увімкнути features | Є безумовні заглушки: vision.rs:172,281; ui_automation.rs:31. Необхідний код реалізації. |
| Немає інструментів/кешів/залежностей | Зараз встановлені Node22, npm12, Rust1.98.1, node_modules, cargo registry, MSVC14.51 і14.44, Windows SDK. Старий BLOCKED не застосовується без нової перевірки. |
| Захист capture підтверджений | Лише код залежності: tao-0.34.2 windows/window.rs:1090 викликає WDA_EXCLUDEFROMCAPTURE=17. GetWindowDisplayAffinity та OBS/PrintScreen ще не виконувалися. |

## Дефекти за пріоритетом

P0: BOM/ANSI/mixed EOL у 63 файлах; шість синтаксично зламаних фронтенд-файлів; dead re-export pluely.api; неправильний keychain import; відсутнє selectedAudioDevices у Context; непідключені shell дії/чат; старе видиме main; NOACTIVATE/focusable=false для чату; потенційно синхронне створення WebView із IPC deadlock на Windows; CSP не дозволяє IPC/WASM.

Rust compilation P0: неправильний namespace HWND_TOPMOST/SWP; SetWindowPos вимагає Option<HWND>; content_protected потребує bool; немає set_opacity; primary_monitor Option; відсутній Manager у providers/vision/tts; image traits/type mismatches; несумісні UI node types; module/type використані як значення. MSVC ring D8050 потрібно відтворити і діагностувати.

P1: registry не використовується, лімітер неправильно рахує; немає persistence/countdown; continuous не має споживача, втрачає канали/кадри і допускає overlap; секрети не мігрують; MAIN/SIDE/SPEAK не підключені; TTS не працює; налаштування shell/capture/vision/providers/TTS відсутні.

P2: OCR/UIA/VLM заглушки; не всі KaTeX роздільники; UTF-8 парсер; осьове перетягування DPI/монітори; drag запускає click; presets не редагуються; screenshot closure використовує застарілі attachments; HTTP(S) завжди обирає browser fetch → CORS.

## Матриця підключення на початку передачі

Статуси описують код до виправлень. WIRED означає наявність шляху, не успішний runtime-тест.

| Вимога / фаза | UI → hook/command → Rust → UI | Статус / доказ |
|---|---|---|
| 1.1 ліцензії | Старі consumers → Context true; custom shortcut текст | PARTIAL; app.context:134, ShortcutManager:262 |
| 1.2 remote | own curl → fetchAIResponse/fetchSTT; api/activate видалені | PARTIAL; functions/index:4 dead re-export |
| 1.3 telemetry | analytics/PostHog видалені | WIRED; lib.rs, package/Cargo manifests |
| 1.4 updater | Updater → null, плагін/endpoint видалені | WIRED; components/updater/index.tsx |
| 1.5 presets | локальні cards → systemPrompt → request; редагування немає | PARTIAL; PluelyPrompts:25 |
| 1.6 model/language | DevSpace → useSettings/Context → curl; Responses → enhanced prompt | PARTIAL; app.context:441, ai-response:25 |
| 1.7 dead code | залишки типів/imports/станів | PARTIAL; baseline tsc |
| 2.1 tight/hit-test | strip/button → window builder → native HWND | PARTIAL; strip пустий, button44 має padding |
| 2.2 topmost/protected | builder/watchdog → tao WDA17 → native window | PARTIAL; shell:169,350; не компілюється |
| 2.3 A/B/C | component → get_ui_mode/set_ui_mode → save only | PARTIAL; shell:432 не rebuild |
| 2.3 actions | shell-action → немає слухача | MISSING; ShellButton:61 |
| 2.3 layout/reset/hide | command → labels/state; hide лише main | PARTIAL; shortcuts:180, shell:391 |
| 2.4 answer/chat | input → answer_ask → Ok без дії → placeholder | STUB; shell:638, AnswerWindow:43 |
| 2.5 capabilities | shell labels → ACL; capture labels відсутні | PARTIAL; capabilities/*.json |
| 3.1 supportsImages | Context → curl auto-derivation; override не врахований | PARTIAL; app.context:396 |
| 3.2 capture settings | UI відсутній → Rust settings in memory | MISSING; continuous:227 |
| 3.3 frames | start_continuous → capture/batch → event без consumer | PARTIAL; continuous:420 |
| 3.3 system/mic/one request | старі незалежні hooks → незалежні requests | MISSING; useSystemAudio:504 |
| 3.4 OCR/UI | UI відсутній → build_screen_context без caller → fabricated result | STUB; vision:172, ui_automation:31 |
| 3.4 VLM/full | mode → placeholder → SCREEN CONTEXT | STUB; vision:281 |
| 4.1 independent providers | legacy AI/STT curl → direct fetch; TTS preset UI відсутній | PARTIAL; DevSpace, ai-response:167 |
| 4.2 fallback | pick_provider немає caller → unused Rust state | MISSING; providers:293 |
| 4.3 limits/persistence | UI/caller немає → shared RateWindow | MISSING; providers:170 |
| 4.4 neutral/recovery | placeholder span → no subscription | MISSING; AnswerWindow:64 |
| 5.1 protocol/stream | prompt без протоколу → raw stream; no parser/TTS | MISSING; ai-response:39 |
| 5.2 KaTeX | Markdown → default Streamdown → тільки $$ | PARTIAL; SSR read-only probe |
| 5.3 TTS/highlight/binds | unused hook → WebSpeech; shortcuts → main custom event | MISSING; useTts:25, shortcuts:94 |
| 6.1 keychain | unused helper → wrong API → plaintext fallback | MISSING; secure.storage:10 |
| 6.2 permissions/CSP | config → ACL; IPC/WASM omissions | PARTIAL; tauri.conf:44 |
| 6.3 cleanup/locks | manifests changed, unused libs/types/imports retained | PARTIAL; baseline tsc |
| 6.4 tests | Rust tests authored; no npm test; none run | PARTIAL; structured:199 |
| 6.5 installer/clean profile | немає артефакту/запуску | MISSING |
| 6.6 README Ukrainian | файл ANSI, показаний як пошкоджений UTF-8 | PARTIAL; baseline-encoding |
| 6.7 honest report | unverified completion claims | MISSING; old FINAL_REPORT:5 |

## Корекції історичних нотаток

REPORT є описом старого snapshot, а не поточного коду. Він помилково описує GET /api/response як POST, неправильно вказує activation endpoint і не помічає updater endpoint у власному appendix. Твердження CHANGELOG про відсутність рядків у всій git історії спростоване `git grep master`. Старий Rust уже мав continuous audio; нова вимога — об'єднаний потік audio+screen+chat. `set_ignore_cursor_events` застосовується до всього вікна. Висновки щодо OBS/PrintScreen/fullscreen без запуску не приймаються.
