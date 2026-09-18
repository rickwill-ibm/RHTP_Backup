/**
 * Medical Necessity panel (increment GT-3). Presentational; renders the stage
 * view model — net outcome, gold-card status, propensity (with attributable
 * factors), indications, deficiencies, and the remediation loop.
 */
import type { MedicalNecessityVM } from '@/lib/goldenThread';

function bandColor(band: string): string {
  return band === 'high'
    ? 'bg-carbon-red-light text-carbon-red border-[#ffb3b8]'
    : band === 'medium'
      ? 'bg-carbon-yellow-light text-[#b45309] border-carbon-yellow'
      : 'bg-carbon-green-light text-[#0e6027] border-carbon-green';
}

export function MedicalNecessityPanel({ vm }: { vm: MedicalNecessityVM }): React.ReactElement {
  return (
    <section className="space-y-4 rounded-lg border border-carbon-gray-20 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Medical Necessity</h3>
          <p className="text-sm text-carbon-gray-70">
            {vm.order.display ?? vm.order.code} · {vm.order.code} · member {vm.memberId}
          </p>
        </div>
        <span
          className={`rounded border px-2 py-1 text-xs font-medium ${
            vm.netRequiresPA
              ? 'border-carbon-yellow bg-carbon-yellow-light text-[#b45309]'
              : 'border-carbon-green bg-carbon-green-light text-[#0e6027]'
          }`}
        >
          {vm.netRequiresPA ? 'PA required' : 'No PA required'} · {vm.netOutcome}
        </span>
      </header>

      {/* gold card */}
      <div className="rounded border border-carbon-gray-20 bg-carbon-gray-10 p-3 text-sm">
        <span className="font-medium">Gold card: </span>
        {vm.goldCard.applied ? (
          <span className="text-[#0e6027]">
            Applied — PA waived ({vm.goldCard.program}
            {typeof vm.goldCard.approvalRate === 'number'
              ? vm.goldCard.seeded
                ? `, illustrative seeded ${Math.round(vm.goldCard.approvalRate * 100)}% approval — not a book of business`
                : `, ${Math.round(vm.goldCard.approvalRate * 100)}% approval`
              : ''}
            ). {vm.goldCard.reason}
            {vm.goldCard.seeded && typeof vm.goldCard.approvalRate === 'number' ? (
              <span className="mt-1 block text-xs italic opacity-80">
                Seeded per-provider figure. Design basis is a program approval-rate threshold (e.g.
                Texas HB 3459: PA exemption after a ≥90% approval rate over 6 months) — not observed
                provider history.
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-carbon-gray-70">Not applied — {vm.goldCard.reason}</span>
        )}
      </div>

      {/* propensity */}
      <div className={`rounded border p-3 text-sm ${bandColor(vm.propensity.band)}`}>
        <div className="flex items-center justify-between">
          <span className="font-medium">
            Submission-readiness (completeness) score: {vm.propensity.score}/100 (
            {vm.propensity.band})
          </span>
        </div>
        <ul className="mt-1 list-inside list-disc text-xs">
          {vm.propensity.factors.map((f, i) => (
            <li key={i}>
              {f.label}: {f.points >= 0 ? '+' : ''}
              {f.points}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs italic opacity-80">
          Decision-support only — not a determination.
        </p>
      </div>

      {/* indications + deficiencies */}
      {vm.indications.length > 0 ? (
        <div className="text-sm">
          <p className="font-medium">Indications considered ({vm.indications.length})</p>
          <ul className="mt-1 list-inside list-disc text-carbon-gray-70">
            {vm.indications.slice(0, 6).map((i) => (
              <li key={i.label}>
                {i.label}. {i.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {vm.deficiencies.length > 0 ? (
        <div className="rounded border border-[#ffb3b8] bg-carbon-red-light p-3 text-sm">
          <p className="font-medium text-carbon-red">Deficiencies</p>
          <ul className="mt-1 list-inside list-disc text-carbon-red">
            {vm.deficiencies.map((d, i) => (
              <li key={i}>
                <span className="font-medium">{d.kind}:</span> {d.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* remediation loop */}
      <div className="text-sm">
        <p className="font-medium">Next steps</p>
        <ul className="mt-1 space-y-1">
          {vm.remediation.map((r, i) => (
            <li key={i} className="rounded border border-carbon-gray-20 p-2">
              <span className="font-medium">{r.label}</span> — {r.detail}
              {r.examples && r.examples.length > 0 ? (
                <span className="block text-xs text-carbon-gray-50">
                  e.g. {r.examples.join('; ')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
