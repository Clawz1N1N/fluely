# Контроль завершення передачі

DONE має доказ; BLOCKED має причину й обхідний шлях у BLOCKED.md. `[NEEDS HUMAN CHECK]` означає ще не виконану фізичну перевірку. TODO забороняє вважати передачу завершеною.

| ID | Вимога | Статус | Доказ |
|---|---|---|---|
| V01 | Windows10/11 запускна версія Pluely0.1.9/Tauri2/React19/GPL3 | TODO | R7 |
| V02 | Екран+system+mic → AI → напівпрозора overlay відповідь | TODO | R5 |
| V03 | Brain OpenRouter/Google/own OpenAI URL/Ollama/LMStudio | TODO | R5 |
| V04 | STT незалежно: Whisper/local/cloud/вбудований без AI | TODO | R5 |
| V05 | TTS незалежно: local/cloud/вбудований | TODO | R5 |
| V06 | supportsImages per-model; text-only screen через OCR/UI/VLM | TODO | R5 |
| V07 | system/mic transcript+frames+chat ONE request без дублів | TODO | R5 |
| V08 | MAIN/SIDE/SPEAK і просте докладне пояснення під MAIN | TODO | R5 |
| V09 | TTS слово highlight, pause/stop/seek/disable configurable hotkeys | TODO | R5 |
| V10 | KaTeX формули | TODO | R5 |
| V11 | Limits s/m/h/d, neutral/counters/countdown/auto wake | TODO | R5 |
| V12 | Strongest-first ranking, fallback, auto-return | TODO | R5 |
| V13 | Редагований системний prompt | TODO | R5 |
| V14 | ShellA дві вузькі високі смуги, лише X drag | TODO | R5 |
| V15 | ShellB wide top/bottom смуги, лише Y drag | TODO | R5 |
| V16 | ShellC independent free buttons, optional shimmer | TODO | R5 |
| V17 | Topmost над other-topmost/borderless | TODO | R4 inspect+manual |
| V18 | contentProtected affinity0x11; OBS/PrintScreen/WinShiftS | TODO | R4 inspect+manual |
| V19 | Без taskbar; outside clicks pass; без focus stealing | TODO | R4 inspect+manual |
| V20 | answer movable/resizable/opacity/MAIN/SIDE/chat у same stream | TODO | R5 |
| V21 | Manual chat/Listen/screenshot і continuous simultaneous audio+frames | TODO | R5 |
| V22 | Paid/remotePluely/telemetry/updater removed; only own providers | TODO | R2/R5 |
| F1a | Усі own text без BOM/invalidUTF8/U+FFFD; FINAL_REPORT repaired | DONE | BUILD_LOG r1-encoding exit0 |
| F1b | check-encoding BOM/replacement/mojibake/mixedEOL; npm check; precommit | DONE | scripts/check-encoding, tests2/2 |
| F1c | UTF8 writer, .gitattributes/.editorconfig, targeted recovery | DONE | repair-encoding; valid files untouched |
| F2 | ALL TS syntax/types errors fixed; lint if configured; changed files read | DONE | r2-tsc exit0; no lint configured |
| F3 | Deleted-file imports/reexports pluely.api/analytics/api/activate/updater gone | DONE | deleted reexport removed, src symbol search0 |
| F4a | ring exactCL replay+flag bisection English logs | DONE | diagnose-ring: exact flags/SDK22621 repeated0; other SDKs0; D8050 not reproduced |
| F4b | Developer env/SDK; short target/profile/release/clang/nativeTLS as needed | DONE | vcvars64+SDK22621 first working CL variant, all original flags retained |
| F4c | All Rust errors fixed; check/test/clippy | BLOCKED | B02: all Cargo commands101 at native build-script; partial direct metadata0 and parser14/14 |
| F5a | force source removed; legacy-peer-deps=true | DONE | r1-npm-policy false/true |
| F5b | Approve oxide/esbuild scripts; protobuf only if needed | DONE | approve oxide/esbuild0; protobuf prebuilt runtime dependency, no script needed |
| F5c | VAD React19 runtime, Vite/Tailwind build/dev | TODO | R2/R5 |
| F5d | No audit fix force; safe vulnerabilities fixed, others documented | BLOCKED | B01: advisory endpoint unavailable; no blind dependency upgrades |
| F6 | P0 license/input/hooks/keychain/CSP diagnosed and fixed | TODO | P0a-g |
| P0a | CSP IPC ipc:/ipc.localhost, WASM/Shiki, KaTeX fonts, blob/data/dev | TODO | R4 |
| P0b1 | Old main hidden; persistent Listen/Ask/global shortcut handlers | TODO | R4/R5 |
| P0b2 | Strip/buttons/answer Listen/screenshot/Ask own provider actually run | TODO | R5 |
| P0c | Input temporary activation removes NOACTIVATE then restores; topmost/protected | TODO | R5 |
| P0d | LicenseState/has_active_license/hasActiveLicense/pluelyApiEnabled/text removed | DONE | frontend constants/consumers removed; Rust license state already absent |
| P0e1 | Positional saveItem/getItem/removeItem and verified write/read | TODO | R2/R5 |
| P0e2 | Migrate plaintext keys; failure warning no silent plaintext fallback | TODO | R5 |
| P0f | Hide/show all, reset/find, ui_mode, TTS binds registered+handled | TODO | R5 |
| P0g1 | A/B/C axis drag, answer open/move/resize | TODO | R5 |
| P0g2 | Monitor-specific saved positions, DPI/multimonitor/persistence | TODO | R5 |
| P0g3 | Shimmer enabled/speed/reset flash and answer opacity UI | TODO | R5 |
| P1h1 | Button/settings → start_continuous → frames/transcript → packer | TODO | R5 |
| P1h2 | ONE AI history+systemPrompt → answer → request_done, no overlap | TODO | R5 |
| P1h3 | Separate [mic]/[system] channels and VAD segmentation | TODO | R5 |
| P1h4 | Capture settings mode/interval/monitor/maxFrames/size/quality/threshold | TODO | R5 |
| P1i1 | Registry every AI/STT pick/request/result; real limits/fallback | TODO | R5 |
| P1i2 | Brain/STT/TTS preset UI OpenRouter/Google/ownURL/local; rank/images/limits | TODO | R5 |
| P1i3 | Per-provider+global s/m/h/d counters persisted across restart | TODO | R5 |
| P1i4 | Current model/neutral/counters/countdown in all shell UI; auto wake | TODO | R5 |
| P1j1 | Editable protocol prompt; exact tolerant TS streaming parser without token IPC | TODO | R5 |
| P1j2 | MAIN/SIDE/SPEAK shown; complete/stream TTS; highlighted spoken word | TODO | R5 |
| P1j3 | TTS backend/voice/language/rate/stream settings, system/local/cloud | TODO | R5 |
| P1j4 | Streamdown renders $, $$, parenthesis/bracket math forms | TODO | R5 |
| P2k1 | Real Windows OCR with actual crate features/API | TODO | R5 |
| P2k2 | Real foreground UI Automation depth/char caps | TODO | R5 |
| P2k3 | Configured VLM provider and parallel full mode | TODO | R5; first permitted cut |
| P2l1 | Narrow used Tauri permissions; SQL execute only because used | TODO | R6 |
| P2l2 | Dead code/dependencies removed; npm test/cargo test wired | TODO | R6 |
| A01 | Tag/status/log/diff, ALL notes+changed/current files read | DONE | TAKEOVER_AUDIT.md |
| A02 | Claims table+defects+wiring matrix including PHASES_SPEC | DONE | TAKEOVER_AUDIT.md |
| R1 | Encoding/policy check+group commit | DONE | commit63a22ac; r1-encoding0, tests2/2 |
| R2 | tsc/build0, Vite30s, commit, frontend-green | DONE | r2-tsc0, r2-build-final0, r2-vite-preserve30.1s HTTP200 no errors |
| R3 | cargo check/test/clippy, commit, rust-green | BLOCKED | B02; source API repairs reviewed, metadata0+Rustparser14+TS7; no rust-green without Cargo proof |
| R4 | runtime60s/backtrace/logs/inspect, commit, runs | BLOCKED | B02; tauri dev60.1s exit101 before app. Source startup/CSP/focus fixes metadata0; store4/4; owned-tree cleanup verified. No runs tag |
| R5 | P0/P1/P2 integrated+tests, group commits, wiring-done | TODO | BUILD_LOG |
| R6 | Parser/limiter/fallback/packer/dedup/axis tests, build/check/test0, quality-green | TODO | BUILD_LOG |
| R7 | Installer/exe build, RELEASE+SHA/notes, runtime30-60s+inspect, release-candidate | TODO | BUILD_LOG |
| R8 | Fresh final checks, noTODO, clean git, honest docs, final-3 | TODO | BUILD_LOG |

PHASES_SPEC додаткові acceptance (editable presets/model selector, OpenRouter list, system STT feasibility, TTS timing, clean profile, cross-platform limits) включені у TAKEOVER_AUDIT matrix та пов'язані V/P перевірки.
