> Історичний звіт етапу Pluely 0.1.9. Поточний стан Fluely 0.2.0 і нові докази наведено в [актуальному звіті](../docs/release-0.2.0.md). Старі статуси нижче збережено для історії.

# Актуальний стан — 2026-10-12

Гілка custom-overlay. Runtime code checkpoint a8b063c; попередня інтеграція WIP0cbb9c6. Код зібрано в Windows x64 EXE/MSI/NSIS, доставлено ../RELEASE з SHA256 і portable launcher. Push/merge не виконувалися.

Ключовий user steering: прозорий shell canvas/рівномірний фон/рамки, passive click-through chat, окремий Shift+Backslash interaction toggle (налаштовується), окремі opacity sliders, вся MONITORINFO.rcWork для переміщення чату. Це реалізовано й перевірено на actual RELEASE EXE: body/root transparent, alpha0.32, UI height=viewport480, native flags passive/interactive, corners0,0 та636,216, affinity0x11. Усі старі твердження про source-only stubs або неможливий Cargo runtime stale.

Фінальні докази: Node59 PASS, Rust61 PASS, tsc/encoding/check/clippy0, npm audit0 vulnerabilities, build0 EXE+2bundles. Native batch/JPEG/2audio texts/2questions/429fallback/modes/keychain, OCR/UIA та WASM smoke0. RELEASE app301.5s alive і cleanup; portable launcher66.8s та MSI payload66.3s separate clean profiles. Native exit1 після timer taskkill навмисний; не штатний exit0 застосунку.

Independent review: суттєвих defects у runtime diff не залишилося; reviewer21 focused regressionsPASS. Виправлено глобальні TTS errors як request errors, abort listener race, history bridge UTF8 budget та automatic presentation hidden/lifecycle race. Startup global-shortcut plugin реєструється до main windows; warmed startup panic усунено. User AppData/vault не читали й не змінювали тестами; synthetic keychain entries очищені.

Доставка — release candidate із фізичним acceptance BLOCKED. Немає checklist TODO. B05 українські voices/offline recognizer/local models/real own API; B06 фізичні кліки/hotkeys/OBS/screenshots/fullscreen/multimonitorDPI/Windows10 та інші ОС; B07 installer wizard/uninstall (msiexec admin1603 через системний Installer access, WiX payload extract0). B03 AutoResume runtime absent, B04 Mem0 setup — окремі історичні інтеграції. Плагінні scheduler/default model не змінювалися; Mem0 cloud upload не виконувався.

Починайте наступне продовження з FINAL_REPORT.md, COMPLETION_CHECKLIST.md, BLOCKED.md, MANUAL_TESTS.md і BUILD_LOG.md. CHANGED_FILES.md містить повний Git inventory. Не використовуйте історичні phase-* або old final tags як доказ нового релізу. Перевірка артефактів: node scripts/verify-release.mjs.
