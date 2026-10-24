-- Run after applying all migrations with `supabase test db`.
-- Data is isolated to this test transaction and rolled back at the end.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'crm-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'crm-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.workspaces (id, name, slug, created_by) values
  ('52000000-0000-4000-8000-000000000001', 'CRM Workspace A', 'crm-workspace-a-test', '51000000-0000-4000-8000-000000000001'),
  ('52000000-0000-4000-8000-000000000002', 'CRM Workspace B', 'crm-workspace-b-test', '51000000-0000-4000-8000-000000000002');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'owner'),
  ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', 'owner');

insert into public.companies (id, workspace_id, name, domain, created_by) values
  ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Acme A', 'acme-a.example', '51000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'Acme B', 'acme-b.example', '51000000-0000-4000-8000-000000000002');

insert into public.contacts (id, workspace_id, company_id, first_name, last_name, email, created_by) values
  ('54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'Ada', 'One', 'ada@example.test', '51000000-0000-4000-8000-000000000001'),
  ('54000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'Bea', 'Two', 'bea@example.test', '51000000-0000-4000-8000-000000000002');

insert into public.tags (id, workspace_id, name, color, created_by) values
  ('55000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Priority', '#7C8B68', '51000000-0000-4000-8000-000000000001'),
  ('55000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'Private B', '#7C8B68', '51000000-0000-4000-8000-000000000002');

insert into public.contact_tags (workspace_id, contact_id, tag_id) values
  ('52000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001');
insert into public.company_tags (workspace_id, company_id, tag_id) values
  ('52000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);

do $$
declare
  result jsonb;
begin
  if (select count(*) from public.contacts) <> 1 then
    raise exception 'Workspace A should only see its contact';
  end if;
  if (select count(*) from public.companies) <> 1 then
    raise exception 'Workspace A should only see its company';
  end if;
  if (select count(*) from public.tags) <> 1 then
    raise exception 'Workspace A should only see its tag';
  end if;
  if (select count(*) from public.contact_tags) <> 1 or (select count(*) from public.company_tags) <> 1 then
    raise exception 'Workspace A should only see its tag links';
  end if;

  result := public.search_workspace_contacts(
    '52000000-0000-4000-8000-000000000002', '', null, 1, 25
  );
  if result ->> 'total' <> '0' or jsonb_array_length(result -> 'items') <> 0 then
    raise exception 'Workspace A search returned Workspace B contacts';
  end if;
  result := public.search_workspace_companies(
    '52000000-0000-4000-8000-000000000002', '', null, 1, 25
  );
  if result ->> 'total' <> '0' or jsonb_array_length(result -> 'items') <> 0 then
    raise exception 'Workspace A search returned Workspace B companies';
  end if;

  begin
    insert into public.contacts (workspace_id, first_name, last_name)
    values ('52000000-0000-4000-8000-000000000002', 'Cross', 'Tenant');
    raise exception 'Cross-workspace contact insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.save_workspace_contact(
      '52000000-0000-4000-8000-000000000002',
      null,
      '{"first_name":"Cross","last_name":"Tenant","tag_ids":[]}'::jsonb
    );
    raise exception 'Cross-workspace save RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.set_contact_tags(
      '52000000-0000-4000-8000-000000000001',
      '54000000-0000-4000-8000-000000000001',
      array['55000000-0000-4000-8000-000000000002']::uuid[]
    );
    raise exception 'Cross-workspace tag assignment unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.contacts (workspace_id, company_id, first_name, last_name)
    values ('52000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000002', 'Wrong', 'Company');
    raise exception 'Cross-workspace company reference unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.companies (workspace_id, name)
    values ('52000000-0000-4000-8000-000000000001', ' acme a ');
    raise exception 'Case-insensitive duplicate company name unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  begin
    insert into public.contacts (workspace_id, first_name, last_name, email)
    values ('52000000-0000-4000-8000-000000000001', 'Ari', 'Dup', 'ADA@EXAMPLE.TEST');
    raise exception 'Case-insensitive duplicate contact email unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  begin
    insert into public.companies (workspace_id, name, domain)
    values ('52000000-0000-4000-8000-000000000001', 'Invalid domain', 'https://bad.example');
    raise exception 'Invalid company domain unexpectedly succeeded';
  exception when check_violation then null;
  end;
  begin
    insert into public.contacts (workspace_id, first_name, last_name, email)
    values ('52000000-0000-4000-8000-000000000001', 'Invalid', 'Email', 'not-an-email');
    raise exception 'Invalid email unexpectedly succeeded';
  exception when check_violation then null;
  end;
  begin
    insert into public.contacts (workspace_id, first_name, last_name)
    values ('52000000-0000-4000-8000-000000000001', ' ', 'Blank');
    raise exception 'Blank contact name unexpectedly succeeded';
  exception when check_violation then null;
  end;

  begin
    perform public.import_workspace_contacts(
      '52000000-0000-4000-8000-000000000001',
      jsonb_build_array(
        '{"first_name":"Atomic","last_name":"New","email":"atomic@example.test","tag_ids":[]}'::jsonb,
        '{"first_name":"Duplicate","last_name":"Email","email":"ada@example.test","tag_ids":[]}'::jsonb
      )
    );
    raise exception 'Import with duplicate email unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  if exists (select 1 from public.contacts where workspace_id = '52000000-0000-4000-8000-000000000001' and email = 'atomic@example.test') then
    raise exception 'Failed CSV import left a partial contact behind';
  end if;

  if public.import_workspace_contacts(
    '52000000-0000-4000-8000-000000000001',
    '[{"first_name":"Import","last_name":"Good","email":"good@example.test","tag_ids":["55000000-0000-4000-8000-000000000001"]}]'::jsonb
  ) <> 1 then
    raise exception 'Valid CSV import should create one contact';
  end if;
  result := public.search_workspace_contacts(
    '52000000-0000-4000-8000-000000000001', '', null, 1, 1
  );
  if result ->> 'total' <> '2' or jsonb_array_length(result -> 'items') <> 1 then
    raise exception 'Contact search should return one paginated row and the total count';
  end if;
  result := public.search_workspace_contacts(
    '52000000-0000-4000-8000-000000000001', 'Good', null, 1, 25
  );
  if result ->> 'total' <> '1' then
    raise exception 'Contact search should filter real contact fields';
  end if;
  result := public.search_workspace_companies(
    '52000000-0000-4000-8000-000000000001', 'Acme', null, 1, 25
  );
  if result ->> 'total' <> '1' then
    raise exception 'Company search should filter real company fields';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.contacts) <> 1 or (select count(*) from public.companies) <> 1 then
    raise exception 'Workspace B cannot see only its own records';
  end if;
  if exists (select 1 from public.tags where name = 'Priority') then
    raise exception 'Workspace B can see Workspace A tags';
  end if;
end;
$$;

rollback;
