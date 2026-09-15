/**
 * Procedure Code Lookup — client-side helper for the PA order form's Code → Description
 * auto-fill.
 *
 * CPT: resolved LOCALLY from the seeded terminology table (`systemDisplay('CPT-HCPCS', code)`
 * in @/lib/terminology). Full CPT long descriptions are AMA-copyrighted and cannot be freely
 * embedded as a general table, so local coverage is limited to the codes this demo actually
 * uses (seeded in terminology-seed.json) rather than every CPT code — see that file's header.
 *
 * HCPCS: checked locally first (the same seeded table also carries the demo's known HCPCS
 * codes), then falls back to the BFF route /api/pa/code-lookup, which proxies NLM's free
 * public Clinical Table Search Service. Never calls clinicaltables.nlm.nih.gov directly from
 * the browser (see that route's file header for the no-key/no-direct-call invariant).
 */
import { systemDisplay } from '@/lib/terminology/validateCode/membership';
import type { OrderProcedure } from './pa-types';

const CPT_URI = 'http://www.ama-assn.org/go/cpt';
const HCPCS_URI = 'https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets';

function systemLabel(cptSystem: OrderProcedure['cptSystem']): 'CPT' | 'HCPCS' | undefined {
  if (cptSystem === CPT_URI) return 'CPT';
  if (cptSystem === HCPCS_URI) return 'HCPCS';
  return undefined;
}

/**
 * Resolve a procedure code's description for the given code system. Returns undefined when
 * the code isn't recognized (caller leaves the Description field as-is — never fabricates one).
 */
export async function lookupProcedureCode(
  code: string,
  cptSystem: OrderProcedure['cptSystem']
): Promise<string | undefined> {
  const trimmed = code.trim().toUpperCase();
  const label = systemLabel(cptSystem);
  if (!trimmed || !label) return undefined;

  const local = systemDisplay('CPT-HCPCS', trimmed);
  if (local) return local;
  if (label !== 'HCPCS') return undefined;
  // Live network fallback only once the code LOOKS complete (same 4-6 alphanumeric shape the
  // form itself validates) — a live lookup runs on a debounce as the user types, so this avoids
  // firing a network call for every still-in-progress keystroke.
  if (!/^[A-Za-z0-9]{4,6}$/.test(trimmed)) return undefined;

  try {
    const res = await fetch('/api/pa/code-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: trimmed, system: label }),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { display?: string };
    return data.display || undefined;
  } catch {
    return undefined;
  }
}
