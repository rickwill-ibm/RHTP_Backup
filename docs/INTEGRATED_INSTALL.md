# Integrated Install — RHTP × CMS-0057-F

Two tiers. **Tier A** is a one-command dev stack that runs the native experience
against a real FHIR data tier (no WSO2 needed) — great for building/reviewing.
**Tier B** stands up the full CMS-0057-F backbone so the payer operations
($member-match, CRD/DTR/PAS, bulk export) work end-to-end.

> **Quick demo (no Docker)?** See the [Demo-Mode Quickstart](#demo-mode-quickstart-no-docker) below.

---

## Demo-Mode Quickstart (no Docker)

Runs entirely on mock/seed data. No FHIR server, no Docker, no API keys required.

```powershell
# Windows — double-click, or:
powershell -ExecutionPolicy Bypass -File setup.ps1   # first-time only (checks Node, writes .env.local)
start-demo.bat                                        # daily launcher
```

```bash
# macOS / Linux / Git-Bash
cp .env.example .env.local          # already has NEXT_PUBLIC_USE_MOCK_DATA=true
npm install
npm run dev                         # http://localhost:4029
```

Key demo URLs once running:

| URL | What it shows |
|-----|---------------|
| `http://localhost:4029` | Demo Navigator (53 steps, 10 personas) |
| `http://localhost:4029/demo-onboarding` | Demo orientation screen |
| `http://localhost:4029/demo-deck` | Guided presentation deck |
| `http://localhost:4029/prior-auth` | Prior Authorization — CRD → DTR → PAS (Step 13, Maria Redhawk) |
| `http://localhost:4029/cms` | CMS-0057-F hub |
| `http://localhost:4029/financial-clearance` | Golden Thread / RCM |
| `http://localhost:4029/network-adequacy` | Network Adequacy copilot |

The **Prior Authorization** experience (`/prior-auth`) is fully integrated into the RHTP app —
no separate `PA-Standalone-SmartApp` process is needed for demo mode. The 5-step shell
(Order → CRD → DTR → Review/HITL → PAS Status) runs on mock data with Maria Redhawk
pre-loaded (CPT 72148, lumbar MRI).

---

## Tier A — One-Command Integrated Dev Stack

**Prereqs:** Node 18+/20+, Docker Desktop (with `docker compose` v2).

```bash
# from the repo root
bash install/install.sh            # macOS/Linux/Git-Bash
# or on Windows PowerShell:
powershell -ExecutionPolicy Bypass -File install\install.ps1
```

What it does: creates `.env.local` from the template → `docker compose up` a **HAPI FHIR R4**
server (`:8090`) + **MySQL 8** (`:3306`) → seeds **Maria** → `npm install` → runs `type-check`
+ unit tests → starts RHTP.

Then:
1. Open **http://localhost:4029/cms**
2. Click **Sign in (dev)** — establishes a local dev session (no WSO2).
3. Open **Patient Access** — Coverage / Conditions / PA status render from the live FHIR server.

Manual equivalent (npm scripts):
```bash
cp install/.env.cms0057f.example .env.local
npm run backbone:up
FHIR_GATEWAY_BASE=http://localhost:8090/fhir npm run seed:maria
npm install && npm run type-check && npm run test
npm run dev          # http://localhost:4029/cms
npm run backbone:down   # stop the containers
```

**Scope of Tier A:** Patient Access and FHIR reads (Coverage/Condition/ClaimResponse) work
against real FHIR. The payer operations ($member-match, CRD/DTR/PAS, bulk export) are
Ballerina/WSO2 operations — they return gracefully until Tier B is up.

> `ALLOW_DEV_MOCK_AUTH=true` enables the local dev session. **Set it to `false` for anything
> shared** — then real SMART login (Tier B) is required.

---

## Tier B — Full CMS-0057-F Backbone

Use the reference implementation (`C:\demo\reference-implementation-cms0057f`).
Summarized from its README §4–§8:

1. `./scripts/setup-platform.sh` — downloads + starts WSO2 APIM 4.6 + IS 7.3 + OH Accelerator 2.1.
2. Configure **IS as Key Manager** + **SMART on FHIR** (reference §4.3).
3. Start the reference **FHIR server** (`:9090`) and load sample data; create **MySQL** `cms0057f` and run both `init_db.sql`.
4. `./scripts/start-services.sh` — start the 5 Ballerina services + publish APIs (`apictl set --http-request-timeout 180000` first).
5. Register an **OAuth application** in the APIM Dev Portal; note client id/secret and set redirect `http://localhost:4029/api/auth/callback`.
6. In RHTP `.env.local`, fill the **Tier B** block in `install/.env.cms0057f.example` (gateway/CDS/bulk bases, `WSO2_*`), set `FHIR_GATEWAY_BASE` to the **gateway**, and `ALLOW_DEV_MOCK_AUTH=false`.
7. Restart `npm run dev`.

Then verify (backbone-gated gates):
```bash
# real SMART login round-trip
open http://localhost:4029/api/auth/login       # → IS → /api/auth/callback → /cms
# BFF authz: 200 with a session, 401 without
curl -i http://localhost:4029/api/fhir/Patient/MARIA_SD_001
# contract tests against the reference Postman collection
npm run test:contract
```

Deploying instead to **WSO2 Devant** (managed) avoids running WSO2 locally — deploy the
Ballerina services there and point the Tier B env at the cloud endpoints (reference README §10).

---

## Port Map (Dev)

| Service | Port | Note |
|---------|------|------|
| RHTP (Next.js) | 4029 | `npm run dev` |
| HAPI FHIR (Tier A) | 8090 | avoids the :8080 clash |
| MySQL | 3306 | user root / pw `rhtp` (dev) |
| WSO2 APIM gateway (Tier B) | 8243 | FHIR/CDS/bulk APIs |
| WSO2 IS (Tier B) | 9453 | SMART authorize/token |
| Reference fhir-service (Tier B) | 8080 | behind the gateway |

## Troubleshooting

- **FHIR not ready:** `npm run backbone:logs`; HAPI can take ~30–60s on first boot.
- **:8080 in use:** Tier A uses 8090 on purpose; keep RHTP's own FHIR off 8080 if you run it too.
- **Patient Access shows "sign in" forever:** confirm `ALLOW_DEV_MOCK_AUTH=true` in `.env.local` and click **Sign in (dev)**.
- **Docker missing:** install Docker Desktop, or use Tier B's reference FHIR server instead of the container.
- **Prior Auth shows blank page:** confirm `NEXT_PUBLIC_USE_MOCK_DATA=true` in `.env.local`; the DTR mock path requires this flag.
