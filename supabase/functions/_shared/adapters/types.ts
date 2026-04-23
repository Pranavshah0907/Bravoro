// M1-scoped CRM adapter interface. M2 will extend with dedupCheck.

export interface CrmAdapter {
  testConnection(token: string): Promise<ConnectionResult>;
  fetchFieldMetadata(token: string): Promise<FieldMetadata>;
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings;
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