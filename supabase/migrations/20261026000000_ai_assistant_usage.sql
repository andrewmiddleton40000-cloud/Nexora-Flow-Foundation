-- Workspace-scoped AI quota and rate-limit counters. Prompt and CRM content are
-- deliberately not persisted.

create table public.ai_daily_usage (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (workspace_id, usage_date)
);

create table public.ai_request_windows (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (workspace_id, user_id, window_started_at)
);

alter table public.ai_daily_usage enable row level security;
alter table public.ai_request_windows enable row level security;
revoke all on table public.ai_daily_usage, public.ai_request_windows from public, anon, authenticated;

create function public.get_workspace_ai_usage(p_workspace_id uuid)
returns table (
  plan public.subscription_plan,
  daily_used integer,
  daily_limit integer,
  resets_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plan;
  v_limit integer;
  v_used integer;
  v_today date := (now() at time zone 'UTC')::date;
  v_reset timestamptz := ((date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC');
begin
  if auth.uid() is null or not public.has_workspace_role(p_workspace_id) then
    raise exception 'Not authorized for this workspace' using errcode = '42501';
  end if;

  select coalesce(
    (
      select s.plan
      from public.subscriptions as s
      where s.workspace_id = p_workspace_id
        and s.status in ('trialing', 'active')
        and (s.current_period_end is null or s.current_period_end > now())
      limit 1
    ),
    'free'::public.subscription_plan
  ) into v_plan;

  v_limit := case v_plan
    when 'growth' then 100
    when 'pro' then 500
    else 10
  end;

  select coalesce(u.request_count, 0)
  into v_used
  from public.ai_daily_usage as u
  where u.workspace_id = p_workspace_id and u.usage_date = v_today;

  return query select v_plan, coalesce(v_used, 0), v_limit, v_reset;
end;
$$;

create function public.consume_workspace_ai_request(p_workspace_id uuid)
returns table (
  allowed boolean,
  daily_used integer,
  daily_limit integer,
  plan public.subscription_plan,
  rate_limited boolean,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plan;
  v_limit integer;
  v_used integer;
  v_rate_count integer;
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'UTC')::date;
  v_window timestamptz := to_timestamp(floor(extract(epoch from v_now) / 900) * 900);
begin
  if v_user_id is null or not public.has_workspace_role(p_workspace_id) then
    raise exception 'Not authorized for this workspace' using errcode = '42501';
  end if;

  select coalesce(
    (
      select s.plan
      from public.subscriptions as s
      where s.workspace_id = p_workspace_id
        and s.status in ('trialing', 'active')
        and (s.current_period_end is null or s.current_period_end > v_now)
      limit 1
    ),
    'free'::public.subscription_plan
  ) into v_plan;

  v_limit := case v_plan
    when 'growth' then 100
    when 'pro' then 500
    else 10
  end;

  -- Keep only today's quota row and recent rate windows; prompt data is never stored.
  delete from public.ai_daily_usage
  where workspace_id = p_workspace_id and usage_date < v_today;
  delete from public.ai_request_windows
  where workspace_id = p_workspace_id
    and user_id = v_user_id
    and window_started_at < v_now - interval '1 day';

  insert into public.ai_request_windows (
    workspace_id, user_id, window_started_at, request_count
  ) values (
    p_workspace_id, v_user_id, v_window, 1
  )
  on conflict (workspace_id, user_id, window_started_at)
  do update set request_count = public.ai_request_windows.request_count + 1
  where public.ai_request_windows.request_count < 10
  returning request_count into v_rate_count;

  if v_rate_count is null then
    select coalesce(u.request_count, 0)
    into v_used
    from public.ai_daily_usage as u
    where u.workspace_id = p_workspace_id and u.usage_date = v_today;

    return query select
      false,
      coalesce(v_used, 0),
      v_limit,
      v_plan,
      true,
      greatest(1, ceil(extract(epoch from (v_window + interval '15 minutes' - v_now)))::integer);
    return;
  end if;

  insert into public.ai_daily_usage (workspace_id, usage_date, request_count)
  values (p_workspace_id, v_today, 1)
  on conflict (workspace_id, usage_date)
  do update set request_count = public.ai_daily_usage.request_count + 1
  where public.ai_daily_usage.request_count < v_limit
  returning request_count into v_used;

  if v_used is null then
    select u.request_count
    into v_used
    from public.ai_daily_usage as u
    where u.workspace_id = p_workspace_id and u.usage_date = v_today;

    return query select false, v_used, v_limit, v_plan, false, 0;
    return;
  end if;

  return query select true, v_used, v_limit, v_plan, false, 0;
end;
$$;

revoke all on function public.get_workspace_ai_usage(uuid) from public, anon;
revoke all on function public.consume_workspace_ai_request(uuid) from public, anon;
grant execute on function public.get_workspace_ai_usage(uuid) to authenticated;
grant execute on function public.consume_workspace_ai_request(uuid) to authenticated;
