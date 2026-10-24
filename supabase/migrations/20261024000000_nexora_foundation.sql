-- Nexora Flow workspace foundation.
-- Apply with `supabase db push` only after linking the intended Supabase project.

create type public.workspace_role as enum ('owner', 'admin', 'member', 'readonly');
create type public.deal_stage as enum ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');
create type public.task_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high');
create type public.subscription_plan as enum ('free', 'growth', 'pro');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
create type public.activity_type as enum ('note', 'email', 'call', 'meeting', 'status_change');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 120)
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint workspaces_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint workspaces_id_workspace_id_unique unique (id)
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_workspace_user_unique unique (workspace_id, user_id),
  constraint workspace_members_id_workspace_unique unique (id, workspace_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  domain text,
  phone text,
  notes text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_name_length check (char_length(btrim(name)) between 1 and 160),
  constraint companies_id_workspace_unique unique (id, workspace_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  job_title text,
  notes text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_length check (
    char_length(btrim(first_name)) between 1 and 100
    and char_length(btrim(last_name)) between 1 and 100
  ),
  constraint contacts_email_format check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint contacts_company_workspace_fk foreign key (company_id, workspace_id)
    references public.companies (id, workspace_id),
  constraint contacts_id_workspace_unique unique (id, workspace_id)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid,
  company_id uuid,
  name text not null,
  stage public.deal_stage not null default 'lead',
  amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  expected_close_date date,
  notes text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_name_length check (char_length(btrim(name)) between 1 and 180),
  constraint deals_amount_nonnegative check (amount >= 0),
  constraint deals_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint deals_contact_workspace_fk foreign key (contact_id, workspace_id)
    references public.contacts (id, workspace_id),
  constraint deals_company_workspace_fk foreign key (company_id, workspace_id)
    references public.companies (id, workspace_id),
  constraint deals_id_workspace_unique unique (id, workspace_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  title text not null,
  description text,
  due_at timestamptz,
  status public.task_status not null default 'open',
  priority public.task_priority not null default 'normal',
  completed_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_length check (char_length(btrim(title)) between 1 and 180),
  constraint tasks_completion_consistency check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint tasks_contact_workspace_fk foreign key (contact_id, workspace_id)
    references public.contacts (id, workspace_id),
  constraint tasks_deal_workspace_fk foreign key (deal_id, workspace_id)
    references public.deals (id, workspace_id),
  constraint tasks_id_workspace_unique unique (id, workspace_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  task_id uuid,
  activity_type public.activity_type not null default 'note',
  body text not null,
  actor_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint activities_body_length check (char_length(btrim(body)) between 1 and 10000),
  constraint activities_has_parent check (
    contact_id is not null or deal_id is not null or task_id is not null
  ),
  constraint activities_contact_workspace_fk foreign key (contact_id, workspace_id)
    references public.contacts (id, workspace_id),
  constraint activities_deal_workspace_fk foreign key (deal_id, workspace_id)
    references public.deals (id, workspace_id),
  constraint activities_task_workspace_fk foreign key (task_id, workspace_id)
    references public.tasks (id, workspace_id),
  constraint activities_id_workspace_unique unique (id, workspace_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'trialing',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_id_workspace_unique unique (id, workspace_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  recipient_id uuid not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_length check (char_length(btrim(title)) between 1 and 180),
  constraint notifications_recipient_workspace_fk foreign key (workspace_id, recipient_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade,
  constraint notifications_id_workspace_unique unique (id, workspace_id)
);

create index workspace_members_user_workspace_idx on public.workspace_members (user_id, workspace_id);
create index companies_workspace_name_idx on public.companies (workspace_id, name);
create index contacts_workspace_name_idx on public.contacts (workspace_id, last_name, first_name);
create index contacts_workspace_email_idx on public.contacts (workspace_id, lower(email)) where email is not null;
create index contacts_workspace_company_idx on public.contacts (workspace_id, company_id) where company_id is not null;
create index deals_workspace_stage_idx on public.deals (workspace_id, stage);
create index deals_workspace_close_date_idx on public.deals (workspace_id, expected_close_date);
create index tasks_workspace_status_due_idx on public.tasks (workspace_id, status, due_at);
create index tasks_workspace_contact_idx on public.tasks (workspace_id, contact_id) where contact_id is not null;
create index activities_workspace_created_idx on public.activities (workspace_id, created_at desc);
create index activities_workspace_contact_idx on public.activities (workspace_id, contact_id, created_at desc) where contact_id is not null;
create index notifications_workspace_recipient_created_idx on public.notifications (workspace_id, recipient_id, created_at desc);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.enforce_workspace_record_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  elsif new.workspace_id is distinct from old.workspace_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Workspace ownership fields cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.enforce_activity_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.actor_id := auth.uid();
  end if;
  return new;
end;
$$;

create function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger workspaces_touch_updated_at before update on public.workspaces
  for each row execute function public.touch_updated_at();
create trigger workspace_members_touch_updated_at before update on public.workspace_members
  for each row execute function public.touch_updated_at();
create trigger companies_touch_updated_at before update on public.companies
  for each row execute function public.touch_updated_at();
create trigger contacts_touch_updated_at before update on public.contacts
  for each row execute function public.touch_updated_at();
create trigger deals_touch_updated_at before update on public.deals
  for each row execute function public.touch_updated_at();
create trigger tasks_touch_updated_at before update on public.tasks
  for each row execute function public.touch_updated_at();
create trigger subscriptions_touch_updated_at before update on public.subscriptions
  for each row execute function public.touch_updated_at();
create trigger notifications_touch_updated_at before update on public.notifications
  for each row execute function public.touch_updated_at();

create trigger companies_enforce_owner before insert or update on public.companies
  for each row execute function public.enforce_workspace_record_owner();
create trigger contacts_enforce_owner before insert or update on public.contacts
  for each row execute function public.enforce_workspace_record_owner();
create trigger deals_enforce_owner before insert or update on public.deals
  for each row execute function public.enforce_workspace_record_owner();
create trigger tasks_enforce_owner before insert or update on public.tasks
  for each row execute function public.enforce_workspace_record_owner();
create trigger activities_enforce_actor before insert on public.activities
  for each row execute function public.enforce_activity_actor();

create function public.has_workspace_role(
  p_workspace_id uuid,
  p_allowed_roles public.workspace_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as membership
    where membership.workspace_id = p_workspace_id
      and membership.user_id = (select auth.uid())
      and (
        p_allowed_roles is null
        or membership.role = any (p_allowed_roles)
      )
  );
$$;

create function public.create_workspace(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  new_workspace_id uuid;
  cleaned_name text := btrim(coalesce(p_name, ''));
  cleaned_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if requesting_user_id is null then
    raise exception 'Sign in before creating a workspace' using errcode = '28000';
  end if;
  if char_length(cleaned_name) not between 1 and 100 then
    raise exception 'Workspace name must be between 1 and 100 characters' using errcode = '22023';
  end if;
  if char_length(cleaned_slug) not between 1 and 80
     or cleaned_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Workspace address must contain lowercase letters, numbers, and single hyphens' using errcode = '22023';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (cleaned_name, cleaned_slug, requesting_user_id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, requesting_user_id, 'owner');

  return new_workspace_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.tasks enable row level security;
alter table public.activities enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (public.has_workspace_role(id));
create policy workspace_members_select_member on public.workspace_members
  for select to authenticated
  using (public.has_workspace_role(workspace_id));

create policy companies_select_member on public.companies
  for select to authenticated
  using (public.has_workspace_role(workspace_id));
create policy companies_insert_editor on public.companies
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy companies_update_editor on public.companies
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy companies_delete_admin on public.companies
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy contacts_select_member on public.contacts
  for select to authenticated
  using (public.has_workspace_role(workspace_id));
create policy contacts_insert_editor on public.contacts
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy contacts_update_editor on public.contacts
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy contacts_delete_admin on public.contacts
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy deals_select_member on public.deals
  for select to authenticated
  using (public.has_workspace_role(workspace_id));
create policy deals_insert_editor on public.deals
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy deals_update_editor on public.deals
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy deals_delete_admin on public.deals
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy tasks_select_member on public.tasks
  for select to authenticated
  using (public.has_workspace_role(workspace_id));
create policy tasks_insert_editor on public.tasks
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy tasks_update_editor on public.tasks
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy tasks_delete_admin on public.tasks
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy activities_select_member on public.activities
  for select to authenticated
  using (public.has_workspace_role(workspace_id));
create policy activities_insert_editor on public.activities
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[])
  );

create policy subscriptions_select_admin on public.subscriptions
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy notifications_select_recipient on public.notifications
  for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.has_workspace_role(workspace_id)
  );
create policy notifications_update_read_state on public.notifications
  for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.has_workspace_role(workspace_id)
  )
  with check (
    recipient_id = (select auth.uid())
    and public.has_workspace_role(workspace_id)
  );

revoke all on table
  public.profiles, public.workspaces, public.workspace_members,
  public.companies, public.contacts, public.deals, public.tasks,
  public.activities, public.subscriptions, public.notifications
from anon, authenticated;

grant select on public.profiles, public.workspaces, public.workspace_members,
  public.companies, public.contacts, public.deals, public.tasks,
  public.activities, public.subscriptions, public.notifications
to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant insert, update, delete on public.companies, public.contacts, public.deals, public.tasks
to authenticated;
grant insert on public.activities to authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke all on function public.has_workspace_role(uuid, public.workspace_role[]) from public, anon;
grant execute on function public.has_workspace_role(uuid, public.workspace_role[]) to authenticated;
revoke all on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;
