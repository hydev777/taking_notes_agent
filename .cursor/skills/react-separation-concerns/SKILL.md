# React Separation of Concerns (Taking Notes Agent)

## Purpose

Use this skill when editing or adding renderer code in this project to keep React code maintainable, testable, and performant.

## Core principles

1. Single responsibility per component
- A page-level component should orchestrate state and compose child sections.
- Child components should focus on one UI concern (Profile form, Home actions, History list, etc.).

2. Keep UI and side effects separate
- UI components should receive data and callbacks via props.
- IPC calls, async flows, timers, and orchestration should stay in container/page components or hooks.

3. Stable boundaries
- Split by user-facing areas (Profile, Home, History, Session).
- Prefer creating a new component instead of growing `App.tsx` indefinitely.

4. Predictable state ownership
- Put state where it is used most.
- Lift state up only when multiple siblings need it.
- Avoid duplicating the same source of truth.

5. Performance without over-engineering
- Memoize only where it removes real repeated work.
- Avoid repeated `JSON.stringify`/heavy computations in render.
- Avoid unnecessary full-page rerenders by isolating sections.

## Project-specific checklist

Before finishing a renderer change:

- [ ] Did I keep `App.tsx` as orchestration and move page-specific UI out when it became large?
- [ ] Are `Profile`, `Home`, and `History` concerns separated into dedicated components?
- [ ] Are async IPC calls still handled in an appropriate container/hook?
- [ ] Did I avoid introducing new duplicated state?
- [ ] Did I run `npm run typecheck` after changes?

## Recommended patterns

### Container + presentational
- Container: owns state + effects + IPC.
- Presentational: pure props-in / events-out component.

### Extract when any is true
- Component exceeds ~150-200 lines and mixes multiple views.
- One view has independent UI logic and actions.
- Multiple inline handlers start cluttering parent JSX.

### Props conventions
- Use explicit prop names (`onSaveProfile`, `onDeleteSession`).
- Prefer narrow props over passing huge objects.

## Anti-patterns to avoid

- Monolithic `App.tsx` with unrelated page logic tightly interleaved.
- Triggering IPC directly from deeply nested dumb components.
- Recomputing large derived values every render when memoization is cheap and safe.
- Refactors that improve style but alter existing behavior without explicit intent.

## Non-regression rule

When refactoring for separation of concerns, preserve behavior:
- No UX regressions.
- No navigation flow regressions.
- No data persistence regressions.

Refactor structure first, then optimize internals in small verified steps.
