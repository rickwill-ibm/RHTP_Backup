/**
 * Deployment-scope guard (Dev Plan Workstream E2 — risk-flag remediation).
 *
 * This repository contains work for multiple clients/prospects beyond the CMS-0057-F
 * Washington HCA engagement (e.g., uhg-orchestrate, md-smart-launch). Those modules must
 * never be reachable from an environment shown to HCA. Rather than deleting or moving that
 * code (which risks breaking other active work), this middleware centrally blocks the
 * out-of-scope route groups whenever DEPLOYMENT_SCOPE=cms0057f is set.
 *
 * Usage: set DEPLOYMENT_SCOPE=cms0057f in any environment (staging, demo, or production)
 * that HCA — or anyone outside the immediate delivery team — may access. Leave it unset
 * for internal, multi-client development environments.
 */
import { NextRequest, NextResponse } from 'next/server';

// Route-group path prefixes that are NOT part of the CMS-0057-F / FSIPAP scope and must be
// excluded from any HCA-facing deployment.
export const OUT_OF_SCOPE_PREFIXES = [
  '/uhg-orchestrate',
  '/md-smart-launch',
  '/care-manager',
  '/admin-console',
  '/stars-hedis-mips',
  '/patient-detail',
];

export function isOutOfScopePath(
  pathname: string,
  prefixes: string[] = OUT_OF_SCOPE_PREFIXES
): boolean {
  return prefixes.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`) ||
      pathname.startsWith(`/api${prefix}`)
  );
}

export function middleware(req: NextRequest): NextResponse {
  const scope = process.env.DEPLOYMENT_SCOPE;
  if (scope !== 'cms0057f') {
    return NextResponse.next();
  }

  if (isOutOfScopePath(req.nextUrl.pathname)) {
    return new NextResponse('Not found', { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  // Run on every route except static assets and Next.js internals.
  matcher: ['/((?!api/policy/dtr|_next/static|_next/image|favicon.ico).*)'],
};
