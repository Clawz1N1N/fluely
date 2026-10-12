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
- R3 позначено BLOCKED; rust-green не створюємо без Cargo доказу. Далі R4, потім реалізація service/UI за контрактом src/lib/overlay/contracts.ts.
- Далі R4 startup/CSP/native inspect, R5 підключення функцій, R6 тести, R7 release, R8 фінальні перевірки. Незавершені вимоги явно TODO у COMPLETION_CHECKLIST.

## Рішення й обмеження
- Цей checkout custom-overlay за контрактом; без push/force. Коміт після групи, encoding перед кожним комітом.
- Автономність користувача переважає skill approval паузи й історичні phase STOP.
- Hidden main — єдиний службовий runtime; Rust authoritative batcher/registry/layout; keychain для секретів. Архітектура ще не реалізована.
- C:/b поза writable root: за потреби короткий target лише в дозволеному repo/TEMP.
- Нові npm-пакети та актуальний security audit недоступні через політику; B01 у BLOCKED. Тести — вбудований Node runner, без Vitest.
- scripts/run-check.mjs записує команду, код і останні20 рядків у BUILD_LOG. Фізичні перевірки — MANUAL_TESTS з NEEDS HUMAN CHECK.
- Поки немає доказів запуску застосунку або готового release executable.
