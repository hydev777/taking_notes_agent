---
name: llm-token-thrift
description: >-
  Minimizes LLM token usage and API cost for chat/completions (structured JSON, intake notes, call agents). Use when editing prompts or OpenAI/chat code in taking_notes_agent, when the user mentions cost, tokens, cheap models, budget, or "gastar menos" en IA.
---

# LLM token thrift (low cost)

## Goal

Spend as little as possible on the **LLM step** (and related calls) while keeping **acceptable quality** for classification + structured fields. Transcription is often a **separate** bill (per minute); this skill focuses on **text tokens** sent to chat models.

## Reduce input tokens (highest leverage)

1. **Short system prompt** — Keep only rules the model cannot infer: output JSON shape, allowed `templateId` values, field names, "do not invent facts", language. Remove marketing prose, long PDF dumps, and duplicate bullets.
2. **No full document in every request** — Reference a **compressed checklist** (10–20 lines) instead of pasting entire training PDFs. If something must be verbatim, store it once in a **versioned snippet file** in the repo and keep the runtime prompt to "follow `config/intake-rules.md` spirit" plus 5 lines of hard constraints.
3. **User message = transcript + minimal extras** — Send the **raw transcript** once. Avoid repeating the same transcript in system + user. If the transcript is huge, consider **chunking** only when required, or **truncate tail** with an explicit note: `[... truncated for length; prioritize first N minutes]` (only if product accepts it).
4. **Structured output without prose** — Prefer `response_format: json_object` (or provider equivalent) and ask for **JSON only**, no markdown fences, no explanations, unless debugging (then use a dev-only flag).
5. **Few-shot examples** — Prefer **zero-shot** with a tight schema. If you need examples, use **one** short example total, not three variants.
6. **Caching / stable prefixes** — On providers that support **prompt caching** (OpenAI, Anthropic, some others), put **static** instructions first and **variable** transcript last so cache hits apply. DeepSeek documents cache pricing separately; design a **fixed** system prompt block.
7. **Cheaper call path** — If the task is only "pick templateId", a **smaller model** or a **short classifier** step can run first; only escalate to a larger model when confidence is low (two-step costs more in worst case but saves on average—validate with metrics).

## Reduce output tokens

1. **Tight schema** — Only fields needed for email/UI; empty string for unknown, no long narrative fields unless template requires them.
2. **Stop / max_tokens** — Set a sensible cap for JSON responses (enough for largest template + small buffer) to avoid runaway completions.

## Engineering habits

- Log **prompt token count** in dev (provider usage object or tokenizer estimate) when tuning.
- After prompt edits, run **one** golden call per template type; compare quality, not vibes.
- Do not send **PII** that is not required for the task (reduces risk and sometimes size).

## DeepSeek: is it cheap?

**Yes — DeepSeek is generally priced in the budget tier** versus flagship models from OpenAI or Anthropic. Exact numbers change; always use the official page:

- [Models & Pricing (DeepSeek API Docs)](https://api-docs.deepseek.com/quick_start/pricing/)

Example from that doc (verify live): **deepseek-v4-flash** is positioned as a low-cost flash model with **JSON output** support; pricing is listed per 1M tokens with **cache hit** and **cache miss** rows. Cache hits materially lower input cost for **repeated prefixes** (e.g. same system prompt every call).

**Tradeoffs:** another vendor and API key; OpenAI-compatible base URL is documented but integration and rate limits differ from OpenAI. For **legal intake JSON**, run evals on hallucinations and field adherence before switching.

---

## Cheapest LLM options (orientative — verify official pricing)

Order is **roughly** cheapest typical **text** inference for high volume, not a guarantee for every region or date. Check each provider’s pricing page before committing.

1. **Small open models via Groq / Together / Fireworks** (Llama 3.x 8B, Qwen small, etc.) — Often lowest **$/1M tokens**; quality varies; good for drafts or classification with strict Zod validation.
2. **Google Gemini 2.x Flash-Lite / Flash** — Aggressive **$/M** on text; large context; good for JSON if you accept Google AI billing/setup.
3. **DeepSeek V4-Flash (API)** — Strong **price/performance**; cache-friendly; see official table above.
4. **OpenAI gpt-4o-mini** — Simple stack with Whisper on same key; already a common default for cheap structured tasks.
5. **OpenAI GPT-4.1 Nano** (or current Nano-tier name on pricing page) — When available, often listed near Flash-lite tier for **light** tasks.
6. **Mistral Small** — Competitive in EU / structured JSON scenarios; verify latest Small vs Mini naming.
7. **Claude Haiku** — "Cheap for Claude" but usually **more** $/M than items 1–5; worth it if you need Anthropic-specific behavior.

**Not cheap (avoid for this agent unless necessary):** GPT-4o/5-class flagship, Claude Sonnet/Opus, Gemini Pro at full list price.

**Transcription (separate from LLM $/M):** OpenAI **Whisper** vs **gpt-4o-mini-transcribe** vs Deepgram batch — compare **$/minute** on official pages; mini-transcribe is often cited as cheaper per minute than legacy Whisper for similar workloads.

---

## When editing this project

- Prefer tightening [`src/main/services/openai.ts`](src/main/services/openai.ts) `SYSTEM_PROMPT` over adding new paragraphs.
- Keep DTLA rules in **one** compact block; link to internal `resources/` text if the team agrees, instead of inlining the full training doc.
