-- Run with `supabase test db`. Fixtures live only inside this rolled-back test transaction.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.workspaces (id, name, slug, created_by) values
  ('20000000-0000-4000-8000-000000000001', 'Workspace A', 'rls-workspace-a-test', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Workspace B', 'rls-workspace-b-test', '10000000-0000-4000-8000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'owner');

insert into public.companies (id, workspace_id, name, created_by) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Company A', '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Company B', '10000000-0000-4000-8000-000000000002');

insert into public.contacts (id, workspace_id, company_id, first_name, last_name, created_by) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Ari', 'One', '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'Bea', 'Two', '10000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.contacts) <> 1 then
    raise exception 'Workspace A user should see exactly one contact';
  end if;
  if exists (select 1 from public.contacts where id = '40000000-0000-4000-8000-000000000002') then
    raise exception 'Workspace A user can see Workspace B contact';
  end if;
  if exists (select 1 from public.companies where id = '30000000-0000-4000-8000-000000000002') then
    raise exception 'Workspace A user can see Workspace B company';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.contacts (workspace_id, first_name, last_name)
    values ('20000000-0000-4000-8000-000000000002', 'Cross', 'Tenant');
    raise exception 'Cross-workspace contact insert was unexpectedly allowed';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.contacts) <> 1 then
    raise exception 'Workspace B user should see exactly one contact';
  end if;
  if exists (select 1 from public.contacts where id = '40000000-0000-4000-8000-000000000001') then
    raise exception 'Workspace B user can see Workspace A contact';
  end if;
end;
$$;

rollback;
