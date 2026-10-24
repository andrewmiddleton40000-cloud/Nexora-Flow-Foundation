import type { CompanyCsvRow, ContactCsvRow, CsvIssue } from './crm-types';
import { duplicateCompanyKeys, duplicateContactEmails, isValidDomain } from './crm-validation';

export class CsvValidationError extends Error {
  constructor(public readonly issues: CsvIssue[]) {
    super(issues.map((issue) => `Row ${issue.row}: ${issue.message}`).join('\n'));
    this.name = 'CsvValidationError';
  }
}

export function parseCsvMatrix(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else cell += char;
      continue;
    }

    if (char === '"' && cell.length === 0 && !closedQuote) {
      quoted = true;
      continue;
    }
    if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell);
      cell = '';
      closedQuote = false;
      if (char === ',') continue;
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    if (closedQuote && char.trim() !== '') {
      throw new Error('CSV contains text after a closing quote.');
    }
    cell += char;
  }

  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
  }
  return rows;
}

export function serializeCsv(
  headers: string[],
  rows: Array<Record<string, string | number | null | undefined>>,
): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    headers.map(escape).join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\r\n');
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function recordsFromCsv(source: string, requiredHeaders: string[]) {
  const matrix = parseCsvMatrix(source);
  if (!matrix.length) throw new CsvValidationError([{ row: 1, field: 'header', message: 'The CSV file is empty.' }]);
  const headers = matrix[0].map(normalizeHeader);
  const issues: CsvIssue[] = [];
  if (headers.some((header) => !header)) issues.push({ row: 1, field: 'header', message: 'Column names cannot be blank.' });
  if (new Set(headers).size !== headers.length) issues.push({ row: 1, field: 'header', message: 'Column names must be unique.' });
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) issues.push({ row: 1, field: required, message: `Required column “${required}” is missing.` });
  }
  if (issues.length) throw new CsvValidationError(issues);

  const records = matrix.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      issues.push({ row: index + 2, field: 'row', message: `Expected ${headers.length} columns but found ${values.length}.` });
    }
    return Object.fromEntries(headers.map((header, column) => [header, (values[column] ?? '').trim()]));
  });
  return { records, issues };
}

const splitTags = (value: string | undefined) => value?.split(';').map((tag) => tag.trim()).filter(Boolean) ?? [];

export function parseContactsCsv(source: string): ContactCsvRow[] {
  const { records, issues } = recordsFromCsv(source, ['first_name', 'last_name']);
  const rows: ContactCsvRow[] = records.map((record, index) => {
    const row = index + 2;
    const first_name = record.first_name?.trim() ?? '';
    const last_name = record.last_name?.trim() ?? '';
    const email = record.email?.trim().toLowerCase() || null;
    if (!first_name) issues.push({ row, field: 'first_name', message: 'First name is required.' });
    if (!last_name) issues.push({ row, field: 'last_name', message: 'Last name is required.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ row, field: 'email', message: 'Email address is invalid.' });
    }
    return {
      first_name,
      last_name,
      email,
      phone: record.phone || null,
      job_title: record.job_title || null,
      company_name: record.company_name || null,
      notes: record.notes || null,
      tag_names: splitTags(record.tags),
    };
  });
  for (const index of duplicateContactEmails(rows)) {
    issues.push({ row: index + 2, field: 'email', message: 'Email is duplicated in this file.' });
  }
  if (rows.length > 500) issues.push({ row: 1, field: 'row', message: 'Import up to 500 contacts at a time.' });
  if (issues.length) throw new CsvValidationError(issues);
  return rows;
}

export function parseCompaniesCsv(source: string): CompanyCsvRow[] {
  const { records, issues } = recordsFromCsv(source, ['name']);
  const rows: CompanyCsvRow[] = records.map((record, index) => {
    const row = index + 2;
    const name = record.name?.trim() ?? '';
    const domain = record.domain?.trim().toLowerCase() || null;
    if (!name) issues.push({ row, field: 'name', message: 'Company name is required.' });
    if (domain && !isValidDomain(domain)) {
      issues.push({ row, field: 'domain', message: 'Enter a valid company domain.' });
    }
    return {
      name,
      domain,
      phone: record.phone || null,
      notes: record.notes || null,
      tag_names: splitTags(record.tags),
    };
  });
  for (const index of duplicateCompanyKeys(rows)) {
    issues.push({ row: index + 2, field: 'name', message: 'Company name or domain is duplicated in this file.' });
  }
  if (rows.length > 500) issues.push({ row: 1, field: 'row', message: 'Import up to 500 companies at a time.' });
  if (issues.length) throw new CsvValidationError(issues);
  return rows;
}
