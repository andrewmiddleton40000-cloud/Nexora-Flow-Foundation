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

## Database tests

The SQL tests use temporary test-only accounts and records and roll back their transactions. They cover workspace isolation, cross-workspace references, duplicate and invalid data, tag isolation, and CSV import atomicity. Run them against a local Supabase database after applying migrations:

```sh
supabase start
supabase test db
```

Do not run `supabase db push` until the project is linked to the Supabase project you intend to modify.

## Deployment

Deploy the Nexora Flow web artifact as a static web app. Configure the two `VITE_SUPABASE_*` variables in the deployment environment before building. Configure the resulting deployed URL in Supabase Auth's redirect allowlist. Apply database migrations separately with the Supabase CLI; deploying the web app does not apply Supabase schema changes.
