/**
 * Comprehensive API logic test — all 5 tabs × 5 patients
 *
 * Tests the pure mock/logic layer without needing the HTTP server running.
 * Imports the same functions the routes call so results are authoritative.
 *
 * Run: node tests/api-integration.test.mjs
 *
 * Checks:
 *  §1 Patient Access  — Coverage, Conditions, ClaimResponse, Session
 *  §2 Provider Access — Consent, $member-match, Conditions
 *  §3 Payer-to-Payer  — BulkStart, BulkStatus (patient-specific history)
 *  §4 Prior Auth      — CRD cards, DTR evaluation, PAS human gate, Work Queue,
 *                       Evidence Record (ID parse + patient fields)
 *  Infra              — Network adequacy (SD, GA), CDS hooks patient data
 *  Cross-patient      — Names, CPT codes, payers must differ between patients
 *  ID parsing         — ev-PAT-0042-75561-xxx must not return Maria's data
 *  Validate           — evidence ID regex must accept hyphens
 *
 * Structure: the harness, the fixture data and the pure-logic simulators live
 * in ./api-integration/ and the assertion body is split into ordered section
 * modules under ./api-integration/sections/. This file is the entry point: it
 * prints the banner, runs the sections IN ORDER, then prints the summary.
 */

import { strict as assert } from 'assert';

// ── Load modules (CommonJS path since Next transpiles to CJS in .next) ────────
// We test the pure logic layer directly — avoids needing the HTTP server up.

// Path aliases resolved manually
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Use tsx/ts-node to import TS modules if available, otherwise test compiled .js
// For simplicity we test the logic inline, mirroring the exact functions used.

import { summary } from './api-integration/harness.mjs';
import { run as runPatientAccess } from './api-integration/sections/01-patient-access.mjs';
import { run as runProviderAccess } from './api-integration/sections/02-provider-access.mjs';
import { run as runPayerToPayer } from './api-integration/sections/03-payer-to-payer.mjs';
import { run as runPriorAuth } from './api-integration/sections/04-prior-auth.mjs';
import { run as runInfrastructure } from './api-integration/sections/05-infrastructure.mjs';
import { run as runCrossPatient } from './api-integration/sections/06-cross-patient.mjs';
import { run as runP2pEnhancement } from './api-integration/sections/07-p2p-enhancement.mjs';

// ═══════════════════════════════════════════════════════════════════════════════
//  TESTS START HERE
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`);
console.log(`  RHTP API Integration Test Suite — All Tabs × All Patients`);
console.log(`  ${new Date().toISOString()}`);
console.log(`${'═'.repeat(60)}`);

// Order matters — the sections print as they run and must stay in this sequence.
runPatientAccess();
runProviderAccess();
runPayerToPayer();
runPriorAuth();
runInfrastructure();
runCrossPatient();
runP2pEnhancement();

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
summary();
