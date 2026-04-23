import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { PipedriveAdapter } from "./pipedrive.ts";
import type { FieldMetadata } from "./types.ts";

function customField(key: string, label: string): any {
  return { key, label, type: 'varchar', isCustom: true };
}
function standardField(key: string, label: string): any {
  return { key, label, type: 'varchar', isCustom: false };
}

Deno.test("autoMapCustomFields: maps website keywords on person fields", () => {
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
  assertEquals(mapping.person.websiteField.sort(), ['hash_hp', 'hash_web1', 'hash_web2']);
  assertEquals(mapping.person.linkedinField, []);
});

Deno.test("autoMapCustomFields: maps linkedin keywords on person fields", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [customField('hash_li', 'LinkedIn Profile')],
    org: [],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.linkedinField, ['hash_li']);
});

Deno.test("autoMapCustomFields: maps website keywords on org fields", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [],
    org: [customField('hash_orgweb', 'Company Website')],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.org.websiteField, ['hash_orgweb']);
});

Deno.test("autoMapCustomFields: ignores standard (non-custom) fields", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = {
    person: [standardField('name', 'Website')],
    org: [standardField('website', 'Website')],
  };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping.person.websiteField, []);
  assertEquals(mapping.org.websiteField, []);
});

Deno.test("autoMapCustomFields: returns empty shape with practiceType slot when no matches", () => {
  const adapter = new PipedriveAdapter();
  const meta: FieldMetadata = { person: [], org: [] };
  const mapping = adapter.autoMapCustomFields(meta);
  assertEquals(mapping, {
    person: { websiteField: [], linkedinField: [] },
    org: { websiteField: [], practiceType: [] },
  });
});
