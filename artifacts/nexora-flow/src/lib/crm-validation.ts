import type { CompanyInput, ContactInput, CrmContact, CrmCompany } from './crm-types';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const optional = (value: string | null | undefined, limit: number) => {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized.slice(0, limit) : null;
};

export function isValidDomain(value: string): boolean {
  return value.length <= 253
    && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(value);
}

export function validateContactInput(input: Partial<ContactInput>): ValidationResult<ContactInput> {
  const errors: Record<string, string> = {};
  const first_name = input.first_name?.trim() ?? '';
  const last_name = input.last_name?.trim() ?? '';
  const email = optional(input.email, 254)?.toLowerCase() ?? null;
  const phone = optional(input.phone, 40);
  const job_title = optional(input.job_title, 120);
  const notes = optional(input.notes, 10000);
  const tag_ids = [...new Set(input.tag_ids ?? [])];

  if (!first_name || first_name.length > 100) errors.first_name = 'Enter a first name under 100 characters.';
  if (!last_name || last_name.length > 100) errors.last_name = 'Enter a last name under 100 characters.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if ((input.phone?.trim().length ?? 0) > 40) errors.phone = 'Phone must be 40 characters or fewer.';
  if ((input.job_title?.trim().length ?? 0) > 120) errors.job_title = 'Job title must be 120 characters or fewer.';
  if ((input.notes?.trim().length ?? 0) > 10000) errors.notes = 'Notes must be 10,000 characters or fewer.';
  if (tag_ids.length > 25) errors.tag_ids = 'Choose no more than 25 tags.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      first_name,
      last_name,
      email,
      phone,
      job_title,
      company_id: input.company_id?.trim() || null,
      notes,
      tag_ids,
    },
  };
}

export function validateCompanyInput(input: Partial<CompanyInput>): ValidationResult<CompanyInput> {
  const errors: Record<string, string> = {};
  const name = input.name?.trim() ?? '';
  const domain = optional(input.domain, 253)?.toLowerCase() ?? null;
  const phone = optional(input.phone, 40);
  const notes = optional(input.notes, 10000);
  const tag_ids = [...new Set(input.tag_ids ?? [])];

  if (!name || name.length > 160) errors.name = 'Enter a company name under 160 characters.';
  if (domain && !isValidDomain(domain)) errors.domain = 'Enter a valid company domain.';
  if ((input.phone?.trim().length ?? 0) > 40) errors.phone = 'Phone must be 40 characters or fewer.';
  if ((input.notes?.trim().length ?? 0) > 10000) errors.notes = 'Notes must be 10,000 characters or fewer.';
  if (tag_ids.length > 25) errors.tag_ids = 'Choose no more than 25 tags.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, domain, phone, notes, tag_ids } };
}

export function duplicateContactEmails(rows: Array<{ email?: string | null }>): number[] {
  const firstRowByEmail = new Map<string, number>();
  const duplicates = new Set<number>();
  rows.forEach((row, index) => {
    const email = row.email?.trim().toLowerCase();
    if (!email) return;
    if (firstRowByEmail.has(email)) {
      duplicates.add(firstRowByEmail.get(email)!);
      duplicates.add(index);
    } else firstRowByEmail.set(email, index);
  });
  return [...duplicates].sort((a, b) => a - b);
}

export function duplicateCompanyKeys(rows: Array<{ name?: string; domain?: string | null }>): number[] {
  const firstRowByKey = new Map<string, number>();
  const duplicates = new Set<number>();
  rows.forEach((row, index) => {
    const name = row.name?.trim().normalize('NFKC').toLocaleLowerCase('en-US');
    const domain = row.domain?.trim().toLowerCase();
    const keys = [name && `name:${name}`, domain && `domain:${domain}`].filter(Boolean) as string[];
    for (const key of keys) {
      if (firstRowByKey.has(key)) {
        duplicates.add(firstRowByKey.get(key)!);
        duplicates.add(index);
      } else firstRowByKey.set(key, index);
    }
  });
  return [...duplicates].sort((a, b) => a - b);
}

export type EmptyCollection = { title: string; description: string };
export function collectionEmptyState(
  kind: 'contacts' | 'companies',
  itemCount: number,
  search: string,
): EmptyCollection | null {
  if (itemCount > 0) return null;
  if (search.trim()) {
    return {
      title: 'No matches found',
      description: `No ${kind} match “${search.trim()}”. Try a different search.`,
    };
  }
  if (kind === 'contacts') {
    return { title: 'No contacts yet', description: 'Add a contact or import a CSV to start building your customer list.' };
  }
  return { title: 'No companies yet', description: 'Add a company or import a CSV to organize your customer accounts.' };
}

export function contactExportRows(contacts: CrmContact[]) {
  return contacts.map((contact) => ({
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    job_title: contact.job_title ?? '',
    company_name: contact.company?.name ?? '',
    notes: contact.notes ?? '',
    tags: contact.tags.map((tag) => tag.name).join('; '),
    created_at: contact.created_at,
  }));
}

export function companyExportRows(companies: CrmCompany[]) {
  return companies.map((company) => ({
    name: company.name,
    domain: company.domain ?? '',
    phone: company.phone ?? '',
    notes: company.notes ?? '',
    tags: company.tags.map((tag) => tag.name).join('; '),
    contact_count: company.contact_count,
    created_at: company.created_at,
  }));
}
