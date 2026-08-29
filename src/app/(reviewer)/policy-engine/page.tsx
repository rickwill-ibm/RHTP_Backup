/**
 * Intelligent Policy Engine — policy → DTR authoring workbench (policy-expert facing).
 *
 * A gated maker→checker workflow: upload a payer policy for a tenant → review the extracted criteria
 * and codes with a document-grounded assistant → sign off (two-person) → generate the DTR/CRD from
 * the APPROVED criteria → promote to the tenant. Inside AppLayout (standard reviewer shell); the
 * interactive work is a client component calling the /api/policy/dtr + /api/policy/assistant BFF
 * routes; extraction stays server-side.
 */
import AppLayout from '@/components/AppLayout';
import { PolicyDtrWorkbench } from '@/components/policy/PolicyDtrWorkbench';

export default function PolicyEnginePage(): React.ReactElement {
  return (
    <AppLayout pageTitle="Intelligent Policy Engine">
      <main className="mx-auto max-w-7xl space-y-5 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Intelligent Policy Engine — DTR Authoring</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            One policy at a time: the engine detects the format, extracts the content, and walks it
            through a gated workflow — <span className="font-medium">review</span> the criteria and
            codes, <span className="font-medium">sign off</span> (maker → checker), then{' '}
            <span className="font-medium">generate</span> the DTR/CRD artifacts from the approved
            criteria. The draft is built only from the uploaded document — no criteria are invented.
          </p>
        </header>

        <PolicyDtrWorkbench />
      </main>
    </AppLayout>
  );
}
