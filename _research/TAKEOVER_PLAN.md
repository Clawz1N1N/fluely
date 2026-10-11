# Windows takeover implementation plan

**Goal:** отримати запускну Windows-збірку і доказово довести всі вимоги передачі.

**Spec:** PHASES_SPEC.md та контракт користувача 2026-10-11; новий контракт переважає старі STOP-after та рішення попередньої моделі.

**Architecture:** Прихований `main` — єдиний службовий React runtime. Rust володіє capture batcher, станом вікон, provider registry і persisted лімітами. UI вікна надсилають дії та показують broadcast стан/відповіді. Own-provider curl engine працює через Tauri HTTP, секрети — keychain; streaming parser у TypeScript, без IPC на кожний token.

**Global constraints:** Windows10/11, custom-overlay, без push/force, збереження користувацьких змін, UTF-8 без BOM, мінімум нових залежностей, exact command/exit/tail у BUILD_LOG. Фізичні перевірки окремо позначені NEEDS HUMAN CHECK.

**Review focus:** UTF-8/кирилиця на chunk межах; реально довгий request і нові вхідні дані; ліміт кількох періодів/рестарт/автопробудження; DPI/другий монітор/drag без click; keychain error і відсутність відкритих секретів.

## R1 — кодування і гігієна

- [ ] baseline-encoding / baseline-typescript з exact evidence.
- [ ] Конвертувати лише BOM/ANSI/mixed-EOL файли; відновити CP1251 README замість вгадування тексту.
- [ ] .npmrc force=false legacy-peer-deps=true; .editorconfig/.gitattributes; npm check encoding.
- [ ] Encoding test: UTF-8 Ukrainian valid, BOM/invalid bytes/U+FFFD/mojibake/mixed EOL invalid.
- [ ] check-encoding → 0; коміт.

## R2 — фронтенд

- [ ] Відновити syntax/logical intent; видалити deleted imports/ліцензійні поля; positional keychain API.
- [ ] Approve oxide/esbuild scripts, bounded dependency audit.
- [ ] tsc/build → 0; Vite30s із запитами всіх UI entries без errors; коміт, frontend-green.

## R3 — Rust

- [ ] ring exact cl replay + прапорці; vcvars/SDK; короткий target тільки в writable repo, якщо C:/b недоступний; profile debug/ release/clang/native TLS послідовно за потреби.
- [ ] Виправити compile errors за actual compiler output і cached crate signatures.
- [ ] cargo check/test/clippy; коміт, rust-green.

## R4 — запуск і native inspect

- [ ] Приховане службове main; async create commands; CSP IPC/WASM; shell labels ACL; виправити startup panic.
- [ ] inspect-windows.ps1: rect/style/topmost/affinity для PID; runtime60s; exact evidence; коміт, runs.

## R5 — функціонал

- [ ] P0: єдиний service actions; input activation temporary; A/B/C controls/drag/DPI/layout/hide/reset; secure migration; shortcut handlers.
- [ ] P1: continuous-batch consumer → AI(history+prompt) → response broadcast → request_done; mic/system labels; pending retry без overlap.
- [ ] Provider entry metadata/config UI для brain/STT/TTS; atomic s/m/h/d limits persisted; real-request fallback/recovery; current model/countdown.
- [ ] TypeScript tolerant parser + Ukrainian/chunk tests; MAIN/SIDE/SPEAK; TTS sentence chaining/settings/cloud/local backend; math four delimiter tests.
- [ ] P2: Windows OCR/UIA real calls; vision provider і full parallel; truthful errors для missing OCR pack/provider.
- [ ] Коміт після кожної самостійної групи; wiring-done.

## R6 — якість

- [ ] Rust і TS тести парсера, лимітів/fallback, packing/dedup, positioning/axis dragging, TTS timing; browser integration fake provider.
- [ ] build/check/test →0, cleanup, коміт, quality-green.

## R7 — реліз

- [ ] tauri build; fallback no-bundle якщо недоступний bundler; artifact у ../RELEASE, SHA256, українські release notes.
- [ ] Запуск release60s + inspect; коміт, release-candidate.

## R8 — фінальний прохід

- [ ] Нові encoding/tsc/build/cargo check/test/runtime inspect із нуля.
- [ ] Усі checklist рядки DONE або доказово BLOCKED; повні MANUAL_TESTS/FINAL_REPORT/README; clean status; final-3.
