import type {
  CrmAdapter, ConnectionResult, FieldMetadata, FieldDef, CustomFieldMappings,
  FetchContactsOpts, NormalizedContact,
  Destination, CrmUser, OrgInput, PersonInput, DealInput,
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

  // ─── Spec C: push to CRM ─────────────────────────────────────────────────

  async fetchUsers(token: string): Promise<CrmUser[]> {
    const url = new URL('https://api.pipedrive.com/v1/users');
    url.searchParams.set('api_token', token);
    const res = await fetchJson(url.toString());
    return ((res.data ?? []) as any[]).map((u) => ({
      externalId: String(u.id),
      name: u.name ?? '',
      email: u.email ?? null,
      active: u.active_flag !== false,
    }));
  }

  async listDestinations(token: string): Promise<Destination[]> {
    const [pRes, sRes] = await Promise.all([
      fetchJson(`https://api.pipedrive.com/v1/pipelines?api_token=${encodeURIComponent(token)}`),
      fetchJson(`https://api.pipedrive.com/v1/stages?api_token=${encodeURIComponent(token)}`),
    ]);
    const stagesByPipeline = new Map<number, any[]>();
    for (const st of (sRes.data ?? [])) {
      if (!stagesByPipeline.has(st.pipeline_id)) stagesByPipeline.set(st.pipeline_id, []);
      stagesByPipeline.get(st.pipeline_id)!.push(st);
    }
    const out: Destination[] = [];
    for (const p of (pRes.data ?? [])) {
      const stages = (stagesByPipeline.get(p.id) ?? []).sort((a: any, b: any) => a.order_nr - b.order_nr);
      if (stages.length === 0) continue;
      const first = stages[0];
      out.push({
        id: `pipeline:${p.id}|stage:${first.id}`,
        label: `${p.name} — ${first.name}`,
        group: p.name,
        pipelineId: String(p.id),
        stageId: String(first.id),
      });
    }
    return out;
  }

  async findOrCreateOrganization(
    token: string,
    input: OrgInput,
  ): Promise<{ externalId: string; created: boolean }> {
    if (!input.domain && !input.name) throw new Error('org_input_empty');
    if (input.domain) {
      const u = new URL('https://api.pipedrive.com/v1/organizations/search');
      u.searchParams.set('api_token', token);
      u.searchParams.set('term', input.domain);
      u.searchParams.set('fields', 'address,name');
      const r = await fetchJson(u.toString());
      const items = r.data?.items ?? [];
      if (items.length > 0) return { externalId: String(items[0].item.id), created: false };
    }
    if (input.name) {
      const u = new URL('https://api.pipedrive.com/v1/organizations/search');
      u.searchParams.set('api_token', token);
      u.searchParams.set('term', input.name);
      u.searchParams.set('fields', 'name');
      const r = await fetchJson(u.toString());
      const items = r.data?.items ?? [];
      if (items.length > 0) return { externalId: String(items[0].item.id), created: false };
    }
    const url = `https://api.pipedrive.com/v1/organizations?api_token=${encodeURIComponent(token)}`;
    const created = await fetchJson(url, 1, { method: 'POST', body: { name: input.name ?? input.domain } });
    return { externalId: String(created.data.id), created: true };
  }

  async findOrCreatePerson(
    token: string,
    input: PersonInput,
  ): Promise<{ externalId: string; created: boolean; raw?: unknown }> {
    if (input.email) {
      const u = new URL('https://api.pipedrive.com/v1/persons/search');
      u.searchParams.set('api_token', token);
      u.searchParams.set('term', input.email);
      u.searchParams.set('fields', 'email');
      u.searchParams.set('exact_match', 'true');
      const r = await fetchJson(u.toString());
      const items = r.data?.items ?? [];
      if (items.length > 0) return { externalId: String(items[0].item.id), created: false };
    }
    const body: any = { name: input.name, visible_to: 3 };
    if (input.email) body.email = [{ value: input.email, primary: true, label: 'work' }];
    if (input.phone) body.phone = [{ value: input.phone, primary: true, label: 'work' }];
    if (input.organizationExternalId) body.org_id = Number(input.organizationExternalId);
    if (input.jobTitle) body.job_title = input.jobTitle;
    if (input.customFields) {
      for (const [k, v] of Object.entries(input.customFields)) {
        if (v !== undefined && v !== null) body[k] = v;
      }
    }
    const url = `https://api.pipedrive.com/v1/persons?api_token=${encodeURIComponent(token)}`;
    const created = await fetchJson(url, 1, { method: 'POST', body });
    return { externalId: String(created.data.id), created: true, raw: created.data };
  }

  async createDeal(token: string, input: DealInput): Promise<{ externalId: string }> {
    // Pipedrive's `origin`, `origin_id`, and `channel` fields are read-only
    // for Personal API Tokens — they're reserved for Marketplace Apps. We
    // skip them here. Source attribution is preserved in the Deal note we
    // append below, plus any user-defined custom fields via input.customFields.
    const body: any = {
      title: input.title,
      pipeline_id: Number(input.pipelineId),
      stage_id: Number(input.stageId),
      person_id: Number(input.personExternalId),
      visible_to: 3,
    };
    if (input.organizationExternalId) body.org_id = Number(input.organizationExternalId);
    if (input.ownerExternalId) body.user_id = Number(input.ownerExternalId);
    if (input.customFields) {
      for (const [k, v] of Object.entries(input.customFields)) {
        if (v !== undefined && v !== null) body[k] = v;
      }
    }
    const url = `https://api.pipedrive.com/v1/deals?api_token=${encodeURIComponent(token)}`;
    const created = await fetchJson(url, 1, { method: 'POST', body });
    const dealId = String(created.data.id);

    // Best-effort source attribution via a Note attached to the Deal.
    // Failures here don't fail the push.
    if (input.sourceLabel || input.sourceId || input.channelLabel) {
      try {
        // Pipedrive Notes render as HTML, so wrap each line in <p> for proper
        // line breaks. Plain \n collapses to a single line in the UI.
        const noteLines = [
          input.sourceLabel ? `<p><strong>Source:</strong> ${escapeHtml(input.sourceLabel)}</p>` : '',
          input.sourceId ? `<p><strong>Bravoro ID:</strong> ${escapeHtml(input.sourceId)}</p>` : '',
          input.channelLabel ? `<p><strong>Channel:</strong> ${escapeHtml(input.channelLabel)}</p>` : '',
        ].filter(Boolean);
        const noteUrl = `https://api.pipedrive.com/v1/notes?api_token=${encodeURIComponent(token)}`;
        await fetchJson(noteUrl, 1, {
          method: 'POST',
          body: { content: noteLines.join(''), deal_id: Number(dealId) },
        });
      } catch (err) {
        console.warn('source attribution note failed (non-fatal):', (err as Error).message);
      }
    }

    return { externalId: dealId };
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchJson(
  url: string,
  attempt = 1,
  opts?: { method?: string; body?: any },
): Promise<any> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const init: RequestInit = { signal: ctrl.signal };
    if (opts?.method) init.method = opts.method;
    if (opts?.body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, init);
    if (res.status === 401 || res.status === 403) {
      throw new InvalidTokenError();
    }
    if (res.status === 429 && attempt <= 3) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 250 * attempt;
      await new Promise(r => setTimeout(r, retryAfter));
      return fetchJson(url, attempt + 1, opts);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Pipedrive ${res.status}: ${txt.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
