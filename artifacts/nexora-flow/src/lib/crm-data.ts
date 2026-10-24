import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCompaniesCsv, parseContactsCsv, CsvValidationError } from './crm-csv';
import type {
  CompanyCsvRow,
  CompanyInput,
  ContactCsvRow,
  ContactInput,
  CrmCompany,
  CrmContact,
  CrmListOptions,
  CrmPage,
  CrmTag,
} from './crm-types';
import { validateCompanyInput, validateContactInput } from './crm-validation';

const DEFAULT_PAGE_SIZE = 25;

export class CrmDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'CrmDataError';
  }
}

type SupabaseError = { code?: string; message?: string } | null;

export function friendlyCrmError(error: SupabaseError): CrmDataError {
  const code = error?.code;
  if (code === '23505') {
    return new CrmDataError('A contact email, company name, domain, or tag with that value already exists in this workspace.', code);
  }
  if (code === '23503') {
    return new CrmDataError('That company or tag is no longer available in this workspace. Refresh and try again.', code);
  }
  if (code === '42501') {
    return new CrmDataError('You do not have permission to make that change in this workspace.', code);
  }
  if (code === '23514' || code === '22023') {
    return new CrmDataError(error?.message || 'Some of the information is invalid. Check the highlighted fields.', code);
  }
  return new CrmDataError(error?.message || 'We could not complete that request. Try again.', code);
}

function requireWorkspace(workspaceId: string) {
  if (!workspaceId.trim()) throw new CrmDataError('Select a workspace before accessing CRM records.');
}

async function searchPage<T>(
  client: SupabaseClient,
  functionName: 'search_workspace_contacts' | 'search_workspace_companies',
  workspaceId: string,
  options: CrmListOptions = {},
): Promise<CrmPage<T>> {
  requireWorkspace(workspaceId);
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE)));
  const { data, error } = await client.rpc(functionName, {
    p_workspace_id: workspaceId,
    p_search: options.search?.trim() ?? '',
    p_tag_id: options.tagId || null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw friendlyCrmError(error);
  const result = data as unknown as { items?: T[]; total?: number } | null;
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    total: Number(result?.total ?? 0),
    page,
    pageSize,
  };
}

export function listContacts(
  client: SupabaseClient,
  workspaceId: string,
  options: CrmListOptions = {},
): Promise<CrmPage<CrmContact>> {
  return searchPage<CrmContact>(client, 'search_workspace_contacts', workspaceId, options);
}

export function listCompanies(
  client: SupabaseClient,
  workspaceId: string,
  options: CrmListOptions = {},
): Promise<CrmPage<CrmCompany>> {
  return searchPage<CrmCompany>(client, 'search_workspace_companies', workspaceId, options);
}

export async function listAllContacts(
  client: SupabaseClient,
  workspaceId: string,
  search = '',
): Promise<CrmContact[]> {
  const rows: CrmContact[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await listContacts(client, workspaceId, { search, page, pageSize: 100 });
    rows.push(...result.items);
    total = result.total;
    page += 1;
  } while (rows.length < total && page <= 500);
  if (rows.length < total) throw new CrmDataError('There are too many results to export at once. Narrow the search and try again.');
  return rows;
}

export async function listAllCompanies(
  client: SupabaseClient,
  workspaceId: string,
  search = '',
): Promise<CrmCompany[]> {
  const rows: CrmCompany[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await listCompanies(client, workspaceId, { search, page, pageSize: 100 });
    rows.push(...result.items);
    total = result.total;
    page += 1;
  } while (rows.length < total && page <= 500);
  if (rows.length < total) throw new CrmDataError('There are too many results to export at once. Narrow the search and try again.');
  return rows;
}

export async function listTags(client: SupabaseClient, workspaceId: string): Promise<CrmTag[]> {
  requireWorkspace(workspaceId);
  const { data, error } = await client
    .from('tags')
    .select('id, workspace_id, name, color')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });
  if (error) throw friendlyCrmError(error);
  return (data ?? []) as CrmTag[];
}

export async function createTag(
  client: SupabaseClient,
  workspaceId: string,
  name: string,
  color = '#7C8B68',
): Promise<CrmTag> {
  requireWorkspace(workspaceId);
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 40) {
    throw new CrmDataError('Tag names must be between 1 and 40 characters.', '22023');
  }
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new CrmDataError('Choose a valid tag color.', '22023');
  const { data, error } = await client
    .from('tags')
    .insert({ workspace_id: workspaceId, name: normalizedName, color })
    .select('id, workspace_id, name, color')
    .single();
  if (error) throw friendlyCrmError(error);
  return data as CrmTag;
}

export async function updateTag(
  client: SupabaseClient,
  workspaceId: string,
  tagId: string,
  name: string,
  color: string,
): Promise<CrmTag> {
  requireWorkspace(workspaceId);
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 40) {
    throw new CrmDataError('Tag names must be between 1 and 40 characters.', '22023');
  }
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new CrmDataError('Choose a valid tag color.', '22023');
  const { data, error } = await client
    .from('tags')
    .update({ name: normalizedName, color })
    .eq('workspace_id', workspaceId)
    .eq('id', tagId)
    .select('id, workspace_id, name, color')
    .maybeSingle();
  if (error) throw friendlyCrmError(error);
  if (!data) throw new CrmDataError('Tag not found or you do not have permission to update it.', '42501');
  return data as CrmTag;
}

export async function deleteTag(client: SupabaseClient, workspaceId: string, tagId: string): Promise<void> {
  requireWorkspace(workspaceId);
  const { data, error } = await client
    .from('tags')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', tagId)
    .select('id')
    .maybeSingle();
  if (error) throw friendlyCrmError(error);
  if (!data) throw new CrmDataError('Tag not found or you do not have permission to delete it.', '42501');
}

export async function getContact(
  client: SupabaseClient,
  workspaceId: string,
  contactId: string,
): Promise<CrmContact | null> {
  requireWorkspace(workspaceId);
  const { data, error } = await client
    .from('contacts')
    .select('id, workspace_id, company_id, first_name, last_name, email, phone, job_title, notes, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('id', contactId)
    .maybeSingle();
  if (error) throw friendlyCrmError(error);
  if (!data) return null;

  const [companyResult, linksResult] = await Promise.all([
    data.company_id
      ? client.from('companies').select('id, name').eq('workspace_id', workspaceId).eq('id', data.company_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client.from('contact_tags').select('tag_id').eq('workspace_id', workspaceId).eq('contact_id', contactId),
  ]);
  if (companyResult.error) throw friendlyCrmError(companyResult.error);
  if (linksResult.error) throw friendlyCrmError(linksResult.error);
  const tagIds = (linksResult.data ?? []).map((link: { tag_id: string }) => link.tag_id);
  let tags: CrmTag[] = [];
  if (tagIds.length) {
    const { data: tagRows, error: tagError } = await client
      .from('tags')
      .select('id, workspace_id, name, color')
      .eq('workspace_id', workspaceId)
      .in('id', tagIds);
    if (tagError) throw friendlyCrmError(tagError);
    tags = (tagRows ?? []) as CrmTag[];
  }
  return {
    ...data,
    email: data.email ?? null,
    phone: data.phone ?? null,
    job_title: data.job_title ?? null,
    notes: data.notes ?? null,
    company_id: data.company_id,
    company: companyResult.data,
    tags,
  } as CrmContact;
}

export async function saveContact(
  client: SupabaseClient,
  workspaceId: string,
  input: ContactInput,
  contactId: string | null = null,
): Promise<string> {
  requireWorkspace(workspaceId);
  const validation = validateContactInput(input);
  if (!validation.ok) throw new CrmDataError(Object.values(validation.errors).join(' '), '22023');
  const { data, error } = await client.rpc('save_workspace_contact', {
    p_workspace_id: workspaceId,
    p_contact_id: contactId,
    p_values: validation.value,
  });
  if (error) throw friendlyCrmError(error);
  if (typeof data !== 'string') throw new CrmDataError('The contact could not be saved.');
  return data;
}

export async function deleteContact(client: SupabaseClient, workspaceId: string, contactId: string): Promise<void> {
  requireWorkspace(workspaceId);
  const { data, error } = await client
    .from('contacts')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', contactId)
    .select('id')
    .maybeSingle();
  if (error) throw friendlyCrmError(error);
  if (!data) throw new CrmDataError('Contact not found or you do not have permission to delete it.', '42501');
}

export async function saveCompany(
  client: SupabaseClient,
  workspaceId: string,
  input: CompanyInput,
  companyId: string | null = null,
): Promise<string> {
  requireWorkspace(workspaceId);
  const validation = validateCompanyInput(input);
  if (!validation.ok) throw new CrmDataError(Object.values(validation.errors).join(' '), '22023');
  const { data, error } = await client.rpc('save_workspace_company', {
    p_workspace_id: workspaceId,
    p_company_id: companyId,
    p_values: validation.value,
  });
  if (error) throw friendlyCrmError(error);
  if (typeof data !== 'string') throw new CrmDataError('The company could not be saved.');
  return data;
}

export async function deleteCompany(client: SupabaseClient, workspaceId: string, companyId: string): Promise<void> {
  requireWorkspace(workspaceId);
  const { data, error } = await client
    .from('companies')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', companyId)
    .select('id')
    .maybeSingle();
  if (error) throw friendlyCrmError(error);
  if (!data) throw new CrmDataError('Company not found or you do not have permission to delete it.', '42501');
}

function resolveTags(names: string[], tags: CrmTag[], row: number, issues: { row: number; field: string; message: string }[]) {
  const byName = new Map(tags.map((tag) => [tag.name.trim().toLocaleLowerCase('en-US'), tag.id]));
  const ids: string[] = [];
  for (const name of names) {
    const id = byName.get(name.trim().toLocaleLowerCase('en-US'));
    if (!id) issues.push({ row, field: 'tags', message: `Tag “${name}” does not exist in this workspace.` });
    else ids.push(id);
  }
  return [...new Set(ids)];
}

export async function importContactsCsv(client: SupabaseClient, workspaceId: string, csvText: string): Promise<number> {
  requireWorkspace(workspaceId);
  const sourceRows = parseContactsCsv(csvText);
  const [companies, tags] = await Promise.all([
    listAllCompanies(client, workspaceId),
    listTags(client, workspaceId),
  ]);
  const companyIds = new Map(companies.map((company) => [company.name.trim().toLocaleLowerCase('en-US'), company.id]));
  const issues: { row: number; field: string; message: string }[] = [];
  const rows = sourceRows.map((row: ContactCsvRow, index) => {
    const company_id = row.company_name
      ? companyIds.get(row.company_name.trim().toLocaleLowerCase('en-US')) ?? null
      : null;
    if (row.company_name && !company_id) {
      issues.push({ row: index + 2, field: 'company_name', message: `Company “${row.company_name}” was not found in this workspace.` });
    }
    const tag_ids = resolveTags(row.tag_names, tags, index + 2, issues);
    return {
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      job_title: row.job_title,
      company_id,
      notes: row.notes,
      tag_ids,
    };
  });
  if (issues.length) throw new CsvValidationError(issues);
  const { data, error } = await client.rpc('import_workspace_contacts', {
    p_workspace_id: workspaceId,
    p_rows: rows,
  });
  if (error) throw friendlyCrmError(error);
  return Number(data ?? 0);
}

export async function importCompaniesCsv(client: SupabaseClient, workspaceId: string, csvText: string): Promise<number> {
  requireWorkspace(workspaceId);
  const sourceRows = parseCompaniesCsv(csvText);
  const tags = await listTags(client, workspaceId);
  const issues: { row: number; field: string; message: string }[] = [];
  const rows = sourceRows.map((row: CompanyCsvRow, index) => ({
    name: row.name,
    domain: row.domain,
    phone: row.phone,
    notes: row.notes,
    tag_ids: resolveTags(row.tag_names, tags, index + 2, issues),
  }));
  if (issues.length) throw new CsvValidationError(issues);
  const { data, error } = await client.rpc('import_workspace_companies', {
    p_workspace_id: workspaceId,
    p_rows: rows,
  });
  if (error) throw friendlyCrmError(error);
  return Number(data ?? 0);
}
