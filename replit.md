# مِشكاة — المساعد العربي المستقل

مساعد عربي مستقل يعمل بمحرك معرفة محلي، ويجيب عن الأسئلة العامة والتعليمية واليومية مع حفظ المحادثات على جهاز المستخدم.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/mishkat-ai run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/mishkat-ai run typecheck` — typecheck the web app
- `PORT=19106 BASE_PATH=/ pnpm --filter @workspace/mishkat-ai run build` — build the web app locally
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mishkat-ai/src/App.tsx` — RTL chat shell, local history, controls, and conversation UI
- `artifacts/mishkat-ai/src/lib/local-engine.ts` — standalone Arabic question-analysis and answer-composition engine
- `artifacts/mishkat-ai/src/lib/knowledge-base.ts` — local knowledge base: 14 religious domains (prayer, purification, fasting, zakat, hajj, repentance, Quran, Sunnah, creed, morals, inheritance, marriage, transactions, du'a) + 5 general domains
- `artifacts/mishkat-ai/src/lib/markdown.tsx` — mini markdown renderer for the constrained answer format
- `artifacts/api-server/src/lib/youtube-channel.ts` — deep video analyst: question analysis, transcript mining with timestamps, per-video topic detection, synthesized summary
- `artifacts/api-server/src/lib/question-analyzer.ts` — question type (ruling/definition/howto/...), keyword extraction, religious topic detection
- `artifacts/api-server/src/lib/religion-taxonomy.ts` — shared religious topic taxonomy (16 topics, synonym terms)
- `artifacts/api-server/src/lib/arabic.ts` — Arabic normalization, tokenization, lightweight stemming
- `artifacts/mishkat-ai/src/index.css` — visual system and responsive layout
- `artifacts/mishkat-ai/.replit-artifact/artifact.toml` — web artifact routing and workflow

## Architecture decisions

- The assistant remains usable without API keys, auth, or third-party AI providers. No external LLM calls.
- Every question is first analyzed (type: ruling/definition/howto/reason/evidence/difference, keywords, religious topics). The analysis is visible to the user as chips above the answer.
- Video grounding is deep, not surface: the API mines full transcripts (sentence segmentation with timestamps), scores sentences against the analyzed question terms (question words weigh more than topic synonyms), deduplicates overlapping quotes, detects what each video covers, and synthesizes a "summary of details" across videos.
- When the channel does not cover the question well (low coverage or metadata-only), the local knowledge base fills the gap — the answer then merges video material with a local knowledge section, so religious questions always get a full structured answer (ruling, details, Quran/hadith evidence, practical steps).
- Answer depth (مختصر/متوازن/متعمّق) is an explicit control and is passed to the API (`depth=concise|balanced|deep`), which changes how many quotes and summary points are produced.
- Confidence and internal knowledge signals are shown instead of presenting local matches as universal certainty.
- In dev, the Vite server proxies `/api` to the API server (port 5000 by default, override with `API_PROXY_PORT`). In production the platform path-router maps `/api` to the API service.

## Product

- Arabic RTL chat workspace with responsive desktop and mobile layouts.
- Suggested questions, local conversation archive, new conversation, clear history, theme toggle, and follow-up prompts.
- Six local knowledge domains covering learning, focus, faith and values, writing, thinking, and wellbeing.
- Answers include structured sections, practical actions, internal signals, and a safety note for specialist questions.

## User preferences

- The user asked for a site inspired by the attached Muslim Wa Bas assistant, expanded for broader answers and built as an independent AI experience not connected to another AI tool.

## Gotchas

- The Vite config requires `PORT` and `BASE_PATH` when invoking a build directly; managed workflows inject them automatically.
- The assistant is intentionally local and knowledge-bounded; do not add an external LLM call without an explicit product decision.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
