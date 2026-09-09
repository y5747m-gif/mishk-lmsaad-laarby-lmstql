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
- `artifacts/mishkat-ai/src/lib/local-engine.ts` — standalone Arabic retrieval-and-composition engine
- `artifacts/mishkat-ai/src/index.css` — visual system and responsive layout
- `artifacts/mishkat-ai/.replit-artifact/artifact.toml` — web artifact routing and workflow

## Architecture decisions

- The first release is frontend-only so the assistant remains usable without API keys, auth, or third-party AI providers.
- Knowledge retrieval and answer composition happen in `local-engine.ts`; the UI stores only local conversation state in browser `localStorage`.
- Answer depth and intent are explicit controls so users can choose compact, balanced, educational, or practical responses.
- Confidence and internal knowledge signals are shown instead of presenting local matches as universal certainty.

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
