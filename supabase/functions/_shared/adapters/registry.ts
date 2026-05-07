import type { CrmAdapter } from './types.ts';
import { PipedriveAdapter } from './pipedrive.ts';

const REGISTRY: Record<string, new () => CrmAdapter> = {
  pipedrive: PipedriveAdapter,
};

export function getAdapter(crmType: string): CrmAdapter {
  const Ctor = REGISTRY[crmType];
  if (!Ctor) throw new Error(`Unknown CRM type: ${crmType}`);
  return new Ctor();
}

export function isKnownCrmType(crmType: string): boolean {
  return crmType in REGISTRY;
}
