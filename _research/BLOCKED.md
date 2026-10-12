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
