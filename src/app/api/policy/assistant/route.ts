/**
 * BFF: encoding assistant Q&A (Policy Engine / DTR authoring).
 *
 * POST /api/policy/assistant  (JSON: { question: string; review: PolicyReview })
 *   → AssistantAnswer, grounded in THAT review + its coding map only. Runs the seam: a deterministic
 *     grounded-retrieval answer when no AI endpoint is configured, or an LLM at temperature 0 when it
 *     is. The AI branch FAILS SAFE — any error falls back to the deterministic answer, so the panel
 *     always gets a cited, on-document response. No criteria are invented; nothing is persisted here.
 *
 * Node runtime so process.env (the AI gate) is available; dynamic so the body is read per request.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ooError } from '@/lib/fhir/operationOutcome';
import { aiCodingConfigFromEnv } from '@/lib/policy/review/codingMap';
import {
  buildAssistantContext,
  buildAssistantRequest,
  deterministicAnswer,
  parseAssistantResponse,
  selectAssistantMode,
} from '@/lib/policy/assistant/encodingAssistant';
import type { PolicyReview } from '@/lib/policy/policyReview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { question?: unknown; review?: unknown };
  try {
    body = (await req.json()) as { question?: unknown; review?: unknown };
  } catch (err) {
    return NextResponse.json(ooError(`invalid JSON body: ${String(err)}`, 'invalid'), {
      status: 400,
    });
  }

  const question = typeof body.question === 'string' ? body.question : '';
  const review = body.review as PolicyReview | undefined;
  if (!question.trim() || !review || typeof review !== 'object') {
    return NextResponse.json(ooError('question and review are required', 'invalid'), {
      status: 400,
    });
  }

  const ctx = buildAssistantContext(review);

  // Deterministic path (no AI configured): grounded retrieval, offline.
  if (selectAssistantMode() === 'deterministic') {
    return NextResponse.json(deterministicAnswer(question, ctx));
  }

  // AI path (temperature 0), grounded strictly in this policy + coding map. Fails safe.
  const request = buildAssistantRequest(question, ctx);
  const config = aiCodingConfigFromEnv();
  try {
    const res = await fetch(config.endpoint ?? '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ANTHROPIC_API_KEY ?? ''}`,
      },
      body: JSON.stringify({
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        temperature: request.temperature,
        top_p: request.top_p,
        prompt_version: request.promptVersion,
      }),
    });
    if (!res.ok) return NextResponse.json(deterministicAnswer(question, ctx));
    const raw: unknown = await res.json();
    return NextResponse.json(parseAssistantResponse(raw, request.allowedRefs));
  } catch {
    // Network/parse failure → deterministic fallback (never a hard error to the reviewer).
    return NextResponse.json(deterministicAnswer(question, ctx));
  }
}
