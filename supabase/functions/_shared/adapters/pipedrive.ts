import type {
  CrmAdapter, ConnectionResult, FieldMetadata, FieldDef, CustomFieldMappings,
} from './types.ts';
import { InvalidTokenError } from './types.ts';

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

  async fetchFieldMetadata(_token: string): Promise<FieldMetadata> {
    throw new Error('Not implemented yet — see Task 6');
  }

  autoMapCustomFields(_metadata: FieldMetadata): CustomFieldMappings {
    throw new Error('Not implemented yet — see Task 7');
  }
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
