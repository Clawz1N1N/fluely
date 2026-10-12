# Поточні блокування

Історичний текст про відсутність Node/Rust/кешів належав іншому середовищу й не чинний.

## B01 — актуальний npm security audit / завантаження нових npm-пакетів

Доказ: `npm audit --json --fetch-retries=0 --fetch-timeout=20000` exit1, registry advisory endpoint недоступний. Install Vitest dry-run з writable cache exit1 EALLOWREMOTE: remote fetch disabled. Докази у BUILD_LOG.

Обхід: наявні залежності та вбудований runner Node22; без `npm audit fix --force`. Це не блокує frontend build. Актуальність advisory не підтверджена.

Поза обмеженим середовищем: PowerShell у `pluely`, виконати `npm audit --json`; оцінити точні advisories перед безпечним оновленням. Залежності не оновлювалися навмання.

## B02 — Windows native DLL initialization у середовищі виконання

Cargo check/test/clippy exit101: vswhom-sys build-script exit0xc0000142 (STATUS_DLL_INIT_FAILED). Мінімальний executable з Ole32 імпортом також падає до main. Прямий rustc працює, rustc як дочірній процес мінімальної Rust-програми — ні.

Read-only DLL probe: Ole32 LoadLibraryExW → Win32 error1114; User32 → error8. Абсолютний шлях/System32 flags, зміни PATH/TEMP, SDK/developer environment, прямий запуск і Node/cmd не виправили збій. Start-Process Hidden також не допоміг. DELAYLOAD запускає main, але фактичний COM-виклик падає; ці прапорці не внесені у продукт. Захисти/дозволи/глобальні політики не змінювалися. Докази: BUILD_LOG r3-cargo-baseline/test/clippy, logs/r3-dll-native-cmd.log, r3-dll-mitigations.log, r3-start-process-probe.json.

Обхід для незалежної роботи: прямий rustc для реальних core-тестів і metadata-перевірок із наявними залежностями; TypeScript/Node тести й frontend build. Це не еквівалент cargo check/test або запуску Tauri.

Необхідна фізична дія: відкрити звичайний PowerShell з меню Windows, поза керованим терміналом цього агента. Виконати:

```powershell
Set-Location 'C:\Users\broma\OneDrive\Desktop\my_pluely_fork\pluely'
cmd /c "call scripts\rust-env.cmd cargo check --offline --manifest-path src-tauri\Cargo.toml"
```

Після успішного check виконати test тією самою командою, замінивши check на test; для release — `cmd /c "call scripts\rust-env.cmd npm run tauri build"`. Докладний відтворюваний локальний launcher буде доданий на R7. Якщо та сама DLL-помилка повториться у звичайному PowerShell, спочатку перезавантажити Windows і повторити: це потребує перевірки native середовища, а не видалення випадкових прапорців ring.

До такого запуску повна Rust-компіляція, native runtime, capture/COM/IPC на реальному застосунку та release executable не підтверджені. Робота над рештою вимог продовжується.


## B03 — Codex Auto Resume setup (2026-10-12)
Official absolute-path bootstrap exit1: HTTPS GitHub release download failed; output says Nothing was installed. Runtime python.exe absent; watcher/automatic recovery unverified. Defaults/model selection were not changed. Installed skill explicitly requires stopping after a download failure. Physical workaround: run the same official bootstrap in ordinary PowerShell with network access, then the bundled runtime's doctor/status; exact commands in PLUGIN_SETUP.md. No alternative download or hand-built installation.

## B04 — Mem0 setup (2026-10-12)
Installed package0.3.3 is present, but python3 hook command missing from PATH (python.exe3.14.7 works). Official status and doctor both exit1, PermissionError WinError5 creating C:/Users/broma/.mem0. No Mem0 API key is available to the diagnostic process. Actual capture/authentication/counts cannot be verified. Physical workaround: expose python3 to Codex launch environment, set your own MEM0_API_KEY without sharing it in chat, run status/doctor outside the restricted terminal. Preserve earlier prohibition on sending Pluely project data before cloud capture. PLUGIN_SETUP.md has exact steps. No project-memory upload was invoked.
