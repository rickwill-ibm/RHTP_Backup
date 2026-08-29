/**
 * BFF: policy document → draft DTR review (Policy Engine / DTR authoring).
 *
 * POST /api/policy/dtr  (multipart/form-data; field "file": a PDF or .txt; optional "tenant")
 *   → PolicyReview (draft) for the tenant. Handles BOTH real payer-policy formats via the
 *     shared, deterministic processPolicyDocument pipeline (code-table + clinical-guideline).
 *
 * Node runtime (unpdf is Node-only); dynamic so the body is read at request time. NOTE: this
 * route is excluded from middleware in middleware.ts — middleware buffering the request body
 * makes a route handler's formData() parse fail ("Failed to parse body as FormData").
 */
import { NextRequest, NextResponse } from 'next/server';
import { ooError } from '@/lib/fhir/operationOutcome';
import { fileToTextSource } from '@/lib/policy/server/pdfIntake';
import { processPolicyDocument } from '@/lib/policy/policyReview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      ooError(`could not read upload (multipart parse failed): ${String(err)}`, 'invalid'),
      { status: 400 }
    );
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(ooError('no "file" provided in the upload', 'invalid'), {
      status: 400,
    });
  }
  const tenantRaw = form.get('tenant');
  const tenant = typeof tenantRaw === 'string' && tenantRaw.trim() ? tenantRaw.trim() : undefined;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const src = await fileToTextSource(bytes, file.name, file.type);
    const review = processPolicyDocument(src, { tenant });
    return NextResponse.json(review);
  } catch (err) {
    return NextResponse.json(ooError(String(err), 'exception'), { status: 500 });
  }
}
