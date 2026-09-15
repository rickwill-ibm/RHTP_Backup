/**
 * BFF: poll a Payer-to-Payer bulk export job — plan Slice 3.
 * GET /api/bulk/status?jobId=...
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/server/smartSession';
import { exportStatus } from '@/lib/server/bulkClient';
import { correlationFrom } from '@/lib/server/correlation';
import { ooError } from '@/lib/fhir/operationOutcome';
import { devMockEnabled, devBulkStatus } from '@/lib/server/devStubs';
import { getPatientById } from '@/lib/patientRegistry';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json(ooError('jobId required', 'required'), { status: 400 });
  }
  // patientId is forwarded from the start response via query param for patient-aware mock data
  const patientId = req.nextUrl.searchParams.get('patientId') ?? undefined;
  if (devMockEnabled()) {
    // The mock returns a member-scoped PHI inventory (EOBs, conditions, PA history). Require an
    // explicit, well-formed member id — otherwise `devBulkStatus(undefined)` defaults to a seed member
    // and discloses that member's full export to any caller. Bounded id shape blocks injection/traversal.
    if (!patientId || !/^[A-Za-z0-9_-]{1,64}$/.test(patientId)) {
      return NextResponse.json(
        ooError('A valid patientId is required for member-scoped export status', 'required'),
        { status: 400 }
      );
    }
    // Resolve against the registry before disclosing — an unknown id must not fall through to
    // `devBulkStatus`'s `?? MARIA_SD_001` default and export the seed member's full PHI inventory.
    if (!getPatientById(patientId)) {
      return NextResponse.json(ooError('No matching member', 'not-found'), { status: 404 });
    }
    return NextResponse.json(devBulkStatus(patientId));
  }
  const s = await exportStatus(jobId, { correlationId });
  return NextResponse.json(
    { state: s.state, fileUrls: s.fileUrls },
    { status: s.ok ? 200 : s.status || 502 }
  );
}
