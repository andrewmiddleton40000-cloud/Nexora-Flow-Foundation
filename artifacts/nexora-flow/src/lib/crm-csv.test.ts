import { describe, expect, it } from 'vitest';
import { CsvValidationError, parseCompaniesCsv, parseContactsCsv, parseCsvMatrix, serializeCsv } from './crm-csv';

describe('CSV parsing and validation', () => {
  it('handles quoted commas, embedded line breaks, and escaped quotes', () => {
    expect(parseCsvMatrix('name,notes\r\n"Acme, Inc.","First line\r\nsaid ""hello"""')).toEqual([
      ['name', 'notes'],
      ['Acme, Inc.', 'First line\r\nsaid "hello"'],
    ]);
  });

  it('parses contact rows, optional company references, and semicolon tags', () => {
    expect(parseContactsCsv(
      'First Name,Last Name,Email,Company Name,Tags\r\nNia,Okafor,nia@example.com,Acme,Priority; Lagos',
    )).toEqual([{
      first_name: 'Nia',
      last_name: 'Okafor',
      email: 'nia@example.com',
      phone: null,
      job_title: null,
      company_name: 'Acme',
      notes: null,
      tag_names: ['Priority', 'Lagos'],
    }]);
  });

  it('rejects missing required headers and malformed CSV quoting', () => {
    expect(() => parseContactsCsv('email,phone\nada@example.com,123')).toThrow(CsvValidationError);
    expect(() => parseCsvMatrix('name,notes\n"Acme,open')).toThrow('unclosed quoted field');
  });

  it('reports invalid and duplicate contact rows', () => {
    try {
      parseContactsCsv(
        'first_name,last_name,email\nAda,Lovelace,invalid\nGrace,Hopper,ada@example.com\nAlan,Turing,ADA@example.com',
      );
      throw new Error('Expected CSV validation failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(CsvValidationError);
      const csvError = error as CsvValidationError;
      expect(csvError.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ row: 2, field: 'email', message: 'Email address is invalid.' }),
        expect.objectContaining({ row: 3, field: 'email', message: 'Email is duplicated in this file.' }),
        expect.objectContaining({ row: 4, field: 'email', message: 'Email is duplicated in this file.' }),
      ]));
    }
  });

  it('rejects duplicate company names or domains and invalid domains', () => {
    try {
      parseCompaniesCsv(
        'name,domain\nAcme,acme.example\n acme ,other.example\nBad Domain,not a domain',
      );
      throw new Error('Expected CSV validation failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(CsvValidationError);
      const csvError = error as CsvValidationError;
      expect(csvError.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ row: 3, field: 'name', message: 'Company name or domain is duplicated in this file.' }),
        expect.objectContaining({ row: 4, field: 'domain' }),
      ]));
    }
  });

  it('escapes CSV cells on export', () => {
    expect(serializeCsv(['name', 'notes'], [{ name: 'Acme, Inc.', notes: 'Say "hello"\nnext' }])).toBe(
      'name,notes\r\n"Acme, Inc.","Say ""hello""\nnext"',
    );
  });
});
