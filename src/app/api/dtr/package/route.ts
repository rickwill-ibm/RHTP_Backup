/**
 * BFF: fetch a DTR $questionnaire-package — plan Slice 4.
 * GET /api/dtr/package?questionnaire=<canonical>
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { getPrincipal } from '@/lib/authz/principal';
import { fhirRead } from '@/lib/server/fhirServer';
import { correlationFrom } from '@/lib/server/correlation';
import { ooError } from '@/lib/fhir/operationOutcome';
import { devMockEnabled, devQuestionnairePackage } from '@/lib/server/devStubs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }

  // Attributable audit (CMS-0057-F accounting-of-disclosures): the resolved acting
  // principal, not a hardcoded 'session-user' placeholder.
  const actorId = getPrincipal(await getSessionAuthContext().catch(() => null)).userId;
  const questionnaire = req.nextUrl.searchParams.get('questionnaire');
  const cptCode = req.nextUrl.searchParams.get('cptCode') ?? undefined;
  if (!questionnaire && !cptCode) {
    return NextResponse.json(ooError('questionnaire canonical or cptCode required', 'required'), {
      status: 400,
    });
  }
  if (devMockEnabled()) {
    return NextResponse.json(devQuestionnairePackage(cptCode));
  }
  // $questionnaire-package is a FHIR operation served by fhir-service.
  const path = `Questionnaire/$questionnaire-package?questionnaire=${encodeURIComponent(questionnaire ?? cptCode ?? '')}`;
  const result = await fhirRead(path, { actor: actorId, correlationId });
  return NextResponse.json(result.ok ? result.raw : result.error, {
    status: result.status || (result.ok ? 200 : 502),
  });
}
