// Normalization helpers used by the contact mirror, dedup-check,
// and push edge functions. Pure functions, no side effects.

export function normalizeEmail(input: string | null | undefined): string | null {
  if (input == null) return null;
  const v = input.trim().toLowerCase();
  if (v.length === 0) return null;
  return v;
}

export function extractDomain(input: string | null | undefined): string | null {
  if (input == null) return null;
  const at = input.indexOf('@');
  if (at < 0) return null;
  const dom = input.slice(at + 1).trim().toLowerCase();
  return dom.length === 0 ? null : dom;
}

export function normalizePhone(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const leadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 0) return null;
  return (leadingPlus ? '+' : '') + digitsOnly;
}
