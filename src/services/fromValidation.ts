import type { ApiKey } from '../db/schema.js';
import { getAllowedFromDomains } from './settings.js';

const ADDR_RE = /<\s*([^>\s]+@[^>\s]+)\s*>|([^\s<>"]+@[^\s<>"]+)/;

export function extractEmail(addr: string): string | null {
  const m = ADDR_RE.exec(addr);
  if (!m) return null;
  return (m[1] ?? m[2] ?? '').trim().toLowerCase();
}

export function domainOf(addr: string): string | null {
  const email = extractEmail(addr);
  if (!email) return null;
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : null;
}

function parseList(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((s) => String(s).toLowerCase()) : [];
  } catch {
    return [];
  }
}

export interface FromValidationResult {
  ok: boolean;
  reason?: 'invalid_address' | 'domain_not_allowed';
  domain?: string;
  allowed?: string[];
}

export async function validateFrom(fromAddr: string, apiKey?: Pick<ApiKey, 'allowedDomains'> | null): Promise<FromValidationResult> {
  const domain = domainOf(fromAddr);
  if (!domain) return { ok: false, reason: 'invalid_address' };

  const perKey = parseList(apiKey?.allowedDomains ?? null);
  const global = await getAllowedFromDomains();
  const allowed = perKey.length > 0 ? perKey : global;

  if (allowed.length === 0) return { ok: true, domain };
  return allowed.includes(domain)
    ? { ok: true, domain, allowed }
    : { ok: false, reason: 'domain_not_allowed', domain, allowed };
}
