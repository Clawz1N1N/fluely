# Стан передачі — 2026-10-12

## Зроблено
- Гілка custom-overlay, початковий HEAD a954976, тег takeover-start. Початкові зміни користувача збережені.
- Повністю прочитані всі нотатки, додатки й змінені файли. TAKEOVER_AUDIT містить таблицю тверджень, дефекти й матрицю підключення.
- R1: commit63a22ac; BOM/ANSI/mixed-EOL виправлені цільово, український README відновлено з CP1251. Encoding exit0, два тести проходять. npm force=false, legacy-peer-deps=true.
- R2: commit4cffb2b, тег frontend-green. tsc exit0, production build exit0, Vite працював30.1с; HTTP200 для index і src/main, помилок у логах немає.
- Виправлені syntax/types/imports та ліцензійні споживачі у frontend; positional keychain API. Фактична міграція ключів ще не підключена.
- Схвалені install scripts oxide/esbuild; protobufjs має готовий runtime і не потребував скрипту для збірки.
- Windows Vite launcher використовує тимчасове process-local subst відображення та preserveSymlinks. Файли залишаються у репозиторії; TEMP/TMP — _research/temp.
- Точна ring CL-команда з усіма прапорцями успішна після vcvars64 SDK22621/26100/28000. Повна Cargo-збірка поки не проходить.

## Зараз / далі
- R3: cargo check exit101 на запуску vswhom-sys build-script, Windows STATUS_DLL_INIT_FAILED0xc0000142. Мінімальний plain Rust exe працює, Ole32-linked exe не доходить до main.
- DELAYLOAD дозволяє main, але COM-виклик падає. Пробний Cargo з ephemeral прапорцями дійшов до zerocopy: дочірній rustc --version має ту саму DLL-помилку. Прямий rustc з PowerShell працює. Діагностика триває; прапорці не додані до конфігурації продукту.
- Rust API виправлення готові й пройшли незалежне рев’ю. Прямий metadata compile shell/providers/TTS/parser exit0; parser14 реальних Rust тестів, TypeScript7 тестів. Повний lib.rs не перевірений: бракує cached image/audio/plugin metadata, Cargo заблокований B02.
- inspect-windows.ps1 створено й виконано на власному PowerShell PID: script exit0, вікон застосунку не було. Це не доказ topmost/affinity застосунку.
- R3 позначено BLOCKED; rust-green не створюємо без Cargo доказу.
- R4 вихідні виправлення готові: hidden main/dashboard, CSP IPC/WASM/assets, окрема capture-overlay capability; persistent resizable answer, async create/rebuild, редагування/focus-loss policy. Повну native policy серіалізовано в UI через run_on_main_thread, mutex навколо GUI викликів прибрано після підтвердженого рев’ю deadlock.
- R4 metadata/handler compile0, std store4/4, parser14/14, Node config/parser/encoding8/8. Native tauri dev60.1с exit101 на vswhom-sys, повтор після продовження також101. R4 BLOCKED B02, runs не створено.
- scripts/stop-session.ps1 перевіряє точний час створення root і ancestry через Kernel32, утримує handles і зупиняє тільки власне дерево. Тести wrong timestamp/missing root/п’ять owned processes+живий сторонній control проходять; run-session Vite20с HTTP200 зупинив вісім власних процесів.
- Далі R5: ServiceRuntime та єдиний executor, shell/UI snapshot contract src/lib/overlay/contracts.ts, keychain migration, providers/limiter/batcher, audio/mic, OCR/UIA/TTS. tests/math.test.mjs вже має чесний RED:3 pass/3 fail для чинного Markdown, виправлення ще не виконане.
- Далі R4 startup/CSP/native inspect, R5 підключення функцій, R6 тести, R7 release, R8 фінальні перевірки. Незавершені вимоги явно TODO у COMPLETION_CHECKLIST.

## Рішення й обмеження
- Цей checkout custom-overlay за контрактом; без push/force. Коміт після групи, encoding перед кожним комітом.
- Автономність користувача переважає skill approval паузи й історичні phase STOP.
- Hidden main — єдиний службовий runtime; Rust authoritative batcher/registry/layout; keychain для секретів. Архітектура ще не реалізована.
- C:/b поза writable root: за потреби короткий target лише в дозволеному repo/TEMP.
- Нові npm-пакети та актуальний security audit недоступні через політику; B01 у BLOCKED. Тести — вбудований Node runner, без Vitest.
- scripts/run-check.mjs записує команду, код і останні20 рядків у BUILD_LOG. Фізичні перевірки — MANUAL_TESTS з NEEDS HUMAN CHECK.
- Поки немає доказів запуску застосунку або готового release executable.

## Codex Loop — запит користувача 2026-10-12
- Встановлений codex-loop підготовлений CLI exit0, ID5b3e213f8577, adaptive1m–1h, стандартний lifetime24h, immediate first pass. Start marker у фінальній відповіді прив’яже scheduler до цієї розмови; durable goal/інший scheduler не створюємо.
- Умова завершення: поточна передача повністю реалізована й перевірена, Windows release зібраний і запущений, checklist/evidence завершені. BLOCKED B02 не видаємо за успішну збірку.
- Плагін розпізнає HTTP429 та usage limit і повертає ту саму нераховану ітерацію у waiting до reset/backoff (scripts/lib/loop-state.mjs:47,64,235). Не запускати replacement loop через429.
- CLI os.userInfo падав uv_os_get_passwd ENOMEM. Scoped scripts/loop-os-compat.cjs використовує власника вже призначеного home profile лише для pending-file scope; жодних змін token/ACL/authentication або встановленого плагіна.
- token-optimizer не знайдено в поточному skill/tool каталозі, локальному plugin cache або пошуку Plugin Management. Не стверджувати його застосування. Обхід: цільові читання, короткі докази, незалежні scoped agents, persisted state.
