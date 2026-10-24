# Nexora Flow

An action-first CRM that helps small businesses organize customer relationships, opportunities, and follow-ups.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Run the `artifacts/nexora-flow: web` and `artifacts/api-server: API Server` managed workflows for the preview and API.
- Apply Supabase migrations only after linking the intended project: `supabase link --project-ref YOUR_PROJECT_REF && supabase db push`
- Browser env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- API env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LLM_API_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- API: Express 5
- CRM database and auth: Supabase Auth + PostgreSQL row-level security
- API validation: generated Zod schemas from OpenAPI
- API codegen: Orval (from OpenAPI spec)
- API build: esbuild

## Where things live

- `artifacts/nexora-flow` — React/Vite web app
- `artifacts/api-server` — shared Express API, including the authenticated AI assistant routes
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/api-zod` — generated API validation schemas
- `supabase/migrations` — workspace authorization, CRM schema, and AI usage controls
- `artifacts/nexora-flow/SETUP.md` — Supabase and assistant configuration details

## Architecture decisions

- The assistant uses an OpenAI-compatible chat-completions endpoint configured only on the API server; the provider key is never sent to the browser.
- CRM records are fetched with the signed-in user's Supabase token so existing row-level security remains the authorization boundary.
- Assistant requests do not send email or mutate CRM records; outputs are drafts and suggestions for the user to review.
- The assistant stores only plan usage and short-window request counts, not prompts or generated content.
- Default daily quotas are 10 (free), 100 (growth), and 500 (pro) requests per workspace; the API also allows 10 requests per user per 15 minutes.

## Product

Nexora Flow keeps customer context, sales opportunities, and next actions in one approachable workspace. Its assistant can summarize a selected contact, draft a follow-up email, or suggest next steps using authorized CRM records.

## User preferences

Do not invent customer history. Keep email drafts and suggested record changes under user review.

## Gotchas

- Configure all five API environment variables before the assistant can generate content. Store `LLM_API_KEY` in Replit Secrets, not in a Vite variable or committed file.
- Apply the new AI usage migration to the intended Supabase project before testing assistant usage; do not push migrations until the project is linked intentionally.
- The LLM API base URL must use HTTPS and expose an OpenAI-compatible `/chat/completions` route (HTTP localhost is allowed only in development).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
