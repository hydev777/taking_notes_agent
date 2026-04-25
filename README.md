# Taking Notes Agent

Electron desktop app for **CTM-style calls**: capture **browser tab audio + microphone**, save the call audio locally, **transcribe** (OpenAI Whisper), **fill one of four intake templates** (OpenAI chat JSON), validate basic training checks, optionally **email** via SMTP.

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

## Scripts

- `npm run dev` — electron-vite dev
- `npm run build` — compile + pack
- `npm run typecheck` — TypeScript checks
