// ─── Value-based contracts (selector options for the population scope control) ──
// Canonical list the top-bar contract selector binds to via appContext.selectedContractId.
// Names mirror what the program screens already display; ids match the appContext default.

export interface ProgramContract {
  id: string;
  name: string;
  program: 'Medicaid' | 'Medicare' | 'Commercial';
}

export const CONTRACTS: ProgramContract[] = [
  { id: 'contract-001', name: 'SD RHTP — Track 3', program: 'Medicaid' },
  { id: 'contract-002', name: 'Medicare MSSP — Track 3', program: 'Medicare' },
  { id: 'contract-003', name: 'ACO REACH', program: 'Medicare' },
  { id: 'contract-004', name: 'Commercial VBC', program: 'Commercial' },
];

export function contractName(id: string | null): string {
  return CONTRACTS.find((c) => c.id === id)?.name ?? 'All contracts';
}
