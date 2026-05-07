import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeEmail, extractDomain, normalizePhone } from './normalize.ts';

Deno.test('normalizeEmail lowercases and trims', () => {
  assertEquals(normalizeEmail('  Max@Example.DE  '), 'max@example.de');
});

Deno.test('normalizeEmail returns null for empty', () => {
  assertEquals(normalizeEmail(''), null);
  assertEquals(normalizeEmail('   '), null);
  assertEquals(normalizeEmail(null), null);
  assertEquals(normalizeEmail(undefined), null);
});

Deno.test('extractDomain pulls and lowercases', () => {
  assertEquals(extractDomain('Max@Example.DE'), 'example.de');
});

Deno.test('extractDomain returns null when no @', () => {
  assertEquals(extractDomain('not-an-email'), null);
  assertEquals(extractDomain(null), null);
});

Deno.test('normalizePhone strips spaces and punctuation, keeps leading +', () => {
  assertEquals(normalizePhone('+49 (30) 12-345 678'), '+493012345678');
});

Deno.test('normalizePhone preserves leading + only', () => {
  assertEquals(normalizePhone('0049 30 12345678'), '00493012345678');
});

Deno.test('normalizePhone returns null for empty/no digits', () => {
  assertEquals(normalizePhone(''), null);
  assertEquals(normalizePhone('---'), null);
  assertEquals(normalizePhone(null), null);
});
