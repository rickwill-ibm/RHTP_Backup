/**
 * Session status (plan F-3): returns a BOOLEAN + the launch/patient context
 * (an id, never a token). Client components read this to know sign-in state
 * and which patient the session is scoped to.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  isAuthenticated,
  getSessionPatient,
  setDevSessionPatient,
} from '@/lib/server/smartSession';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  let authenticated = false;
  let patient: string | null = null;
  try {
    authenticated = await isAuthenticated();
    if (authenticated) patient = await getSessionPatient();
  } catch {
    authenticated = false;
  }
  return NextResponse.json({ authenticated, patient });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as { patient?: string } | null;
  if (!body?.patient) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const ok = await setDevSessionPatient(body.patient);
  return NextResponse.json({ ok, patient: ok ? body.patient : null }, { status: ok ? 200 : 409 });
}
