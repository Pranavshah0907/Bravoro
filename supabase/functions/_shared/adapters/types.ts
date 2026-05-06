// CRM adapter interface. Grows forward — never refactored.
// M1: testConnection, fetchFieldMetadata, autoMapCustomFields.
// Spec A (2026-05-06): fetchContacts.

export interface CrmAdapter {
  testConnection(token: string): Promise<ConnectionResult>;
  fetchFieldMetadata(token: string): Promise<FieldMetadata>;
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings;
  fetchContacts(token: string, opts?: FetchContactsOpts): AsyncGenerator<NormalizedContact, void, void>;
}

export interface ConnectionResult {
  ok: boolean;
  accountIdentifier?: string;
  accountDisplayName?: string;
  error?: string;
}

export interface FieldMetadata {
  person: FieldDef[];
  org: FieldDef[];
}

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  isCustom: boolean;
}

export interface CustomFieldMappings {
  person: { websiteField: string[]; linkedinField: string[] };
  org: { websiteField: string[]; practiceType: string[] };
}

export class InvalidTokenError extends Error {
  constructor(message = 'Invalid or revoked CRM token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

// ─── Spec A: contact mirror + dedup ────────────────────────────────────────

export interface FetchContactsOpts {
  /** ISO-8601; if provided, fetch only contacts updated >= this time. */
  sinceISO?: string;
  /** Page size. Default 500. */
  pageSize?: number;
}

export interface NormalizedContact {
  externalId: string;
  name: string | null;
  emails: string[];
  primaryEmail: string | null;
  phones: string[];
  raw: unknown;
  /** ISO-8601 timestamp from the source CRM's update_time. */
  updatedAtISO: string;
}