# Стан блокувань — 2026-10-12

Цей документ замінює попередні твердження про неможливість збірки. DONE означає підтверджену дію; BLOCKED — конкретну перевірку, яка ще потребує зовнішньої умови або фізичної участі.

## B01 — RESOLVED: npm security audit

Перший актуальний аудит дав 37 vulnerabilities (2 critical). Сумісний `npm audit fix --ignore-scripts`, цільове оновлення VAD до 0.0.37, KaTeX 0.18.2+ і видалення зайвого JS keychain build-chain прибрали всі знайдені advisories. `resume-security-zero` exit0: total0; `resume-sanitize-direct` також total0. `audit fix --force` не використовувався. KaTeX sanitizer перенесено перед генерацією формул; math/XSS регресії проходять.

## B02 — RESOLVED для збірки й native runtime

У початковому обмеженому терміналі DLL initialization не працював. Схвалене native execution дозволило повний Cargo check/test/clippy та EXE/MSI/NSIS build. Нативний release працює з явно заданим PLUELY_DATA_DIR; без override Rust-запис до AppData у керованому середовищі давав PermissionDenied. Це не є доказом несправності AppData у звичайному Windows-профілі. Портативний launcher використовує власний profile каталог. Не змінювали глобальні захисти, політики чи наявну базу користувача.

## B03 — історична перевірка Codex Auto Resume

CLI bootstrap у попередньому сеансі failed download. Плагін зараз присутній у каталозі desktop Codex; попередній висновок «нічого не встановлено» стосувався лише того запуску. Поточний read-only inventory: C:/Users/broma/.codex-auto-resume/runtime/python.exe не існує; статус продукту недоступний без runtime. Попередній офіційний bootstrap failed download. [Codex Auto Resume SKILL.md](C:/Users/broma/.codex/plugins/cache/codex-auto-resume-windows/codex-auto-resume/0.6.15-beta/skills/codex-auto-resume/SKILL.md) прямо вимагає: "If it reports that it could not download, say so and stop." Ручне складання інсталяції не використовувалося. Впливу на зібраний Pluely немає; scheduler цього чату не створювався.

## B04 — Mem0

Пакет 0.3.3 був на диску, але python3 hook не знайдено, status/doctor отримували WinError5 для C:/Users/broma/.mem0, ключ не був доступний. Деталі у PLUGIN_SETUP.md. Дані проєкту й секрети до Mem0 не надсилалися. Для перевірки потрібен власний ключ та працездатне зовнішнє середовище Mem0; це окрема інтеграція, не залежність Pluely.

## B05 — українські офлайн-мовні компоненти / реальні API

Нативна команда списку System.Speech recognizers повернула [] (exit0). WebView2 бачить лише Microsoft Irina та Pavel, ru-RU. Piper executable/українська .onnx модель і локальний Whisper server не встановлені як частина цього форка. Власні хмарні ключі не використано. Код system STT, Piper, Google/OpenAI/custom TTS і STT підключено; реальну українську транскрипцію й звук треба перевірити після налаштування доступного провайдера. Synthetic brain API + 429 fallback + JPEG/мікрофонний/системний текст перевірено нативно. Windows OCR та UI Automation на тестовому JPEG працюють.

## B06 — фізична перевірка [NEEDS HUMAN CHECK]

Нативно підтверджено TOPMOST/TOOLWINDOW/NOACTIVATE, click-through TRANSPARENT, affinity0x11, alpha0.32, прозорий body/root, activation toggle і рух до обох кутів робочої області. Ці прапорці не доводять поведінку OBS/PrintScreen/Win+Shift+S, пріоритет над Task Manager/відео, exclusive fullscreen, фізичні кліки поза інтерфейсом, кілька DPI/моніторів або якість аудіо. Потрібні очі, вуха й відповідне обладнання; кроки у MANUAL_TESTS.md. Windows10/macOS/Linux/Wayland та мобільні артефакти не тестувалися.

## B07 — майстер встановлення / Windows Installer service

EXE, NSIS та MSI успішно зібрано. Release EXE запущено з новим порожнім профілем. `msiexec /a ... /qn` exit1603: у журналі доступ до C:/Windows/Installer/inprogressinstallinfo.ipi відхилено (-2147287035), потім errors2503/2502. Цю системну директорію/службу не змінювали. WiX dark read-only extraction exit0, payload доступний; це не підтверджує завершення майстра встановлення. Потрібно запустити NSIS/MSI у звичайному Windows-профілі й перевірити встановлення/видалення. Докази: resume-msi-admin-extract, resume-msi-payload-extract та logs/resume-msi-extract-details.log.

Тимчасова відмова автоматичної approval-перевірки через usage limit припинилася після часу відновлення; нові Cargo/native команди знову дозволені й виконані. Постійного блокування B02 через цей ліміт немає.
