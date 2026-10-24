-- Run with `supabase test db`. Fixtures are rolled back with this transaction.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'assistant-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'assistant-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.workspaces (id, name, slug, created_by) values
  ('21000000-0000-4000-8000-000000000001', 'Assistant Workspace A', 'assistant-workspace-a-test', '11000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000002', 'Assistant Workspace B', 'assistant-workspace-b-test', '11000000-0000-4000-8000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner'),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);

do $$
declare
  usage_row record;
  attempt integer;
begin
  select * into usage_row
  from public.get_workspace_ai_usage('21000000-0000-4000-8000-000000000001');
  if usage_row.plan <> 'free' or usage_row.daily_limit <> 10 or usage_row.daily_used <> 0 then
    raise exception 'A new workspace should receive the free assistant quota';
  end if;

  for attempt in 1..10 loop
    select * into usage_row
    from public.consume_workspace_ai_request('21000000-0000-4000-8000-000000000001');
    if not usage_row.allowed then
      raise exception 'The free plan should allow its first 10 requests';
    end if;
  end loop;

  select * into usage_row
  from public.consume_workspace_ai_request('21000000-0000-4000-8000-000000000001');
  if usage_row.allowed or not usage_row.rate_limited then
    raise exception 'The short-window rate limit should reject the 11th request';
  end if;

  begin
    perform * from public.get_workspace_ai_usage('21000000-0000-4000-8000-000000000002');
    raise exception 'A non-member must not read another workspace quota';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
insert into public.subscriptions (workspace_id, plan, status)
values ('21000000-0000-4000-8000-000000000002', 'growth', 'active');
insert into public.ai_daily_usage (workspace_id, usage_date, request_count)
values ('21000000-0000-4000-8000-000000000002', (now() at time zone 'UTC')::date, 100);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);

do $$
declare
  usage_row record;
begin
  select * into usage_row
  from public.get_workspace_ai_usage('21000000-0000-4000-8000-000000000002');
  if usage_row.plan <> 'growth' or usage_row.daily_limit <> 100 or usage_row.daily_used <> 100 then
    raise exception 'The active growth plan should use its configured daily quota';
  end if;

  select * into usage_row
  from public.consume_workspace_ai_request('21000000-0000-4000-8000-000000000002');
  if usage_row.allowed or usage_row.rate_limited then
    raise exception 'The daily plan quota should reject further requests';
  end if;
end;
$$;

rollback;
