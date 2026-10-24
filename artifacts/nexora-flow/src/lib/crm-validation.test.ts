import { describe, expect, it } from 'vitest';
import {
  collectionEmptyState,
  duplicateCompanyKeys,
  duplicateContactEmails,
  validateCompanyInput,
  validateContactInput,
} from './crm-validation';

describe('CRM input validation', () => {
  it('requires contact names and rejects invalid email addresses', () => {
    const result = validateContactInput({
      first_name: ' ',
      last_name: 'Osei',
      email: 'not-an-email',
      tag_ids: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.first_name).toBeTruthy();
      expect(result.errors.email).toBeTruthy();
    }
  });

  it('normalizes valid contact fields and removes duplicate tag IDs', () => {
    const result = validateContactInput({
      first_name: '  Ada ',
      last_name: ' Mensah ',
      email: ' ADA@example.com ',
      tag_ids: ['tag-a', 'tag-a'],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        first_name: 'Ada',
        last_name: 'Mensah',
        email: 'ada@example.com',
        phone: null,
        job_title: null,
        company_id: null,
        notes: null,
        tag_ids: ['tag-a'],
      },
    });
  });

  it('rejects malformed company domains and accepts normalized names', () => {
    expect(validateCompanyInput({ name: 'Acme', domain: 'bad domain', tag_ids: [] }).ok).toBe(false);
    expect(validateCompanyInput({ name: '  Acme Ltd  ', domain: 'ACME.example', tag_ids: [] })).toMatchObject({
      ok: true,
      value: { name: 'Acme Ltd', domain: 'acme.example' },
    });
  });

  it('detects duplicate contact emails without regard to case', () => {
    expect(duplicateContactEmails([
      { email: 'Person@example.com' },
      { email: 'other@example.com' },
      { email: ' person@EXAMPLE.com ' },
    ])).toEqual([0, 2]);
  });

  it('detects duplicate company names and domains', () => {
    expect(duplicateCompanyKeys([
      { name: 'North Star', domain: 'northstar.example' },
      { name: ' north star ', domain: 'another.example' },
      { name: 'Other', domain: 'NORTHSTAR.EXAMPLE' },
    ])).toEqual([0, 1, 2]);
  });
});

describe('CRM empty collection states', () => {
  it('shows a useful empty state when a workspace has no records', () => {
    expect(collectionEmptyState('contacts', 0, '')?.title).toBe('No contacts yet');
    expect(collectionEmptyState('companies', 0, '')?.title).toBe('No companies yet');
  });

  it('distinguishes a search with no matches from a new workspace', () => {
    expect(collectionEmptyState('contacts', 0, 'Mina')).toMatchObject({
      title: 'No matches found',
      description: expect.stringContaining('Mina'),
    });
    expect(collectionEmptyState('contacts', 1, '')).toBeNull();
  });
});
