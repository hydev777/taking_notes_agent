# Taking Notes Agent

Electron desktop app for **CTM-style calls**: capture **browser tab audio + microphone**, save call audio locally, transcribe with OpenAI, fill structured intake templates, and review/edit sessions with a collaborative AI-style workflow.

## Current features

- AI collaborator UX in Home (processing console + guided next steps)
- Recording flow: capture source picker + mic/system audio mix (Windows)
- Auto processing after stop:
  - transcription
  - template structuring
  - validation warnings
- Session History:
  - client-first list
  - transcript + template review/edit
  - deterministic **Full paragraph** output format
- Changelog tab in-app (reads `CHANGELOG.md`)

## Templates

The app currently supports **3 templates**:

- `generalNewClients`
- `lemonLaw`
- `uberRequest`

`detailedNarrative` was removed and legacy records are normalized to supported templates when loaded.

## Requirements

- Windows (primary target), Node 18+
- Chrome/Edge: when recording, share the **CTM tab** and enable **tab audio**

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` in the project folder **or** put `.env` in the app userData folder (same place SQLite is created) if you prefer not to store keys next to source.

Required:

- `OPENAI_API_KEY`

Optional (for email):

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`true` for 465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Note: SMTP variables are optional and currently the in-app email send action is disabled in the UI.

## Run (dev)

```bash
npm run dev
```

## Build

Compile the app (output in `out/`):

```bash
npm run build
```

Create a Windows installer under `release/`:

```bash
npm run dist
```

## Data & privacy

Sessions (audio file, transcript, template JSON, profile name, timestamps) are stored under the Electron **userData** directory. Recording laws and employer/CTM policies are your responsibility; the UI includes a short notice.

## Routing

Edit `resources/routing.json` to map `templateId` → recipient emails (defaults mirror DTLA-style Zapier robot addresses from training material).

## Changelog and app versioning

Generate/update changelog and bump patch version:

```bash
node scripts/generate-changelog.mjs
```

What it does:

- updates `CHANGELOG.md` using commits from `main`
- bumps `package.json` version by patch (`x.y.z` -> `x.y.(z+1)`)
- writes newest block first using:
  - `## [vX.Y.Z] - YYYY-MM-DD`
  - `Summary`
  - categorized sections

## Scripts

- `npm run dev` — electron-vite dev
- `npm run build` — compile + pack
- `npm run typecheck` — TypeScript checks
