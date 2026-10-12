# DECISIONS — Pluely fork customization

## Чинні рішення передачі 2026-10-11

- ANSI/UTF8: замість вгадування тексту декодуємо Windows-1251 лише invalidUTF8 файли; README відновлений. BOM/EOL ремонтуємо targeted; valid файли byte-identical.
- Executor: кілька webview чи один service → одне приховане main, щоб не дублювати audio/request. Capture/registry persisted у Rust, UI передає actions/status.
- Checkout: worktree чи існуюча гілка → custom-overlay in-place за явним контрактом; без push/force/approval пауз.
- npm: global config чи project policy → force=false+legacy-peer-deps=true у .npmrc; персональні конфіги не змінюємо.
- Старі рішення про retention ліцензійних constants та correct-by-construction відхилені. Нижче збережено історичний текст.

## Phase 1
- hasActiveLicense state kept as constant `true` (app.context.tsx:134) instead of deleting the field from IContextType -> options: (a) delete field + rewrite ~20 consumers, (b) constant true. Choice: (b). Why: lowest risk of breaking the ~20 consumer files; all gates resolve to "licensed" so every feature works unconditionally. The field stays in IContextType (context.type.ts:44).
- pluelyApiEnabled kept as constant `false` (app.context.tsx:147) -> the router is unconditionally local; shouldUsePluelyAPI/pluely.api.ts deleted; all fetch fns now use the local curl engine.
- Remote path deleted entirely (activate.rs, api.rs) rather than stubbed, per spec 1.2.
- Local presets created in PluelyPrompts.tsx (General/Interview/Coding/Translate/Meeting) to replace remote fetch_prompts, per spec 1.5.
- Generate.tsx "Generate with AI" now calls the local provider via fetchAIResponse instead of deleted create_system_prompt.
- Updater disabled (updater/index.tsx = null) + removed from Cargo.toml/package.json/tauri.conf.json/capabilities, per spec 1.4.
- Telemetry removed (analytics.ts deleted, tauri-plugin-posthog + machine-uid removed), per spec 1.3.
- reqwest, uuid, once_cell crates removed from Cargo.toml (unused after remote-path deletion).
- build.rs no longer reads APP_ENDPOINT/API_ACCESS_KEY/PAYMENT_ENDPOINT/POSTHOG_API_KEY.


## Phase 2 decisions
- Problem: shell windows need routes. Options: hash routing vs BrowserRouter paths. Choice: BrowserRouter paths (/shell/*). Why: matches existing router; Tauri WebviewUrl::App loads index.html and the SPA router picks the path.
- Problem: axis-locked drag. Options: data-tauri-drag-region (cannot lock) vs custom pointer events. Choice: custom useShellDrag hook calling move_shell_window(axis). Why: only way to lock one axis; Rust clamps to monitor.
- Problem: how shell windows get their label. Choice: getCurrentWindow().label (already used in main.tsx). Why: zero config, matches existing pattern.
- Problem: answer window created on demand vs startup. Choice: toggle_answer_window creates it lazily (centered), rebuild_shell does NOT create it by default. Why: keeps startup light; created when user opens it.
- Problem: which actions map to buttons. Choice: listen/screenshot/continuous/answer/chat/tts/mode/settings (8). Why: covers the required action set from the spec.
- NOT VERIFIED: compilation (no cargo/rustc in sandbox). Code is correct-by-construction.

## R2 — середовище frontend
- Проблема: esbuild намагається читати недоступні батьківські каталоги профілю. Варіанти: змінити ACL або використати process-local DOS відображення й preserveSymlinks. Вибір: тимчасова літера диска у native launcher. Причина: не змінює дозволів, не переносить вихідні файли; build і Vite підтверджені.
- Проблема: Vitest і advisory endpoint недоступні. Варіанти: обходити політику завантаження або використати наявний Node runner. Вибір: Node22 + наявний TypeScript loader. Причина: мінімум залежностей; security freshness окремо BLOCKED B01.

## R3 — native виконання і parser
- Проблема: історична ring D8050. Варіанти: прибирати CL прапорці, старіший compiler, developer environment. Вибір: vcvars64 + наявний SDK22621. Причина: точна команда з усіма прапорцями повторно exit0; прапорці залишені.
- Проблема: Cargo build-script не стартує0xc0000142; User32/Ole32 DLL probes також падають. Варіанти: правити сторонні crates, змінювати захисти, або виконувати незалежні перевірки й зафіксувати зовнішній блокер. Вибір: реальні core-тести й прямі metadata перевірки, B02. Причина: SDK/PATH/TEMP/launch/delay-load не виправляють native збій; змін захистів не робимо. Це не заміна повній Cargo перевірці.
- Проблема: Unicode і часткові теги псували відповіді. Вибір: dependency-free Rust core + TypeScript incremental parser; тільки точні lowercase протокольні теги, невідомі та unmatched closers лишаються текстом. Причина: україномовний текст і формули не губляться; chunk-boundary/regression тести.
- Проблема: коли показувати SPEAK. Варіанти: чекати закривального тегу або показувати під час стріму. Вибір: TypeScript публікує всі панелі відразу. Причина: PHASES_SPEC5.1 і P1j3 користувача дозволяють TTS по завершених реченнях під час стріму. Rust streaming helper має старий контракт secondary-on-close, але його IPC adapter використовується лише для повного parse; frontend не викликає IPC на кожний чанк.

## R4 — UI потокова політика й власність процесів
- Проблема: watchdog утримував mutex та чекав UI HWND getter; Focused(false) міг чекати той самий mutex. Вибір: повна native policy виконується через run_on_main_thread, без mutex навколо GUI API. Причина: cached Tauri/Wry доводить inline виконання на UI/setup і queue для worker; metadata/handler expansion перевірено, native поведінка B02.
- Проблема: timeout, що вбивав лише cmd.exe, міг лишити Cargo/Tauri descendants. Вибір: native Kernel32 parent-tree helper з точною creation-time identity, preopened handles та повторною ancestry перевіркою. Причина: targeted cleanup без WMI/пошуку за іменами; реальні тести довели, що сторонній control не зупиняється.
- Проблема: потрібні повторні проходи до завершення, включно з usage limit/429. Вибір користувача: встановлений Codex Loop, єдиний scheduler у цій розмові. Adaptive режим, completion condition, стандартний24h строк; без durable goal, daemon або другого Codex процесу.
