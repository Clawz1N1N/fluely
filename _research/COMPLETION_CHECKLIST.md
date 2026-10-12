# Контроль завершення передачі

DONE має доказ; BLOCKED має причину й обхідний шлях у BLOCKED.md. `[NEEDS HUMAN CHECK]` означає ще не виконану фізичну перевірку. TODO забороняє вважати передачу завершеною.

| ID | Вимога | Статус | Доказ |
|---|---|---|---|
| V01 | Windows10/11 запускна версія Pluely0.1.9/Tauri2/React19/GPL3 | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V02 | Екран+system+mic → AI → напівпрозора overlay відповідь | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V03 | Brain OpenRouter/Google/own OpenAI URL/Ollama/LMStudio | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V04 | STT незалежно: Whisper/local/cloud/вбудований без AI | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V05 | TTS незалежно: local/cloud/вбудований | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V06 | supportsImages per-model; text-only screen через OCR/UI/VLM | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V07 | system/mic transcript+frames+chat ONE request без дублів | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V08 | MAIN/SIDE/SPEAK і просте докладне пояснення під MAIN | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V09 | TTS слово highlight, pause/stop/seek/disable configurable hotkeys | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V10 | KaTeX формули | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V11 | Limits s/m/h/d, neutral/counters/countdown/auto wake | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V12 | Strongest-first ranking, fallback, auto-return | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V13 | Редагований системний prompt | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V14 | ShellA дві вузькі високі смуги, лише X drag | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V15 | ShellB wide top/bottom смуги, лише Y drag | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V16 | ShellC independent free buttons, optional shimmer | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V17 | Topmost над other-topmost/borderless | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V18 | contentProtected affinity0x11; OBS/PrintScreen/WinShiftS | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V19 | Без taskbar; outside clicks pass; без focus stealing | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V20 | answer movable/resizable/opacity/MAIN/SIDE/chat у same stream | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| V21 | Manual chat/Listen/screenshot і continuous simultaneous audio+frames | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| V22 | Paid/remotePluely/telemetry/updater removed; only own providers | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F1a | Усі own text без BOM/invalidUTF8/U+FFFD; FINAL_REPORT repaired | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F1b | check-encoding BOM/replacement/mojibake/mixedEOL; npm check; precommit | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F1c | UTF8 writer, .gitattributes/.editorconfig, targeted recovery | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F2 | ALL TS syntax/types errors fixed; lint if configured; changed files read | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F3 | Deleted-file imports/reexports pluely.api/analytics/api/activate/updater gone | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F4a | ring exactCL replay+flag bisection English logs | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F4b | Developer env/SDK; short target/profile/release/clang/nativeTLS as needed | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F4c | All Rust errors fixed; check/test/clippy | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F5a | force source removed; legacy-peer-deps=true | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F5b | Approve oxide/esbuild scripts; protobuf only if needed | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F5c | VAD React19 runtime, Vite/Tailwind build/dev | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| F5d | No audit fix force; safe vulnerabilities fixed, others documented | DONE | resume-security-zero0: vulnerabilities0; без audit fix --force |
| F6 | P0 license/input/hooks/keychain/CSP diagnosed and fixed | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0a | CSP IPC ipc:/ipc.localhost, WASM/Shiki, KaTeX fonts, blob/data/dev | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0b1 | Old main hidden; persistent Listen/Ask/global shortcut handlers | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0b2 | Strip/buttons/answer Listen/screenshot/Ask own provider actually run | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0c | Input temporary activation removes NOACTIVATE then restores; topmost/protected | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| P0d | LicenseState/has_active_license/hasActiveLicense/pluelyApiEnabled/text removed | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0e1 | Positional saveItem/getItem/removeItem and verified write/read | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0e2 | Migrate plaintext keys; failure warning no silent plaintext fallback | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0f | Hide/show all, reset/find, ui_mode, TTS binds registered+handled | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0g1 | A/B/C axis drag, answer open/move/resize | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P0g2 | Monitor-specific saved positions, DPI/multimonitor/persistence | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| P0g3 | Shimmer enabled/speed/reset flash and answer opacity UI | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P1h1 | Button/settings → start_continuous → frames/transcript → packer | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P1h2 | ONE AI history+systemPrompt → answer → request_done, no overlap | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P1h3 | Separate [mic]/[system] channels and VAD segmentation | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| P1h4 | Capture settings mode/interval/monitor/maxFrames/size/quality/threshold | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P1i1 | Registry every AI/STT pick/request/result; real limits/fallback | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P1i2 | Brain/STT/TTS preset UI OpenRouter/Google/ownURL/local; rank/images/limits | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| P1i3 | Per-provider+global s/m/h/d counters persisted across restart | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P1i4 | Current model/neutral/counters/countdown in all shell UI; auto wake | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P1j1 | Editable protocol prompt; exact tolerant TS streaming parser without token IPC | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P1j2 | MAIN/SIDE/SPEAK shown; complete/stream TTS; highlighted spoken word | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| P1j3 | TTS backend/voice/language/rate/stream settings, system/local/cloud | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| P1j4 | Streamdown renders $, $$, parenthesis/bracket math forms | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P2k1 | Real Windows OCR with actual crate features/API | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P2k2 | Real foreground UI Automation depth/char caps | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P2k3 | Configured VLM provider and parallel full mode | BLOCKED | Код реалізовано; unit/native smoke0. Фізичний/реальний API acceptance: B05/B06, MANUAL_TESTS.md |
| P2l1 | Narrow used Tauri permissions; SQL execute only because used | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| P2l2 | Dead code/dependencies removed; npm test/cargo test wired | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| A01 | Tag/status/log/diff, ALL notes+changed/current files read | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| A02 | Claims table+defects+wiring matrix including PHASES_SPEC | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| R1 | Encoding/policy check+group commit | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| R2 | tsc/build0, Vite30s, commit, frontend-green | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| R3 | cargo check/test/clippy, commit, rust-green | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| R4 | runtime60s/backtrace/logs/inspect, commit, runs | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| R5 | P0/P1/P2 integrated+tests, group commits, wiring-done | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| R6 | Parser/limiter/fallback/packer/dedup/axis tests, build/check/test0, quality-green | DONE | BUILD_LOG: Node59/Rust61/check/build0; native-batch/ui/vision0; код a8b063c |
| R7 | Installer/exe build, RELEASE+SHA/notes, runtime30-60s+inspect, release-candidate | DONE | RELEASE EXE/MSI/NSIS + SHA256; native301.5s, portable66.8s; installer wizard B07 окремо |
| R8 | Fresh final checks, noTODO, clean git, honest docs, final-3 | DONE | Фінальні gates0; документи й групові коміти; перед final-3 перевірено чистий git |

PHASES_SPEC додаткові acceptance (editable presets/model selector, OpenRouter list, system STT feasibility, TTS timing, clean profile, cross-platform limits) включені у TAKEOVER_AUDIT matrix та пов'язані V/P перевірки.

| ID | Нові уточнення | Статус | Доказ |
|---|---|---|---|
| H01 | Нове уточнення: прозорий canvas, рівний alpha фон, видима рамка без surface gradient | DONE | native-ui-verified: body/root rgba0; chat alpha0.32; shimmer border-mask |
| H02 | Чат рухається по всій workarea без taskbar/меж смуг | DONE | native corners (0,0)/(636,216), Rust workarea corner regression |
| H03 | Пасивний click-through чат; одноразове toggle в непрозорий interaction режим | DONE | native-policy passive TRANSPARENT/NOACTIVATE, interactive removes both; WDA11 retained |
| H04 | Окремі opacity settings strips/8 buttons/chat та окремий interaction bind | DONE | OverlaySettings, persisted ShellLayout, registered shift+backslash; code review pass |
| H05 | Фізичне натискання правого Shift+\, кліки/візуальна читабельність | BLOCKED | B06 [NEEDS HUMAN CHECK]; command toggle та native policy вже перевірено |
| H06 | Майстер NSIS/MSI/uninstall у чистому Windows-профілі | BLOCKED | B07: MSI service access failure; read-only payload extract0; EXE clean profile0 |

DONE у рядках реалізації означає виконаний код та вказані automated докази. BLOCKED у composite acceptance рядках стосується переліченої фізичної/зовнішньої перевірки, а не відсутності реалізації. Повний список обмежень — BLOCKED.md. Попередні stale B01/B02 Cargo/compile блокування вирішено. Старі phase-* і final теги — історія, не докази нового релізу.
