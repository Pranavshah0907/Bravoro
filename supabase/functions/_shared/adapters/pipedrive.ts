import type {
  CrmAdapter, ConnectionResult, FieldMetadata, FieldDef, CustomFieldMappings,
  FetchContactsOpts, NormalizedContact,
} from './types.ts';
import { InvalidTokenError } from './types.ts';
import { normalizeEmail, normalizePhone } from '../normalize.ts';

const WEBSITE_KEYWORDS = ['website', 'webseite', 'homepage', 'url', 'web', 'domain'];
const LINKEDIN_KEYWORDS = ['linkedin'];

export class PipedriveAdapter implements CrmAdapter {
  async testConnection(token: string): Promise<ConnectionResult> {
    try {
      const res = await fetchJson(
        `https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(token)}`
      );
      const user = res.data;
      if (!user || !user.company_domain) {
        return { ok: false, error: 'Unexpected response from Pipedrive. Try reconnecting.' };
      }
      return {
        ok: true,
        accountIdentifier: user.company_domain,
        accountDisplayName: `${user.name} (${user.company_domain}.pipedrive.com)`,
      };
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        return {
          ok: false,
          error: 'Invalid API token. Check that you copied it correctly from Pipedrive → Personal preferences → API.',
        };
      }
      return { ok: false, error: "Couldn't reach Pipedrive. Try again in a moment." };
    }
  }

  async fetchFieldMetadata(token: string): Promise<FieldMetadata> {
    const [personRes, orgRes] = await Promise.all([
      fetchJson(`https://api.pipedrive.com/v1/personFields?api_token=${encodeURIComponent(token)}&limit=500`),
      fetchJson(`https://api.pipedrive.com/v1/organizationFields?api_token=${encodeURIComponent(token)}&limit=500`),
    ]);
    return {
      person: (personRes.data ?? []).map(normalizeField),
      org: (orgRes.data ?? []).map(normalizeField),
    };
  }

  autoMapCustomFields(metadata: FieldMetadata): CustomFieldMappings {
    const mapping: CustomFieldMappings = {
      person: { websiteField: [], linkedinField: [] },
      org: { websiteField: [], practiceType: [] },
    };
    for (const f of metadata.person) {
      if (!f.isCustom) continue;
      if (labelMatches(f.label, WEBSITE_KEYWORDS))  mapping.person.websiteField.push(f.key);
      if (labelMatches(f.label, LINKEDIN_KEYWORDS)) mapping.person.linkedinField.push(f.key);
    }
    for (const f of metadata.org) {
      if (!f.isCustom) continue;
      if (labelMatches(f.label, WEBSITE_KEYWORDS)) mapping.org.websiteField.push(f.key);
    }
    return mapping;
  }

  async *fetchContacts(
    token: string,
    opts: FetchContactsOpts = {},
  ): AsyncGenerator<NormalizedContact, void, void> {
    const pageSize = opts.pageSize ?? 500;
    if (opts.sinceISO) {
      yield* this.fetchContactsDelta(token, opts.sinceISO, pageSize);
    } else {
      yield* this.fetchContactsBackfill(token, pageSize);
    }
  }

  private async *fetchContactsBackfill(
    token: string,
    pageSize: number,
  ): AsyncGenerator<NormalizedContact, void, void> {
    let start = 0;
    while (true) {
      const url = new URL('https://api.pipedrive.com/v1/persons');
      url.searchParams.set('api_token', token);
      url.searchParams.set('start', String(start));
      url.searchParams.set('limit', String(pageSize));
      url.searchParams.set('sort', 'update_time ASC');
      const res = await fetchJson(url.toString());
      const items = res.data ?? [];
      if (items.length === 0) return;
      for (const p of items) yield normalizePerson(p);
      if (!res.additional_data?.pagination?.more_items_in_collection) return;
      start = res.additional_data.pagination.next_start;
    }
  }

  private async *fetchContactsDelta(
    token: string,
    sinceISO: string,
    pageSize: number,
  ): AsyncGenerator<NormalizedContact, void, void> {
    // /v1/recents accepts since_timestamp in 'YYYY-MM-DD HH:MM:SS' form (UTC).
    const ts = isoToPipedriveStamp(sinceISO);
    let start = 0;
    while (true) {
      const url = new URL('https://api.pipedrive.com/v1/recents');
      url.searchParams.set('api_token', token);
      url.searchParams.set('since_timestamp', ts);
      url.searchParams.set('items', 'person');
      url.searchParams.set('start', String(start));
      url.searchParams.set('limit', String(pageSize));
      const res = await fetchJson(url.toString());
      const items = res.data ?? [];
      if (items.length === 0) return;
      for (const wrapper of items) {
        // /v1/recents wraps each item: { item: 'person', id, data: {...} }
        const p = wrapper.data ?? wrapper;
        yield normalizePerson(p);
      }
      if (!res.additional_data?.pagination?.more_items_in_collection) return;
      start = res.additional_data.pagination.next_start;
    }
  }
}

function normalizeField(raw: any): FieldDef {
  return {
    key: raw.key,
    label: raw.name,
    type: raw.field_type,
    isCustom: raw.edit_flag === true,
  };
}

function labelMatches(label: string, keywords: string[]): boolean {
  const lbl = label.toLowerCase();
  return keywords.some(k => lbl.includes(k));
}

function normalizePerson(p: any): NormalizedContact {
  const emails: string[] = ((p.email ?? []) as Array<{ value?: string }>)
    .map((e) => normalizeEmail(e?.value))
    .filter((s): s is string => s != null);
  const phones: string[] = ((p.phone ?? []) as Array<{ value?: string }>)
    .map((t) => normalizePhone(t?.value))
    .filter((s): s is string => s != null);
  const updatedAtISO = pipedriveStampToISO(p.update_time)
    ?? new Date().toISOString();
  return {
    externalId: String(p.id),
    name: p.name ?? null,
    emails,
    primaryEmail: emails[0] ?? null,
    phones,
    raw: p,
    updatedAtISO,
  };
}

function isoToPipedriveStamp(iso: string): string {
  // 'YYYY-MM-DDTHH:MM:SS.sssZ' → 'YYYY-MM-DD HH:MM:SS' (UTC, drop ms)
  return iso.replace('T', ' ').replace(/\..*$/, '').replace('Z', '');
}

function pipedriveStampToISO(stamp: string | null | undefined): string | null {
  if (!stamp) return null;
  // 'YYYY-MM-DD HH:MM:SS' (UTC) → ISO with Z
  return stamp.replace(' ', 'T') + 'Z';
}

async function fetchJson(url: string, attempt = 1): Promise<any> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 401 || res.status === 403) {
      throw new InvalidTokenError();
    }
    if (res.status === 429 && attempt <= 3) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 250 * attempt;
      await new Promise(r => setTimeout(r, retryAfter));
      return fetchJson(url, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`Pipedrive ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
