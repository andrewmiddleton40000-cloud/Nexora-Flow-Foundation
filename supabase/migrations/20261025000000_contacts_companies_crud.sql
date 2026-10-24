-- Workspace-scoped contacts, companies, tags, search, and atomic CSV imports.

alter table public.companies
  add constraint companies_domain_format check (
    domain is null or (
      char_length(btrim(domain)) <= 253
      and domain ~* '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
    )
  );

create unique index companies_workspace_name_unique
  on public.companies (workspace_id, lower(btrim(name)));
create unique index companies_workspace_domain_unique
  on public.companies (workspace_id, lower(btrim(domain)))
  where domain is not null and btrim(domain) <> '';
create unique index contacts_workspace_email_unique
  on public.contacts (workspace_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  color text not null default '#7C8B68',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint tags_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tags_id_workspace_unique unique (id, workspace_id)
);

create unique index tags_workspace_name_unique
  on public.tags (workspace_id, lower(btrim(name)));
create index tags_workspace_created_idx on public.tags (workspace_id, name);

create table public.contact_tags (
  workspace_id uuid not null,
  contact_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, contact_id, tag_id),
  constraint contact_tags_contact_workspace_fk foreign key (contact_id, workspace_id)
    references public.contacts (id, workspace_id) on delete cascade,
  constraint contact_tags_tag_workspace_fk foreign key (tag_id, workspace_id)
    references public.tags (id, workspace_id) on delete cascade
);
create index contact_tags_workspace_tag_idx on public.contact_tags (workspace_id, tag_id, contact_id);

create table public.company_tags (
  workspace_id uuid not null,
  company_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, company_id, tag_id),
  constraint company_tags_company_workspace_fk foreign key (company_id, workspace_id)
    references public.companies (id, workspace_id) on delete cascade,
  constraint company_tags_tag_workspace_fk foreign key (tag_id, workspace_id)
    references public.tags (id, workspace_id) on delete cascade
);
create index company_tags_workspace_tag_idx on public.company_tags (workspace_id, tag_id, company_id);

create trigger tags_touch_updated_at before update on public.tags
  for each row execute function public.touch_updated_at();
create trigger tags_enforce_owner before insert or update on public.tags
  for each row execute function public.enforce_workspace_record_owner();

alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.company_tags enable row level security;

create policy tags_select_member on public.tags
  for select to authenticated
  using (public.has_workspace_role(workspace_id));
create policy tags_insert_editor on public.tags
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy tags_update_editor on public.tags
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy tags_delete_admin on public.tags
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy contact_tags_select_member on public.contact_tags
  for select to authenticated
  using (public.has_workspace_role(workspace_id));
create policy contact_tags_insert_editor on public.contact_tags
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy contact_tags_delete_editor on public.contact_tags
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));

create policy company_tags_select_member on public.company_tags
  for select to authenticated
  using (public.has_workspace_role(workspace_id));
create policy company_tags_insert_editor on public.company_tags
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy company_tags_delete_editor on public.company_tags
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));

revoke all on table public.tags, public.contact_tags, public.company_tags from anon, authenticated;
grant select on public.tags, public.contact_tags, public.company_tags to authenticated;
grant insert, update, delete on public.tags to authenticated;
grant insert, delete on public.contact_tags, public.company_tags to authenticated;

create function public.set_contact_tags(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_tag_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  ) then
    raise exception 'Not authorized to change contact tags' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.contacts
    where id = p_contact_id and workspace_id = p_workspace_id
  ) then
    raise exception 'Contact not found in this workspace' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_tag_ids), 0) > 25 then
    raise exception 'A record can have at most 25 tags' using errcode = '22023';
  end if;

  delete from public.contact_tags
  where workspace_id = p_workspace_id and contact_id = p_contact_id;

  insert into public.contact_tags (workspace_id, contact_id, tag_id)
  select p_workspace_id, p_contact_id, requested.tag_id
  from (
    select distinct unnest(coalesce(p_tag_ids, array[]::uuid[])) as tag_id
  ) as requested;
end;
$$;

create function public.set_company_tags(
  p_workspace_id uuid,
  p_company_id uuid,
  p_tag_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  ) then
    raise exception 'Not authorized to change company tags' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.companies
    where id = p_company_id and workspace_id = p_workspace_id
  ) then
    raise exception 'Company not found in this workspace' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_tag_ids), 0) > 25 then
    raise exception 'A record can have at most 25 tags' using errcode = '22023';
  end if;

  delete from public.company_tags
  where workspace_id = p_workspace_id and company_id = p_company_id;

  insert into public.company_tags (workspace_id, company_id, tag_id)
  select p_workspace_id, p_company_id, requested.tag_id
  from (
    select distinct unnest(coalesce(p_tag_ids, array[]::uuid[])) as tag_id
  ) as requested;
end;
$$;

create function public.save_workspace_contact(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_values jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  tag_ids uuid[];
  normalized_email text;
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  ) then
    raise exception 'Not authorized to edit contacts in this workspace' using errcode = '42501';
  end if;
  if jsonb_typeof(p_values) <> 'object' then
    raise exception 'Contact details are invalid' using errcode = '22023';
  end if;

  normalized_email := nullif(lower(btrim(coalesce(p_values ->> 'email', ''))), '');
  if normalized_email is not null
     and normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  if p_contact_id is null then
    insert into public.contacts (
      workspace_id, first_name, last_name, email, phone, job_title, company_id, notes
    ) values (
      p_workspace_id,
      btrim(coalesce(p_values ->> 'first_name', '')),
      btrim(coalesce(p_values ->> 'last_name', '')),
      normalized_email,
      nullif(btrim(coalesce(p_values ->> 'phone', '')), ''),
      nullif(btrim(coalesce(p_values ->> 'job_title', '')), ''),
      nullif(p_values ->> 'company_id', '')::uuid,
      nullif(btrim(coalesce(p_values ->> 'notes', '')), '')
    ) returning id into saved_id;
  else
    update public.contacts set
      first_name = btrim(coalesce(p_values ->> 'first_name', '')),
      last_name = btrim(coalesce(p_values ->> 'last_name', '')),
      email = normalized_email,
      phone = nullif(btrim(coalesce(p_values ->> 'phone', '')), ''),
      job_title = nullif(btrim(coalesce(p_values ->> 'job_title', '')), ''),
      company_id = nullif(p_values ->> 'company_id', '')::uuid,
      notes = nullif(btrim(coalesce(p_values ->> 'notes', '')), '')
    where id = p_contact_id and workspace_id = p_workspace_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Contact not found or not authorized' using errcode = '42501';
    end if;
  end if;

  select coalesce(array_agg(value::uuid), array[]::uuid[])
  into tag_ids
  from jsonb_array_elements_text(coalesce(p_values -> 'tag_ids', '[]'::jsonb));
  perform public.set_contact_tags(p_workspace_id, saved_id, tag_ids);
  return saved_id;
end;
$$;

create function public.save_workspace_company(
  p_workspace_id uuid,
  p_company_id uuid,
  p_values jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  tag_ids uuid[];
  normalized_domain text;
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  ) then
    raise exception 'Not authorized to edit companies in this workspace' using errcode = '42501';
  end if;
  if jsonb_typeof(p_values) <> 'object' then
    raise exception 'Company details are invalid' using errcode = '22023';
  end if;

  normalized_domain := nullif(lower(btrim(coalesce(p_values ->> 'domain', ''))), '');
  if normalized_domain is not null and (
    char_length(normalized_domain) > 253
    or normalized_domain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
  ) then
    raise exception 'Enter a valid company domain' using errcode = '22023';
  end if;

  if p_company_id is null then
    insert into public.companies (workspace_id, name, domain, phone, notes)
    values (
      p_workspace_id,
      btrim(coalesce(p_values ->> 'name', '')),
      normalized_domain,
      nullif(btrim(coalesce(p_values ->> 'phone', '')), ''),
      nullif(btrim(coalesce(p_values ->> 'notes', '')), '')
    ) returning id into saved_id;
  else
    update public.companies set
      name = btrim(coalesce(p_values ->> 'name', '')),
      domain = normalized_domain,
      phone = nullif(btrim(coalesce(p_values ->> 'phone', '')), ''),
      notes = nullif(btrim(coalesce(p_values ->> 'notes', '')), '')
    where id = p_company_id and workspace_id = p_workspace_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Company not found or not authorized' using errcode = '42501';
    end if;
  end if;

  select coalesce(array_agg(value::uuid), array[]::uuid[])
  into tag_ids
  from jsonb_array_elements_text(coalesce(p_values -> 'tag_ids', '[]'::jsonb));
  perform public.set_company_tags(p_workspace_id, saved_id, tag_ids);
  return saved_id;
end;
$$;

create function public.import_workspace_contacts(p_workspace_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_value jsonb;
  imported_count integer := 0;
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  ) then
    raise exception 'Not authorized to import contacts into this workspace' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Import must contain no more than 500 contact rows' using errcode = '22023';
  end if;
  for row_value in select value from jsonb_array_elements(p_rows)
  loop
    perform public.save_workspace_contact(p_workspace_id, null, row_value);
    imported_count := imported_count + 1;
  end loop;
  return imported_count;
end;
$$;

create function public.import_workspace_companies(p_workspace_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_value jsonb;
  imported_count integer := 0;
begin
  if not public.has_workspace_role(
    p_workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  ) then
    raise exception 'Not authorized to import companies into this workspace' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Import must contain no more than 500 company rows' using errcode = '22023';
  end if;
  for row_value in select value from jsonb_array_elements(p_rows)
  loop
    perform public.save_workspace_company(p_workspace_id, null, row_value);
    imported_count := imported_count + 1;
  end loop;
  return imported_count;
end;
$$;

create function public.search_workspace_contacts(
  p_workspace_id uuid,
  p_search text,
  p_tag_id uuid,
  p_page integer,
  p_page_size integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select
      c.id,
      c.workspace_id,
      c.company_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.job_title,
      c.notes,
      c.created_at,
      c.updated_at,
      case when co.id is null then null else jsonb_build_object('id', co.id, 'name', co.name) end as company,
      coalesce(tag_data.items, '[]'::jsonb) as tags
    from public.contacts as c
    left join public.companies as co
      on co.id = c.company_id and co.workspace_id = c.workspace_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name) as items
      from public.contact_tags as ct
      join public.tags as t on t.id = ct.tag_id and t.workspace_id = ct.workspace_id
      where ct.workspace_id = c.workspace_id and ct.contact_id = c.id
    ) as tag_data on true
    where c.workspace_id = p_workspace_id
      and public.has_workspace_role(p_workspace_id)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', c.first_name, c.last_name, c.email, c.phone, c.job_title, co.name)
          ilike '%' || btrim(p_search) || '%'
      )
      and (
        p_tag_id is null
        or exists (
          select 1 from public.contact_tags as filter_tag
          where filter_tag.workspace_id = c.workspace_id
            and filter_tag.contact_id = c.id
            and filter_tag.tag_id = p_tag_id
        )
      )
  ),
  page_rows as (
    select * from filtered
    order by last_name, first_name, id
    limit greatest(1, least(coalesce(p_page_size, 25), 100))
    offset greatest(coalesce(p_page - 1, 0), 0) * greatest(1, least(coalesce(p_page_size, 25), 100))
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered)
  );
$$;

create function public.search_workspace_companies(
  p_workspace_id uuid,
  p_search text,
  p_tag_id uuid,
  p_page integer,
  p_page_size integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select
      co.id,
      co.workspace_id,
      co.name,
      co.domain,
      co.phone,
      co.notes,
      co.created_at,
      co.updated_at,
      (select count(*) from public.contacts as c
       where c.workspace_id = co.workspace_id and c.company_id = co.id) as contact_count,
      coalesce(tag_data.items, '[]'::jsonb) as tags
    from public.companies as co
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name) as items
      from public.company_tags as ct
      join public.tags as t on t.id = ct.tag_id and t.workspace_id = ct.workspace_id
      where ct.workspace_id = co.workspace_id and ct.company_id = co.id
    ) as tag_data on true
    where co.workspace_id = p_workspace_id
      and public.has_workspace_role(p_workspace_id)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', co.name, co.domain, co.phone) ilike '%' || btrim(p_search) || '%'
      )
      and (
        p_tag_id is null
        or exists (
          select 1 from public.company_tags as filter_tag
          where filter_tag.workspace_id = co.workspace_id
            and filter_tag.company_id = co.id
            and filter_tag.tag_id = p_tag_id
        )
      )
  ),
  page_rows as (
    select * from filtered
    order by name, id
    limit greatest(1, least(coalesce(p_page_size, 25), 100))
    offset greatest(coalesce(p_page - 1, 0), 0) * greatest(1, least(coalesce(p_page_size, 25), 100))
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered)
  );
$$;

revoke all on function public.set_contact_tags(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_contact_tags(uuid, uuid, uuid[]) to authenticated;
revoke all on function public.set_company_tags(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_company_tags(uuid, uuid, uuid[]) to authenticated;
revoke all on function public.save_workspace_contact(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_workspace_contact(uuid, uuid, jsonb) to authenticated;
revoke all on function public.save_workspace_company(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_workspace_company(uuid, uuid, jsonb) to authenticated;
revoke all on function public.import_workspace_contacts(uuid, jsonb) from public, anon;
grant execute on function public.import_workspace_contacts(uuid, jsonb) to authenticated;
revoke all on function public.import_workspace_companies(uuid, jsonb) from public, anon;
grant execute on function public.import_workspace_companies(uuid, jsonb) to authenticated;
revoke all on function public.search_workspace_contacts(uuid, text, uuid, integer, integer) from public, anon;
grant execute on function public.search_workspace_contacts(uuid, text, uuid, integer, integer) to authenticated;
revoke all on function public.search_workspace_companies(uuid, text, uuid, integer, integer) from public, anon;
grant execute on function public.search_workspace_companies(uuid, text, uuid, integer, integer) to authenticated;
