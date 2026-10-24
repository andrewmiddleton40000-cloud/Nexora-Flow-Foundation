import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, Building2, Check, ChevronLeft, ChevronRight, ContactRound, Download, FileUp, LoaderCircle, Pencil, Plus, Search, Tag, Trash2, UserRound, X } from 'lucide-react';
import type { CompanyInput, ContactInput, CrmCompany, CrmContact, CrmPage, CrmTag, CsvIssue } from '@/lib/crm-types';
import { createTag, deleteCompany, deleteContact, deleteTag, getContact, importCompaniesCsv, importContactsCsv, listAllCompanies, listAllContacts, listCompanies, listContacts, listTags, saveCompany, saveContact, updateTag } from '@/lib/crm-data';
import { CsvValidationError, serializeCsv } from '@/lib/crm-csv';
import { companyExportRows, contactExportRows, validateCompanyInput, validateContactInput } from '@/lib/crm-validation';

type Props = { client: SupabaseClient; workspaceId: string; role: string };
type Entity = 'contacts' | 'companies';
const PAGE_SIZE = 12;
const canManage = (role: string) => role === 'owner' || role === 'admin';
const canWrite = (role: string) => canManage(role) || role === 'member';
const initials = (contact: CrmContact) => `${contact.first_name.slice(0, 1)}${contact.last_name.slice(0, 1)}`.toUpperCase();

function TagPills({ tags }: { tags: CrmTag[] }) {
  if (!tags.length) return <span className="text-xs text-[#92998d]">—</span>;
  return <div className="flex flex-wrap gap-1.5">{tags.slice(0, 3).map(tag => <span key={tag.id} className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ backgroundColor: `${tag.color}20`, color: tag.color }}>{tag.name}</span>)}{tags.length > 3 && <span className="text-[10px] text-[#7f877a]">+{tags.length - 3}</span>}</div>;
}

function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  const styles = tone === 'success' ? 'border-[#d9e7c5] bg-[#f3f8e9] text-[#526b35]' : tone === 'info' ? 'border-[#e5e7df] bg-[#f7f8f3] text-[#65705f]' : 'border-[#efcbc4] bg-[#fff5f2] text-[#98493e]';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm leading-5 ${styles}`}>{children}</div>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#202822]/35 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="crm-modal-title" className="relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-[24px] border border-[#e4e6dc] bg-white p-5 shadow-[0_24px_80px_-32px_rgba(32,40,34,.3)] sm:p-7">
      <button type="button" onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl text-[#717a6d] hover:bg-[#f2f3ed]"><X size={17}/></button>
      <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#8a947f]">Nexora Flow</p><h2 id="crm-modal-title" className="display-font mt-2 pr-9 text-2xl font-semibold tracking-[-.05em] text-[#273128]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#778073]">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  </div>;
}

const fieldClass = 'mt-1.5 h-11 w-full rounded-xl border border-[#dfe2d8] bg-[#fdfdfa] px-3.5 text-sm text-[#303a30] placeholder:text-[#a1a79d] outline-none transition focus:border-[#9fbf59] focus:ring-4 focus:ring-[#c8f05b]/20';
const areaClass = 'mt-1.5 min-h-24 w-full resize-y rounded-xl border border-[#dfe2d8] bg-[#fdfdfa] px-3.5 py-3 text-sm text-[#303a30] placeholder:text-[#a1a79d] outline-none transition focus:border-[#9fbf59] focus:ring-4 focus:ring-[#c8f05b]/20';
function TextField({ label, value, onChange, type = 'text', required = false, error }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; error?: string }) {
  return <label className="block text-xs font-bold text-[#566052]">{label}{required && <span className="ml-1 text-[#82945d]">Required</span>}<input className={fieldClass} type={type} value={value} required={required} onChange={e => onChange(e.target.value)} aria-invalid={!!error} />{error && <span className="mt-1 block text-xs font-medium text-[#a7473b]">{error}</span>}</label>;
}
function TagPicker({ tags, selected, onChange }: { tags: CrmTag[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset><legend className="mb-2 text-xs font-bold text-[#566052]">Tags</legend><div className="flex flex-wrap gap-2">{tags.length ? tags.map(tag => <label key={tag.id} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${selected.includes(tag.id) ? 'border-[#b5cc83] bg-[#f0f6e3] text-[#46583a]' : 'border-[#e4e6dc] bg-white text-[#687264] hover:bg-[#f8f9f4]'}`}><input className="sr-only" type="checkbox" checked={selected.includes(tag.id)} onChange={() => onChange(selected.includes(tag.id) ? selected.filter(id => id !== tag.id) : [...selected, tag.id])} />{selected.includes(tag.id) && <Check size={13}/ >}{tag.name}</label>) : <span className="text-xs text-[#8b9286]">No tags in this workspace yet.</span>}</div></fieldset>;
}

function TagManager({ client, workspaceId, role, tags, onClose }: Props & { tags: CrmTag[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CrmTag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#7C8B68');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim();
      if (!cleanName || cleanName.length > 40) throw new Error('Tag names must be between 1 and 40 characters.');
      return editing
        ? updateTag(client, workspaceId, editing.id, cleanName, color)
        : createTag(client, workspaceId, cleanName, color);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['crm', workspaceId] });
      setNotice(editing ? 'Tag updated.' : 'Tag created.');
      setName('');
      setColor('#7C8B68');
      setEditing(null);
      setError('');
    },
    onError: err => setError(err instanceof Error ? err.message : 'We could not save this tag.'),
  });
  const removal = useMutation({
    mutationFn: (tagId: string) => deleteTag(client, workspaceId, tagId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['crm', workspaceId] });
      setNotice('Tag deleted.');
      setError('');
    },
    onError: err => setError(err instanceof Error ? err.message : 'We could not delete this tag.'),
  });
  const beginEdit = (tag: CrmTag) => {
    setEditing(tag);
    setName(tag.name);
    setColor(tag.color);
    setError('');
    setNotice('');
  };
  const cancelEdit = () => {
    setEditing(null);
    setName('');
    setColor('#7C8B68');
    setError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    setError('');
    save.mutate();
  };
  const mayDelete = canManage(role);
  return <Modal title="Manage tags" description="Create useful labels, or adjust an existing tag’s name and color." onClose={onClose}>
    <form onSubmit={submit} className="rounded-2xl border border-[#e8eadf] bg-[#fafbf7] p-4">
      <p className="mb-3 text-xs font-bold text-[#566052]">{editing ? 'Edit tag' : 'Create a tag'}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-bold text-[#566052]">Tag name
          <input autoFocus className={fieldClass} maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Long-term client" required />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-[#566052]">Color
          <input aria-label="Tag color" type="color" className="h-11 w-12 cursor-pointer rounded-xl border border-[#dfe2d8] bg-white p-1" value={color} onChange={event => setColor(event.target.value)} />
        </label>
        <button disabled={save.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#c8f05b] px-4 text-sm font-bold text-[#202822] hover:bg-[#b9e548] disabled:opacity-60">{save.isPending && <LoaderCircle size={15} className="animate-spin" />}{editing ? 'Save tag' : 'Create tag'}</button>
        {editing && <button type="button" onClick={cancelEdit} className="h-11 rounded-xl px-3 text-sm font-semibold text-[#687264] hover:bg-[#eff0e9]">Cancel</button>}
      </div>
    </form>
    {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    {notice && <div className="mt-3"><Alert tone="success">{notice}</Alert></div>}
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold text-[#566052]">Workspace tags</h3><span className="text-[11px] text-[#92998d]">{tags.length} total</span></div>
      {tags.length ? <ul className="divide-y divide-[#eff0eb] rounded-xl border border-[#e8eadf] bg-white">{tags.map(tag => <li key={tag.id} className="flex items-center gap-3 px-3 py-3">
        <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: tag.color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#424d3e]">{tag.name}</span>
        <button onClick={() => beginEdit(tag)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#64715c] hover:bg-[#f2f4ec]" aria-label={`Rename or recolor ${tag.name}`}><Pencil size={13} />Edit</button>
        {mayDelete && <button disabled={removal.isPending} onClick={() => { if (window.confirm(`Delete the “${tag.name}” tag?`)) removal.mutate(tag.id); }} className="grid h-9 w-9 place-items-center rounded-lg text-[#9a675f] hover:bg-[#fff0ed] disabled:opacity-50" aria-label={`Delete ${tag.name}`}>{removal.isPending && removal.variables === tag.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button>}
      </li>)}</ul> : <div className="rounded-xl border border-dashed border-[#dfe2d8] bg-[#fbfbf8] px-4 py-6 text-center"><Tag size={18} className="mx-auto text-[#82906e]" /><p className="mt-2 text-xs text-[#7c8578]">No tags yet. Create one above to start organizing records.</p></div>}
      {!mayDelete && tags.length > 0 && <p className="mt-2 text-[11px] leading-5 text-[#8a9286]">Only workspace owners and admins can delete tags.</p>}
    </div>
  </Modal>;
}

function ContactForm({ client, workspaceId, contact, companies, tags, onSaved, onCancel }: Props & { contact?: CrmContact; companies: CrmCompany[]; tags: CrmTag[]; onSaved: () => void; onCancel: () => void }) {
  const qc = useQueryClient(); const [first, setFirst] = useState(contact?.first_name ?? ''); const [last, setLast] = useState(contact?.last_name ?? '');
  const [email, setEmail] = useState(contact?.email ?? ''); const [phone, setPhone] = useState(contact?.phone ?? ''); const [job, setJob] = useState(contact?.job_title ?? '');
  const [company, setCompany] = useState(contact?.company_id ?? ''); const [notes, setNotes] = useState(contact?.notes ?? ''); const [tagIds, setTagIds] = useState(contact?.tags.map(t => t.id) ?? []);
  const [error, setError] = useState(''); const [duplicate, setDuplicate] = useState(false);
  const mutation = useMutation({ mutationFn: async (input: ContactInput) => saveContact(client, workspaceId, input, contact?.id ?? null), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['crm', workspaceId] }); onSaved(); } });
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); setDuplicate(false); const result = validateContactInput({ first_name: first, last_name: last, email, phone, job_title: job, company_id: company || null, notes, tag_ids: tagIds }); if (!result.ok) { setError(Object.values(result.errors).join(' ')); return; } mutation.mutate(result.value, { onError: err => { const message = err instanceof Error ? err.message : 'Unable to save this contact.'; setError(message); setDuplicate(/already exists|duplicate/i.test(message)); } }); };
  return <form onSubmit={submit} className="space-y-4">
    {error && <Alert>{duplicate ? `Possible duplicate: ${error}` : error}</Alert>}
    <div className="grid gap-4 sm:grid-cols-2"><TextField label="First name" required value={first} onChange={setFirst}/><TextField label="Last name" required value={last} onChange={setLast}/></div>
    <div className="grid gap-4 sm:grid-cols-2"><TextField label="Email" type="email" value={email} onChange={setEmail}/><TextField label="Phone" value={phone} onChange={setPhone}/></div>
    <div className="grid gap-4 sm:grid-cols-2"><TextField label="Job title" value={job} onChange={setJob}/><label className="block text-xs font-bold text-[#566052]">Company<select className={fieldClass} value={company} onChange={e => setCompany(e.target.value)}><option value="">No company</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
    <label className="block text-xs font-bold text-[#566052]">Notes<textarea className={areaClass} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Useful context for your next conversation"/></label>
    <TagPicker tags={tags} selected={tagIds} onChange={setTagIds}/>
    <div className="flex justify-end gap-2 border-t border-[#eff0eb] pt-4"><button type="button" onClick={onCancel} className="h-10 rounded-xl px-4 text-sm font-semibold text-[#687264] hover:bg-[#f4f5ef]">Cancel</button><button disabled={mutation.isPending} className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-xl bg-[#c8f05b] px-4 text-sm font-bold text-[#202822] hover:bg-[#b9e548] disabled:opacity-60">{mutation.isPending && <LoaderCircle size={15} className="animate-spin"/>}{contact ? 'Save changes' : 'Add contact'}</button></div>
  </form>;
}

function CompanyForm({ client, workspaceId, company, tags, onSaved, onCancel }: Props & { company?: CrmCompany; tags: CrmTag[]; onSaved: () => void; onCancel: () => void }) {
  const qc = useQueryClient(); const [name, setName] = useState(company?.name ?? ''); const [domain, setDomain] = useState(company?.domain ?? '');
  const [phone, setPhone] = useState(company?.phone ?? ''); const [notes, setNotes] = useState(company?.notes ?? ''); const [tagIds, setTagIds] = useState(company?.tags.map(t => t.id) ?? []);
  const [error, setError] = useState(''); const [duplicate, setDuplicate] = useState(false);
  const mutation = useMutation({ mutationFn: async (input: CompanyInput) => saveCompany(client, workspaceId, input, company?.id ?? null), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['crm', workspaceId] }); onSaved(); } });
  const submit = (e: FormEvent) => { e.preventDefault(); setError(''); const result = validateCompanyInput({ name, domain, phone, notes, tag_ids: tagIds }); if (!result.ok) { setError(Object.values(result.errors).join(' ')); return; } mutation.mutate(result.value, { onError: err => { const message = err instanceof Error ? err.message : 'Unable to save this company.'; setError(message); setDuplicate(/already exists|duplicate/i.test(message)); } }); };
  return <form onSubmit={submit} className="space-y-4">
    {error && <Alert>{duplicate ? `Possible duplicate: ${error}` : error}</Alert>}
    <TextField label="Company name" required value={name} onChange={setName}/><div className="grid gap-4 sm:grid-cols-2"><TextField label="Website domain" value={domain} onChange={setDomain}/><TextField label="Phone" value={phone} onChange={setPhone}/></div>
    <label className="block text-xs font-bold text-[#566052]">Notes<textarea className={areaClass} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Context about this company"/></label>
    <TagPicker tags={tags} selected={tagIds} onChange={setTagIds}/>
    <div className="flex justify-end gap-2 border-t border-[#eff0eb] pt-4"><button type="button" onClick={onCancel} className="h-10 rounded-xl px-4 text-sm font-semibold text-[#687264] hover:bg-[#f4f5ef]">Cancel</button><button disabled={mutation.isPending} className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-xl bg-[#c8f05b] px-4 text-sm font-bold text-[#202822] hover:bg-[#b9e548] disabled:opacity-60">{mutation.isPending && <LoaderCircle size={15} className="animate-spin"/>}{company ? 'Save changes' : 'Add company'}</button></div>
  </form>;
}

function useTags(client: SupabaseClient, workspaceId: string) {
  return useQuery({ queryKey: ['crm', workspaceId, 'tags'], queryFn: () => listTags(client, workspaceId), enabled: !!workspaceId, staleTime: 30_000 });
}
function useList<T>(kind: Entity, client: SupabaseClient, workspaceId: string, search: string, tagId: string, page: number) {
  return useQuery<CrmPage<CrmContact | CrmCompany>>({ queryKey: ['crm', workspaceId, kind, { search, tagId, page, pageSize: PAGE_SIZE }], queryFn: async () => kind === 'contacts' ? await listContacts(client, workspaceId, { search, tagId: tagId || null, page, pageSize: PAGE_SIZE }) as CrmPage<CrmContact | CrmCompany> : await listCompanies(client, workspaceId, { search, tagId: tagId || null, page, pageSize: PAGE_SIZE }) as CrmPage<CrmContact | CrmCompany>, enabled: !!workspaceId, staleTime: 20_000 });
}

function CrmListPage({ kind, client, workspaceId, role }: Props & { kind: Entity }) {
  const isContacts = kind === 'contacts'; const title = isContacts ? 'Contacts' : 'Companies'; const [search, setSearch] = useState(''); const [tagId, setTagId] = useState('');
  const [page, setPage] = useState(1); const [dialog, setDialog] = useState(false); const [tagDialog, setTagDialog] = useState(false); const [editing, setEditing] = useState<CrmContact | CrmCompany>(); const [notice, setNotice] = useState(''); const [csvIssues, setCsvIssues] = useState<CsvIssue[] | null>(null);
  const qc = useQueryClient(); const tagsQuery = useTags(client, workspaceId);
  const debouncedSearch = useDebounced(search); const listQuery = useList(kind, client, workspaceId, debouncedSearch, tagId, page);
  const companiesQuery = useQuery({ queryKey: ['crm', workspaceId, 'company-options'], queryFn: () => listAllCompanies(client, workspaceId), enabled: isContacts && !!workspaceId, staleTime: 30_000 });
  const canEdit = canWrite(role);
  const canDelete = canManage(role);
  const removal = useMutation({ mutationFn: async (id: string) => isContacts ? deleteContact(client, workspaceId, id) : deleteCompany(client, workspaceId, id), onSuccess: async () => { setNotice(`${isContacts ? 'Contact' : 'Company'} deleted.`); await qc.invalidateQueries({ queryKey: ['crm', workspaceId] }); }, onError: error => setNotice(error instanceof Error ? error.message : `Unable to delete this ${isContacts ? 'contact' : 'company'}.`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['crm', workspaceId] }); };
  const changeFile = async (file?: File) => { if (!file) return; setNotice(''); setCsvIssues(null); try { const text = await file.text(); const count = isContacts ? await importContactsCsv(client, workspaceId, text) : await importCompaniesCsv(client, workspaceId, text); setNotice(`${count} ${isContacts ? 'contact' : 'company'}${count === 1 ? '' : 's'} imported.`); refresh(); } catch (e) { if (e instanceof CsvValidationError) setCsvIssues(e.issues); else setNotice(e instanceof Error ? e.message : 'We could not import this file.'); } };
  const exportData = async () => { setNotice(''); try { const rows = isContacts ? contactExportRows(await listAllContacts(client, workspaceId)) : companyExportRows(await listAllCompanies(client, workspaceId)); if (!rows.length) { setNotice(`There are no ${kind} to export yet.`); return; } const headers = Object.keys(rows[0]); const csv = serializeCsv(headers, rows); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `nexora-${kind}.csv`; anchor.click(); URL.revokeObjectURL(url); setNotice(`${rows.length} ${kind} exported.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Export failed.'); } };
  const items = listQuery.data?.items ?? []; const total = listQuery.data?.total ?? 0; const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <div className="page-enter">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#839078]">Relationships</p><h1 className="display-font mt-2 text-[34px] font-semibold leading-tight tracking-[-.06em] text-[#273128] sm:text-[42px]">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#778073]">{isContacts ? 'Keep customer context close, so the next conversation feels natural.' : 'A clear home for the businesses connected to your work.'}</p></div>
      <div className="flex flex-wrap gap-2">{canEdit && <><label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#dfe2d8] bg-white px-3.5 text-xs font-bold text-[#586353] transition hover:bg-[#f7f8f2]" title={`Import ${kind} from CSV`}><FileUp size={15}/>Import CSV<input className="sr-only" type="file" accept=".csv,text/csv" onChange={e => { void changeFile(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label><button onClick={() => setTagDialog(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dfe2d8] bg-white px-3.5 text-xs font-bold text-[#586353] hover:bg-[#f7f8f2]"><Tag size={15}/>Manage tags</button></>}<button onClick={() => void exportData()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dfe2d8] bg-white px-3.5 text-xs font-bold text-[#586353] hover:bg-[#f7f8f2]"><Download size={15}/>Export</button>{canEdit && <button onClick={() => { setEditing(undefined); setDialog(true); }} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#c8f05b] px-4 text-sm font-bold text-[#202822] transition hover:bg-[#b9e548]"><Plus size={16}/>{isContacts ? 'Add contact' : 'Add company'}</button>}</div>
    </div>
    {notice && <div className="mt-5"><Alert tone={/failed|could not|unable|no .* to export|permission|not found/i.test(notice) ? 'error' : 'success'}>{notice}</Alert></div>}
    {csvIssues && <div className="mt-4 rounded-2xl border border-[#e8d6a8] bg-[#fffaf0] p-4 text-sm text-[#685733]"><div className="flex items-center justify-between gap-3"><p className="font-bold">We found issues in this CSV</p><button aria-label="Dismiss CSV issues" className="rounded-lg p-1 hover:bg-[#f8f0dc]" onClick={() => setCsvIssues(null)}><X size={15}/></button></div><ul className="mt-2 max-h-36 list-inside list-disc space-y-1 overflow-auto text-xs leading-5">{csvIssues.slice(0, 8).map((issue, i) => <li key={`${issue.row}-${issue.field}-${i}`}>Row {issue.row}, {issue.field}: {issue.message}</li>)}</ul>{csvIssues.length > 8 && <p className="mt-2 text-xs">And {csvIssues.length - 8} more issues.</p>}</div>}
    <section className="mt-7 rounded-[22px] border border-[#e3e5dc] bg-white shadow-[0_12px_36px_-30px_rgba(36,50,31,.25)]">
      <div className="flex flex-col gap-3 border-b border-[#eceee7] p-4 sm:flex-row sm:items-center">
        <label className="relative flex-1"><span className="sr-only">Search {kind}</span><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#929a8d]"/><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} type="search" placeholder={`Search ${kind}…`} className="h-11 w-full rounded-xl border border-[#e4e6dc] bg-[#fbfbf8] pl-10 pr-4 text-sm outline-none placeholder:text-[#9ba296] focus:border-[#a8c66c] focus:ring-4 focus:ring-[#c8f05b]/20" data-testid={`input-search-${kind}`}/></label>
        <label className="text-xs font-semibold text-[#6c7568]"><span className="sr-only">Filter by tag</span><select aria-label="Filter by tag" value={tagId} onChange={e => { setTagId(e.target.value); setPage(1); }} className="h-11 min-w-40 rounded-xl border border-[#e4e6dc] bg-white px-3 text-sm text-[#52604d] outline-none focus:border-[#a8c66c] focus:ring-4 focus:ring-[#c8f05b]/20"><option value="">All tags</option>{(tagsQuery.data ?? []).map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
      </div>
      {listQuery.isLoading ? <div className="space-y-3 p-5" aria-label={`Loading ${kind}`}><div className="h-10 animate-pulse rounded-xl bg-[#f1f2ec]"/><div className="h-14 animate-pulse rounded-xl bg-[#f5f6f1]"/><div className="h-14 animate-pulse rounded-xl bg-[#f5f6f1]"/></div>
        : listQuery.isError ? <div className="p-8"><Alert>{listQuery.error instanceof Error ? listQuery.error.message : `We could not load ${kind}.`}</Alert><button onClick={() => void listQuery.refetch()} className="mt-4 rounded-xl bg-[#f0f3e8] px-4 py-2.5 text-sm font-bold text-[#43513b]">Try again</button></div>
        : items.length === 0 ? <div className="grid min-h-64 place-items-center px-5 py-10 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#eff4e4] text-[#687952]">{isContacts ? <ContactRound size={21}/> : <Building2 size={21}/>}</span><h2 className="display-font mt-4 text-lg font-semibold text-[#354035]">{search || tagId ? 'No matches found' : `No ${kind} yet`}</h2><p className="mt-1.5 max-w-sm text-sm leading-6 text-[#7b8378]">{search || tagId ? 'Try another search or remove the tag filter.' : `Add your first ${isContacts ? 'contact' : 'company'} to keep the relationship details together.`}</p>{canEdit && !search && !tagId && <button onClick={() => setDialog(true)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#c8f05b] px-4 text-sm font-bold"><Plus size={15}/>Add {isContacts ? 'contact' : 'company'}</button>}</div></div>
        : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-[#eff0eb] text-[10px] font-bold uppercase tracking-[.12em] text-[#91998d]"><th className="px-5 py-3.5">{isContacts ? 'Contact' : 'Company'}</th><th className="px-4 py-3.5">{isContacts ? 'Company / role' : 'Website'}</th><th className="px-4 py-3.5">{isContacts ? 'Email' : 'Contacts'}</th><th className="px-4 py-3.5">Tags</th><th className="px-5 py-3.5 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#f0f1ec]">{items.map(item => isContacts ? <ContactRow key={item.id} contact={item as CrmContact} canEdit={canEdit} canDelete={canDelete} onEdit={() => { setEditing(item as CrmContact); setDialog(true); }} onDelete={() => { if (window.confirm(`Delete ${(item as CrmContact).first_name} ${(item as CrmContact).last_name}? This cannot be undone.`)) removal.mutate(item.id); }} deleting={removal.isPending && removal.variables === item.id}/> : <CompanyRow key={item.id} company={item as CrmCompany} canEdit={canEdit} canDelete={canDelete} onEdit={() => { setEditing(item as CrmCompany); setDialog(true); }} onDelete={() => { if (window.confirm(`Delete ${(item as CrmCompany).name}? This cannot be undone.`)) removal.mutate(item.id); }} deleting={removal.isPending && removal.variables === item.id}/>)}</tbody></table></div>}
      {!listQuery.isLoading && !listQuery.isError && total > 0 && <div className="flex flex-col gap-3 border-t border-[#eceee7] px-5 py-4 text-xs text-[#858d80] sm:flex-row sm:items-center sm:justify-between"><span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e3e5dc] px-3 font-semibold text-[#5d6958] hover:bg-[#f7f8f2] disabled:opacity-40"><ChevronLeft size={15}/>Previous</button><span className="px-1">Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e3e5dc] px-3 font-semibold text-[#5d6958] hover:bg-[#f7f8f2] disabled:opacity-40">Next<ChevronRight size={15}/></button></div></div>}
    </section>
    {dialog && <Modal title={`${editing ? 'Edit' : 'Add'} ${isContacts ? 'contact' : 'company'}`} description={isContacts ? 'Keep the details that make your next conversation easier.' : 'Keep the company context connected to your customer relationships.'} onClose={() => setDialog(false)}>{isContacts ? <ContactForm {...{ client, workspaceId, role }} contact={editing as CrmContact | undefined} companies={companiesQuery.data ?? []} tags={tagsQuery.data ?? []} onSaved={() => { setDialog(false); setNotice('Contact saved.'); }} onCancel={() => setDialog(false)}/> : <CompanyForm {...{ client, workspaceId, role }} company={editing as CrmCompany | undefined} tags={tagsQuery.data ?? []} onSaved={() => { setDialog(false); setNotice('Company saved.'); }} onCancel={() => setDialog(false)}/>}</Modal>}
    {tagDialog && <TagManager client={client} workspaceId={workspaceId} role={role} tags={tagsQuery.data ?? []} onClose={() => setTagDialog(false)} />}
  </div>;
}

function ContactRow({ contact, canEdit, canDelete, onEdit, onDelete, deleting }: { contact: CrmContact; canEdit: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return <tr className="group transition hover:bg-[#fbfcf8]"><td className="px-5 py-4"><Link href={`/app/contacts/${contact.id}`} className="flex items-center gap-3 rounded-md focus-visible:outline-none"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf2e2] text-xs font-bold text-[#566747]">{initials(contact)}</span><span><span className="block text-sm font-bold text-[#354035] group-hover:text-[#52683a]">{contact.first_name} {contact.last_name}</span><span className="mt-0.5 block text-xs text-[#8a9286]">{contact.job_title || 'Contact'}</span></span></Link></td><td className="px-4 py-4 text-sm text-[#606b5c]">{contact.company?.name ?? '—'}</td><td className="px-4 py-4 text-sm text-[#667161]">{contact.email || contact.phone || '—'}</td><td className="px-4 py-4"><TagPills tags={contact.tags}/></td><td className="px-5 py-4"><div className="flex justify-end gap-1">{canEdit && <button onClick={onEdit} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-[#65715d] hover:bg-[#edf2e4]">Edit</button>}{canDelete && <button onClick={onDelete} disabled={deleting} aria-label={`Delete ${contact.first_name} ${contact.last_name}`} className="grid h-9 w-9 place-items-center rounded-lg text-[#9a675f] hover:bg-[#fff0ed] disabled:opacity-50">{deleting ? <LoaderCircle size={15} className="animate-spin"/> : <Trash2 size={15}/>}</button>}</div></td></tr>;
}
function CompanyRow({ company, canEdit, canDelete, onEdit, onDelete, deleting }: { company: CrmCompany; canEdit: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return <tr className="group transition hover:bg-[#fbfcf8]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f2f1e9] text-[#747457]"><Building2 size={18}/></span><span className="text-sm font-bold text-[#354035]">{company.name}</span></div></td><td className="px-4 py-4 text-sm text-[#667161]">{company.domain || company.phone || '—'}</td><td className="px-4 py-4 text-sm text-[#667161]">{company.contact_count} {company.contact_count === 1 ? 'contact' : 'contacts'}</td><td className="px-4 py-4"><TagPills tags={company.tags}/></td><td className="px-5 py-4"><div className="flex justify-end gap-1">{canEdit && <button onClick={onEdit} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-[#65715d] hover:bg-[#edf2e4]">Edit</button>}{canDelete && <button onClick={onDelete} disabled={deleting} aria-label={`Delete ${company.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-[#9a675f] hover:bg-[#fff0ed] disabled:opacity-50">{deleting ? <LoaderCircle size={15} className="animate-spin"/> : <Trash2 size={15}/>}</button>}</div></td></tr>;
}

function useDebounced(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setResult(value), 250); return () => window.clearTimeout(timer); }, [value]);
  return result;
}

function ContactDetail({ client, workspaceId, role, id }: Props & { id: string }) {
  const [, setLocation] = useLocation(); const qc = useQueryClient(); const [editing, setEditing] = useState(false); const [notice, setNotice] = useState('');
  const detail = useQuery({ queryKey: ['crm', workspaceId, 'contact', id], queryFn: () => getContact(client, workspaceId, id), enabled: !!workspaceId && !!id, staleTime: 15_000 });
  const tags = useTags(client, workspaceId); const companies = useQuery({ queryKey: ['crm', workspaceId, 'company-options'], queryFn: () => listAllCompanies(client, workspaceId), staleTime: 30_000 });
  const removal = useMutation({ mutationFn: () => deleteContact(client, workspaceId, id), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['crm', workspaceId] }); setLocation('/app/contacts'); }, onError: error => setNotice(error instanceof Error ? error.message : 'Unable to delete this contact.') });
  if (detail.isLoading) return <div className="space-y-4"><div className="h-8 w-24 animate-pulse rounded bg-[#e8eadf]"/><div className="h-24 animate-pulse rounded-2xl bg-white"/><div className="h-52 animate-pulse rounded-2xl bg-white"/></div>;
  if (detail.isError) return <div><Link href="/app/contacts" className="inline-flex items-center gap-2 text-sm font-semibold text-[#687464]"><ArrowLeft size={16}/>Contacts</Link><div className="mt-5"><Alert>{detail.error instanceof Error ? detail.error.message : 'Unable to load this contact.'}</Alert><button onClick={() => void detail.refetch()} className="mt-3 rounded-xl bg-[#eff3e5] px-4 py-2 text-sm font-bold">Try again</button></div></div>;
  const contact = detail.data;
  if (!contact) return <div><Link href="/app/contacts" className="inline-flex items-center gap-2 text-sm font-semibold text-[#687464]"><ArrowLeft size={16}/>Contacts</Link><div className="mt-6 rounded-[22px] border border-dashed border-[#d9ddd2] bg-white p-10 text-center"><UserRound size={24} className="mx-auto text-[#80906f]"/><h1 className="display-font mt-4 text-xl font-semibold">Contact not found</h1><p className="mt-2 text-sm text-[#778073]">This contact may have been removed or is no longer available in this workspace.</p></div></div>;
  return <div className="page-enter">
    <Link href="/app/contacts" className="inline-flex items-center gap-2 text-sm font-semibold text-[#687464] hover:text-[#354035]"><ArrowLeft size={16}/>Back to contacts</Link>
    {notice && <div className="mt-4"><Alert tone={/unable|permission|failed/i.test(notice) ? 'error' : 'success'}>{notice}</Alert></div>}
    <section className="mt-5 flex flex-col gap-5 rounded-[24px] border border-[#e3e5dc] bg-white p-5 sm:flex-row sm:items-center sm:p-7"><span className="grid h-16 w-16 place-items-center rounded-full bg-[#edf2e2] text-lg font-bold text-[#566747]">{initials(contact)}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#839078]">Customer profile</p><h1 className="display-font mt-1 text-3xl font-semibold tracking-[-.055em] text-[#273128]">{contact.first_name} {contact.last_name}</h1><p className="mt-1 text-sm text-[#788174]">{contact.job_title || 'Contact'}{contact.company ? ` at ${contact.company.name}` : ''}</p></div><div className="flex gap-2">{canWrite(role) && <button onClick={() => setEditing(true)} className="h-10 rounded-xl border border-[#dfe2d8] px-4 text-sm font-semibold text-[#576352] hover:bg-[#f6f7f2]">Edit contact</button>}{canManage(role) && <button disabled={removal.isPending} onClick={() => { if (window.confirm(`Delete ${contact.first_name} ${contact.last_name}? This cannot be undone.`)) removal.mutate(); }} className="h-10 rounded-xl px-3 text-sm font-semibold text-[#9a554b] hover:bg-[#fff1ee]">{removal.isPending ? 'Deleting…' : 'Delete'}</button>}</div></section>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-[22px] border border-[#e3e5dc] bg-white p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#899382]">Contact information</p><dl className="mt-4 divide-y divide-[#eff0eb]">{[['Email', contact.email], ['Phone', contact.phone], ['Job title', contact.job_title], ['Company', contact.company?.name]].map(([label, value]) => <div key={label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><dt className="text-xs text-[#858d80]">{label}</dt><dd className="text-sm font-semibold text-[#394338]">{value || 'Not provided'}</dd></div>)}</dl></section>
      <section className="rounded-[22px] border border-[#e3e5dc] bg-white p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#899382]">Tags</p><div className="mt-4"><TagPills tags={contact.tags}/></div><p className="mt-6 text-[10px] font-bold uppercase tracking-[.14em] text-[#899382]">Record</p><p className="mt-2 text-xs text-[#7d8678]">Added {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(contact.created_at))}</p><p className="mt-1 text-xs text-[#7d8678]">Updated {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(contact.updated_at))}</p></section>
      <section className="rounded-[22px] border border-[#e3e5dc] bg-white p-5 sm:col-span-2 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#899382]">Notes</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#5e685b]">{contact.notes || 'No notes have been added for this contact.'}</p></section>
    </div>
    {editing && <Modal title="Edit contact" description="Update the information your team keeps close." onClose={() => setEditing(false)}><ContactForm {...{ client, workspaceId, role }} contact={contact} companies={companies.data ?? []} tags={tags.data ?? []} onSaved={() => { setEditing(false); setNotice('Contact updated.'); void qc.invalidateQueries({ queryKey: ['crm', workspaceId, 'contact', id] }); }} onCancel={() => setEditing(false)}/></Modal>}
  </div>;
}

export function CrmRoute({ kind = 'contacts', id, ...props }: Props & { kind?: Entity; id?: string }) {
  return id ? <ContactDetail {...props} id={id}/> : <CrmListPage {...props} kind={kind}/>;
}
