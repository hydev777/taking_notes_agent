# Agent instructions (Taking Notes Agent)

## Stack

- Electron + **electron-vite** + **React 18** + **TypeScript (strict)**.
- **Zod** for runtime validation (templates, IPC payloads where applicable).
- **better-sqlite3** in the **main** process only; **preload** exposes a minimal typed `window.api`.

## Cost / LLM tokens

- When changing prompts or models to **save money**, read the Cursor skill [`.cursor/skills/llm-token-thrift/SKILL.md`](.cursor/skills/llm-token-thrift/SKILL.md) (token reduction checklist + cheap model notes).

## Code style

- **Never nester:** prefer early returns and small functions; avoid deep `if/else` pyramids.
- **DRY:** one source of truth for template field metadata (`templateFormMeta.ts` + Zod schemas).
- **React:** function components + hooks; split UI vs effects; avoid premature `memo`/`useCallback`.
- **TypeScript:** no `any`; validate external JSON (LLM) with Zod before use.
- **Electron security:** keep `contextIsolation: true`, avoid exposing raw Node APIs to the renderer.

## UI

- Semantic HTML, labels on inputs, keyboard-friendly controls.
- Clear **loading / error / empty** states for async work (recording, processing, email).
