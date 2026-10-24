# Nexora Flow foundation setup

## Supabase

1. Create a Supabase project and set its Auth email-confirmation behavior for your launch.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_ANON_KEY` to the project's anon/publishable key. Both are public browser values; never put a Supabase service-role key in a `VITE_` variable.
4. Apply all migrations to the intended Supabase project:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

5. In Supabase Auth URL configuration, add the local app URL and the final deployed app URL to the allowed redirect URLs.
6. Set the same two public variables in the app's deployment environment and rebuild/redeploy.

The migrations create profiles when Auth users are created, enable RLS on all workspace-owned tables, and expose workspace-checked operations for creating a workspace, saving CRM records, searching, and importing CSV rows. The signed-in user and role are derived or verified in PostgreSQL; browser-submitted workspace IDs never grant access by themselves.

The contacts and companies migration adds workspace-unique contact emails and company names/domains, tags and workspace-bound tag links, indexed search with pagination, and atomic CSV import RPCs. A CSV import is limited to 500 rows per request. Contact CSVs require `first_name,last_name`; optional columns are `email,phone,job_title,company_name,notes,tags`. Company CSVs require `name`; optional columns are `domain,phone,notes,tags`. Tag values are semicolon-separated names and must already exist in the workspace. Contact `company_name` values must match a company in the same workspace.

Contact and company deletion and tag deletion require the workspace owner or an admin. Members can create and edit CRM records; read-only members can view them. These rules are enforced by RLS, not only by the UI.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser app | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser app | Supabase anon/publishable key; protected by RLS |

No service-role key is required by this foundation. Do not add one to the browser app.

## AI assistant

The assistant is served by `artifacts/api-server` and uses a configurable, OpenAI-compatible chat-completions endpoint. It does not use a Replit proxy or any hardcoded provider credential.

Set these environment variables on the API server only:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL used by the server to validate signed-in sessions |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key; CRM reads still run with the user's access token and row-level security |
| `LLM_API_BASE_URL` | HTTPS base URL for an OpenAI-compatible API; the server appends `/chat/completions` |
| `LLM_API_KEY` | Provider credential; store it in Replit Secrets and never in a `VITE_` variable |
| `LLM_MODEL` | Model identifier accepted by the configured provider |

Apply the AI usage migration along with the existing migrations before using the assistant. Do not run `supabase db push` until the repository is linked to the intended Supabase project.

The server reads only the selected contact and that contact's related company, deals, tasks, and recent activities using the signed-in user's token. It does not accept CRM history from the browser, store prompts or generated replies, send email, or modify records. The app shows a reviewable draft and requires the user to take any external action themselves.

Usage is counted per workspace per UTC day: 10 requests on `free`, 100 on `growth`, and 500 on `pro`. Requests are also limited to 10 per user per 15-minute window. Only active or trialing subscriptions use their stored plan; other or missing subscriptions are treated as `free`. These limits are enforced in Postgres, not only in the UI.

If the AI provider settings are missing or the API is unavailable, generation returns a clear service-unavailable message and does not silently substitute mock content. CRM data and credentials are not included in application logs.

## Database tests

The SQL tests use temporary test-only accounts and records and roll back their transactions. They cover workspace isolation, cross-workspace references, duplicate and invalid data, tag isolation, and CSV import atomicity. Run them against a local Supabase database after applying migrations:

```sh
supabase start
supabase test db
```

Do not run `supabase db push` until the project is linked to the Supabase project you intend to modify.

## Deployment

Deploy the Nexora Flow web artifact as a static web app. Configure the two `VITE_SUPABASE_*` variables in the deployment environment before building. Configure the resulting deployed URL in Supabase Auth's redirect allowlist. Apply database migrations separately with the Supabase CLI; deploying the web app does not apply Supabase schema changes.
