export type CrmTag = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
};

export type ContactInput = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company_id: string | null;
  notes: string | null;
  tag_ids: string[];
};

export type CompanyInput = {
  name: string;
  domain: string | null;
  phone: string | null;
  notes: string | null;
  tag_ids: string[];
};

export type CrmContact = Omit<ContactInput, 'tag_ids'> & {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  company: { id: string; name: string } | null;
  tags: CrmTag[];
};

export type CrmCompany = Omit<CompanyInput, 'tag_ids'> & {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  contact_count: number;
  tags: CrmTag[];
};

export type CrmPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type CrmListOptions = {
  search?: string;
  tagId?: string | null;
  page?: number;
  pageSize?: number;
};

export type CsvIssue = {
  row: number;
  field: string;
  message: string;
};

export type ContactCsvRow = Omit<ContactInput, 'company_id' | 'tag_ids'> & {
  company_name: string | null;
  tag_names: string[];
};

export type CompanyCsvRow = Omit<CompanyInput, 'tag_ids'> & {
  tag_names: string[];
};
