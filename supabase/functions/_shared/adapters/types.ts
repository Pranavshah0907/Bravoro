// CRM adapter interface. Grows forward — never refactored.
// M1: testConnection, fetchFieldMetadata, autoMapCustomFields.
// Spec A (2026-05-06): fetchContacts.

export interface CrmAdapter {
  testConnection(token: string): Promise<ConnectionResult>;
  fetchFieldMetadata(token: string): Promise<FieldMetadata>;
  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings;
  fetchContacts(token: string, opts?: FetchContactsOpts): AsyncGenerator<NormalizedContact, void, void>;
  // Spec C (2026-05-06): push to CRM
  fetchUsers(token: string): Promise<CrmUser[]>;
  listDestinations(token: string): Promise<Destination[]>;
  findOrCreateOrganization(token: string, input: OrgInput): Promise<{ externalId: string; created: boolean }>;
  findOrCreatePerson(token: string, input: PersonInput): Promise<{ externalId: string; created: boolean; raw?: unknown }>;
  createDeal(token: string, input: DealInput): Promise<{ externalId: string }>;
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
  person: {
    firstName: string[];
    lastName: string[];
    email: string[];
    mobilePhone: string[];
    directPhone: string[];
    jobTitle: string[];
    linkedin: string[];
    website: string[];
  };
  org: {
    name: string[];
    domain: string[];
    website: string[];
    linkedin: string[];
    industry: string[];
  };
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
// ─── Spec C: push to CRM ───────────────────────────────────────────────────

export interface Destination {
  id: string;
  label: string;
  group?: string;
  pipelineId?: string;
  stageId?: string;
}

export interface CrmUser {
  externalId: string;
  name: string;
  email: string | null;
  active: boolean;
}

export interface OrgInput {
  name: string | null;
  domain: string | null;
  /** When creating a new Org, assign it to this CRM user. Existing Orgs are not re-owned. */
  ownerExternalId?: string | null;
}

export interface PersonInput {
  name: string;
  email: string | null;
  phone: string | null;
  linkedIn: string | null;
  jobTitle: string | null;
  organizationExternalId: string | null;
  /** When creating a new Person, assign them to this CRM user. Existing Persons are not re-owned. */
  ownerExternalId?: string | null;
  customFields?: Record<string, unknown>;
}

export interface DealInput {
  title: string;
  pipelineId: string;
  stageId: string;
  ownerExternalId: string | null;
  personExternalId: string;
  organizationExternalId: string | null;
  sourceLabel: string;
  sourceId: string | null;
  channelLabel: string | null;
  customFields?: Record<string, unknown>;
}
