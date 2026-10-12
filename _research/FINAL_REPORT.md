# Фінальний звіт — Pluely Overlay, 2026-10-12

## Результат

Готовий Windows x64 release candidate у `C:\Users\broma\OneDrive\Desktop\my_pluely_fork\RELEASE`: `pluely.exe`, NSIS `Pluely_0.1.9_x64-setup.exe`, MSI `Pluely_0.1.9_x64_en-US.msi`, `START_PLUELY.cmd`, SHA256, українські інструкції й ліцензії. Повна збірка має exit0. Runtime source checkpoint — `a8b063c` на `custom-overlay`; commit `0cbb9c6` інтегрував попередній WIP. Push/merge не виконувалися. Старі phase-* та final теги не використовуються як новий доказ.

Доставка реалізації завершена; фізичний acceptance не оголошено успішним. У checklist немає TODO: автоматично перевірене — DONE, конкретні фізичні/зовнішні перевірки — BLOCKED. Список у BLOCKED.md та MANUAL_TESTS.md. Текст старого звіту «all phases complete/correct-by-construction» замінено цим звітом.

## Нові уточнення про прозорість і переміщення

- Знято непрозорий global body для shell; html/body/root прозорі. Root займає реальну висоту viewport, без невидимих вертикальних полів.
- Чат: рівномірний alpha0.32 типово, видима рамка, без вкладених майже непрозорих панелей. Смуги alpha0.28; кожна кнопка має окремий persisted alpha. Settings повзунки показують прозорість у відсотках. Старий вигляд міг мати alpha1/gradient; appearance-version migration встановлює нові типові значення.
- Shimmer типово вимкнено; якщо ввімкнути, він малюється тільки на тонкій рамці, а не на всій поверхні. Для чату surface shimmer прибрано.
- Пасивний чат повністю ігнорує cursor events і не активується. Окремий бінд Shift+\ (налаштовується) одним натисканням перемикає непрозорий режим взаємодії; можна рухати заголовок, resize, вводити. Повторне натискання/Escape повертає passive. Focus-loss не вимикає режим посеред переміщення. Ctrl+Shift+I/кнопка Чат — явне введення.
- Геометрія фізична, MONITORINFO.rcWork виключає taskbar; chat рухається вільно, незалежно від смуг. Збереження позицій per-monitor; X/Y constraints нативні для смуг.

Нативний доказ `resume-final-native-ui-verified`, exit0: body/root rgba0; chat rgba(23,23,23,0.32); CSSheight480=viewport480; workarea1536x816; native chat900x600; кути (0,0)/(636,216). Зареєстровано `answer_interaction: shift+backslash`.

## Функціональність

Прихований main — єдиний executor capture/STT/AI/TTS/history. Rust acknowledged batcher збирає [mic]/[system] тексти, JPEG changed frames, питання й client IDs, має counted transcription barrier та один запит in-flight. Старі dashboard запити теж проходять цю чергу; їхня історія обмежена 32768 UTF-8 bytes. Клієнти отримують correlated requestError окремо від глобальних TTS/capture помилок; скасування під час встановлення listener не виконує новий запит.

Провайдери brain/STT/TTS/vision незалежні, editable presets/cURL/model list, supportsImages toggle, ключі у Windows Credential Manager. Registry atomic persistence: global/per-provider s/m/h/d бюджети, ранги, cooldown/Retry-After, fallback та нейтральне очікування. Traversal не зациклюється після auth/5xx/timeout; stream inactivity timeout припиняє завислий transport.

MAIN/SIDE/SPEAK розбираються tolerant streaming parser і транслюються без IPC на кожний токен. KaTeX підтримує всі чотири delimiters. HTML sanitization проходить перед trusted KaTeX generation; окрема XSS regression. Speech sentence queue, word highlighting, pause/stop/seek/disable та live settings. Системні voices, Piper subprocess і Google/OpenAI/custom TTS реалізовано. Для файлів оцінка слова приблизна.

Windows.Media.Ocr та foreground UI Automation реально викликаються через windows0.61; COM thread, depth/char/node/time caps, password values виключені. VLM виконується frontend vision registry; full запускає незалежні OCR/UI та VLM паралельно. Нативний VLM-only OCR command повертає чесне повідомлення, не вигаданий placeholder. Native vision fixture: OCR HELLO/123 і bounded UI tree — true.

Платні Pluely paths/license gates, телеметрію та updater видалено. Capability scopes звужено: мережа й keychain лише main/dashboard; SQL лише dashboard; shell не має мережевих/secret прав. Custom HTTP base URLs із портами підтримані. HTTP cookies вимкнено, бо API авторизація явними headers і непотрібний global cache блокував startup.

## Збірка і перевірки

| Перевірка | Фактичний результат | Доказ BUILD_LOG |
|---|---|---|
| Encoding + TypeScript | exit0, без BOM/invalidUTF8/replacement/mixedEOL | resume-final-gates, final encoding |
| Node suite | 59 PASS /0 FAIL | resume-final-tests59 |
| Cargo check | exit0 | resume-handoff-rust-check |
| Cargo test | 61 PASS /0 FAIL | resume-handoff-rust-tests61 |
| Cargo clippy all-targets | exit0; 8 lib/10 test style warnings, не zero-warning claim | resume-delivery-clippy |
| Tauri build | exit0, EXE+NSIS+MSI | resume-transparent-release |
| Vite dev | 46.2s, root/main HTTP200, no import/type errors | resume-handoff-vite-host |
| npm audit | exit0, усі severity0 | resume-release-audit-final |
| Native combined API request | JPEG+[mic]+[system]+Q1+Q2 одним batch, 429 primary→fallback, MAIN/SIDE/SPEAK, modes | resume-final-native-batch0 |
| Native keychain | save→get→remove синтетичного ключа, true | resume-final-native-batch0 |
| Native UI/cursor/geometry/WASM | passive/interaction styles, transparent canvas, corners, local module+WASM compile | resume-final-native-ui-verified0 |
| Native OCR/UI Automation | own JPEG recognized, UI=true, bounded=true | resume-final-native-vision0 |
| RELEASE EXE clean profile | 301.5s alive, no panic; owned tree stopped by timer | resume-release-delivery-run |
| Portable launcher clean profile | 66.8s alive, shortcuts registered, no panic | resume-portable-launcher-clean |
| MSI extraction/payload | WiX dark0, extracted actual EXE66.3s alive clean profile | resume-msi-payload-extract, resume-msi-payload-sequential |
| Independent code review | no remaining substantive defects; reviewer21 focused regressions PASS | integration_review verdict |

Bounded runtime runner exit0 означає успішне спостереження й прибирання. Native process exit1 після навмисного taskkill таймером не є exit0 застосунку і не використовується як доказ його штатного завершення. Одна невдала MSI payload спроба запущена паралельно з portable тестом і отримала HotKey already registered; повторна послідовна спроба успішна. `msiexec /a`1603 залишається B07; його не приховано успішним read-only extraction.

## Захист від захоплення

Для shell/answer встановлено й нативно прочитано `WDA_EXCLUDEFROMCAPTURE = 0x11`, також TOPMOST/TOOLWINDOW. Пасивний chat: NOACTIVATE/LAYERED/TRANSPARENT; interaction: NOACTIVATE/TRANSPARENT прибрані, WDA0x11 лишився. Це точний Windows flag, не WDA_MONITOR0x01 і не доказ усіх recorder modes. Реальні OBS, PrintScreen, Win+Shift+S, topmost-over-topmost та exclusive fullscreen — [NEEDS HUMAN CHECK].

## Що лишається BLOCKED

B05: реальні власні API/local models та українське аудіо. На ПК лише Microsoft Irina/Pavel (ru-RU); System.Speech recognizers []; Piper/Whisper/models не включені. B06: фізичні кліки/right-Shift hotkey, читабельність на вашому фоні, рекордери/fullscreen, кілька моніторів/DPI, Windows10 та інші ОС. B07: повний NSIS/MSI wizard/install/uninstall у звичайному Windows-профілі; administrative MSI service не зміг писати системний Installer state. Windows/mobile/cross-platform заглушки не видаються за реалізований fallback: Windows-path працює, інші платформи поза перевіреним релізом.

Окремі історичні plugin blockers B03 Auto Resume runtime absent та B04 Mem0 не є залежностями продукту. Жодних даних Pluely не відправляли до Mem0; scheduler/default model не змінювалися. B01npm та B02compile/runtime вирішено схваленим виконанням та portable профілем.

Бінарники не підписано Authenticode. Завеликий Vite chunk warning лишився; основний bundle ≈1.99MB minified, це не build failure. Два vendor patches потрібні для нативних keychain handlers та optional PLUELY_DATA_DIR у SQL; ліцензії збережено. Cargo rlib орієнтовано на desktop executable, mobile artifact build не заявляється.

## Файли та відновлення

Повний список змінених/видалених/доданих файлів — CHANGED_FILES.md (Git diff від takeover-start). Основні групи: src/components/ServiceRuntime та Shell, lib/overlay, secure storage, provider/settings/shortcuts, src-tauri continuous/providers/shell/vision/UIA/STT/TTS/vendor, tests/scripts/config/locks/docs. Старі remote services/imports/hooks/dependencies видалено; точний D-перелік у списку.

Для наступної роботи почніть із COMPLETION_CHECKLIST/BLOCKED/MANUAL_TESTS. Не відновлюйте старі звіти й не встановлюйте теги успіху на підставі історичних phase tags. Release manifest перевіряється `node scripts/verify-release.mjs`. Портативний тестовий профіль збережено у _research/temp, не змішано з профілем користувача.
