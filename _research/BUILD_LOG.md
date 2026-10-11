# Докази перевірок передачі

Початок: 2026-10-11. Репозиторій `pluely`, гілка `custom-overlay`, початковий коміт `a9549765dfdaadcfcd0d596cb3702557d79143ec`, тег `takeover-start`.

При передачі були незакомічені зміни `package-lock.json`, `src-tauri/Cargo.lock`, `src-tauri/Cargo.toml` (зняття BOM). Вони збережені. Початкові `cargo-debug.log` / `tauri-dev.log` є свідченнями користувача, а не успішними перевірками цієї сесії.

Кожний нижчий блок записує точну команду, каталог, код завершення і останні 20 рядків. Повний вивід зберігається локально в `logs/`; секрети не друкуємо. Зупинені довгі процеси мають окремий запис тривалості та причини зупинки, а не удаваний успішний код компіляції.

## baseline-encoding — 2026-10-11T20:52:22.756Z

Directory: C:\Users\broma\OneDrive\Desktop\my_pluely_fork\pluely

Command: `node scripts/check-encoding.mjs`

Exit code: 1

Last 20 output lines:

```text
src-tauri\src\shortcuts.rs: BOM
src-tauri\src\structured.rs: invalid UTF-8
src-tauri\src\tts.rs: mixed CRLF/LF
src-tauri\src\ui_automation.rs: mixed CRLF/LF
src-tauri\src\vision.rs: invalid UTF-8
_research\APPENDIX_license_pro_rust.txt: BOM, mixed CRLF/LF
_research\APPENDIX_section3_grep.txt: BOM
_research\BLOCKED.md: BOM, mixed CRLF/LF
_research\CHANGELOG.md: BOM, mixed CRLF/LF
_research\DECISIONS.md: BOM, mixed CRLF/LF
_research\FINAL_REPORT.md: invalid UTF-8
_research\IMPLEMENTATION_STATE.md: BOM, mixed CRLF/LF
_research\MANUAL_TESTS.md: BOM, mixed CRLF/LF
_research\phase1_grep.txt: BOM
_research\phase1_grep2.txt: BOM
_research\PHASES_SPEC.md: BOM, mixed CRLF/LF
_research\PROGRESS.md: BOM, mixed CRLF/LF
_research\REPORT.md: BOM, mixed CRLF/LF
_research\REPORT_INDEX.md: BOM, mixed CRLF/LF
Encoding: 277 text files checked; 63 failures.
```

Full log: logs/baseline-encoding.log

## baseline-typescript — 2026-10-11T20:52:22.956Z

Directory: C:\Users\broma\OneDrive\Desktop\my_pluely_fork\pluely

Command: `node node_modules/typescript/bin/tsc --noEmit`

Exit code: 2

Last 20 output lines:

```text
src/hooks/useMenuItems.tsx(90,5): error TS1109: Expression expected.
src/hooks/useMenuItems.tsx(90,6): error TS1128: Declaration or statement expected.
src/hooks/useMenuItems.tsx(91,3): error TS1128: Declaration or statement expected.
src/hooks/useMenuItems.tsx(125,1): error TS1128: Declaration or statement expected.
src/lib/storage/shortcuts.storage.ts(250,1): error TS1128: Declaration or statement expected.
src/lib/storage/shortcuts.storage.ts(250,2): error TS1128: Declaration or statement expected.
src/lib/storage/shortcuts.storage.ts(250,19): error TS1011: An element access expression should take an argument.
src/lib/storage/shortcuts.storage.ts(250,21): error TS1005: ';' expected.
src/pages/chats/components/View.tsx(298,19): error TS1109: Expression expected.
src/pages/dashboard/components/index.ts(1,1): error TS1127: Invalid character.
src/pages/dashboard/components/index.ts(1,14): error TS1005: ',' expected.
src/pages/dashboard/components/index.ts(1,25): error TS1005: ',' expected.
src/pages/settings/components/Theme.tsx(84,9): error TS1381: Unexpected token. Did you mean `{'}'}` or `&rbrace;`?
src/pages/settings/components/Theme.tsx(84,11): error TS1381: Unexpected token. Did you mean `{'}'}` or `&rbrace;`?
src/pages/settings/components/Theme.tsx(85,7): error TS1382: Unexpected token. Did you mean `{'>'}` or `&gt;`?
src/pages/settings/components/Theme.tsx(108,5): error TS1005: ')' expected.
src/pages/settings/components/Theme.tsx(109,3): error TS1109: Expression expected.
src/pages/settings/components/Theme.tsx(110,1): error TS1128: Declaration or statement expected.
src/pages/shortcuts/components/shortcuts/ShortcutManager.tsx(149,12): error TS1381: Unexpected token. Did you mean `{'}'}` or `&rbrace;`?
src/pages/shortcuts/components/shortcuts/ShortcutManager.tsx(149,16): error TS1381: Unexpected token. Did you mean `{'}'}` or `&rbrace;`?
```

Full log: logs/baseline-typescript.log

## r1-encoding — 2026-10-11T20:54:49.476Z

Directory: C:\Users\broma\OneDrive\Desktop\my_pluely_fork\pluely

Command: `node scripts/check-encoding.mjs`

Exit code: 0

Last 20 output lines:

```text
Encoding: 283 text files checked; 0 failures.
```

Full log: logs/r1-encoding.log

## r1-encoding-tests — 2026-10-11T20:54:49.662Z

Directory: C:\Users\broma\OneDrive\Desktop\my_pluely_fork\pluely

Command: `node --test tests/encoding.test.mjs`

Exit code: 0

Last 20 output lines:

```text
ok 1 - valid Ukrainian UTF-8 and consistent line endings are accepted
  ---
  duration_ms: 2.0748
  type: 'test'
  ...
# Subtest: BOM, malformed bytes, replacement characters and mixed endings are rejected
ok 2 - BOM, malformed bytes, replacement characters and mixed endings are rejected
  ---
  duration_ms: 0.31
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 76.7024
```

Full log: logs/r1-encoding-tests.log

## r1-npm-policy — 2026-10-11T20:54:49.880Z

Directory: C:\Users\broma\OneDrive\Desktop\my_pluely_fork\pluely

Command: `npm config get force && npm config get legacy-peer-deps`

Exit code: 0

Last 20 output lines:

```text
false
true
```

Full log: logs/r1-npm-policy.log
