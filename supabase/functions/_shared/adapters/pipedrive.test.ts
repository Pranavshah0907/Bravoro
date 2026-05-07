import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { PipedriveAdapter } from "./pipedrive.ts";
import type { FieldMetadata, CustomFieldMappings } from "./types.ts";

function customField(key: string, label: string): any {
  return { key, label, type: 'varchar', isCustom: true };
}
function standardField(key: string, label: string): any {
  return { key, label, type: 'varchar', isCustom: false };
}

const EMPTY_SEEDED: CustomFieldMappings = {
  person: {
    firstName:   ['first_name'],
    lastName:    ['last_name'],
    email:       ['email'],
    mobilePhone: [],
    directPhone: [],
    jobTitle:    ['job_title'],
    linkedin:    [],
    website:     [],
  },
  org: {
    name:     ['name'],
    domain:   [],
    website:  ['website'],
    linkedin: [],
    industry: [],
  },
};

Deno.test("autoMapCustomFields: returns native seeds when metadata is empty", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = { person: [], org: [] };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping, EMPTY_SEEDED);
});

Deno.test("autoMapCustomFields: maps website keywords on person fields (German + English)", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [
      standardField('name', 'Name'),
      customField('hash_web1', 'Website'),
      customField('hash_web2', 'Webseite'),
      customField('hash_hp', 'Homepage'),
      customField('hash_other', 'Lieblingsfarbe'),
    ],
    org: [],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.website.sort(), ['hash_hp', 'hash_web1', 'hash_web2']);
  assertEquals(mapping.person.linkedin, []);
});

Deno.test("autoMapCustomFields: maps linkedin keywords on person fields", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [customField('hash_li', 'LinkedIn Profile')],
    org: [],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.linkedin, ['hash_li']);
});

Deno.test("autoMapCustomFields: maps website keywords on org fields, preserving native seed", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [],
    org: [customField('hash_orgweb', 'Company Website')],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  // Native 'website' seed plus the auto-detected custom field.
  assertEquals(mapping.org.website.sort(), ['hash_orgweb', 'website']);
});

Deno.test("autoMapCustomFields: ignores standard (non-custom) fields with matching labels", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [standardField('extra_li', 'LinkedIn')],
    org: [standardField('extra_industry', 'Industry')],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  // Standard field 'extra_li' must NOT be added to the linkedin array.
  assertEquals(mapping.person.linkedin, []);
  assertEquals(mapping.org.industry, []);
});

Deno.test("autoMapCustomFields: maps mobile-phone keywords (English + German)", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [
      customField('hash_m1', 'Mobile Phone'),
      customField('hash_m2', 'Cell'),
      customField('hash_m3', 'Handy'),
    ],
    org: [],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.mobilePhone.sort(), ['hash_m1', 'hash_m2', 'hash_m3']);
});

Deno.test("autoMapCustomFields: maps direct-phone keywords", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [
      customField('hash_d1', 'Direct Line'),
      customField('hash_d2', 'Office Phone'),
      customField('hash_d3', 'Work phone'),
    ],
    org: [],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.directPhone.sort(), ['hash_d1', 'hash_d2', 'hash_d3']);
});

Deno.test("autoMapCustomFields: maps industry keywords (English + German)", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [],
    org: [
      customField('hash_i1', 'Industry'),
      customField('hash_i2', 'Branche'),
      customField('hash_i3', 'Practice Area'),
    ],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.org.industry.sort(), ['hash_i1', 'hash_i2', 'hash_i3']);
});

Deno.test("autoMapCustomFields: domain keyword separate from website on org", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [],
    org: [
      customField('hash_dom', 'Email Domain'),
      customField('hash_web', 'Website'),
    ],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.org.domain, ['hash_dom']);
  // Native 'website' seed + custom 'Website' match.
  assertEquals(mapping.org.website.sort(), ['hash_web', 'website']);
});

Deno.test("autoMapCustomFields: preserves native job_title and email seeds on person", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [standardField('name', 'Name')],
    org: [],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.jobTitle, ['job_title']);
  assertEquals(mapping.person.firstName, ['first_name']);
  assertEquals(mapping.person.lastName, ['last_name']);
  assertEquals(mapping.person.email, ['email']);
});
