# D5: Deployment Configuration Specification (deploy.config.yaml + IaC layout + CI flow + v1/v2 phasing)

Status labels: CURRENT = verified against the live codebase (Phase 0: no IaC assets exist anywhere; the app runs `next dev` with a single HAPI Docker container; X3 is greenfield). Everything else in this document is TARGET state, designed within ADR-004 (one Terraform repo, three layers, fixed module interface, AWS + Azure first, Google fast-follow), doctrine 5/7, and C7 (core depends on exactly five protocols: Postgres wire, Kafka API, S3-compatible object storage, OIDC, OCI container runtime).

Governing rule, restated once: `deploy.config.yaml` is the single input. v1 drives Terraform through CI; v2's admin-console Deployment screen renders and drives the same engine, never a second one. The deployment guide for each cloud is rendered from this file (doctrine 9: generatable content is never hand-maintained).

---

## 1. deploy.config.yaml schema

One file per deployment (single-tenant per state, DP-5: isolation by deployment, never code branching). The schema below is the complete v1 key set: every key, its type, allowed values, and default. Validation is a JSON Schema committed beside the Terraform repo (`deploy/schema/deploy.config.schema.json`); CI rejects a config that does not validate, that names an unimplemented cloud/choice combination, or that violates a cross-field rule (§1.1).

```yaml
# deploy.config.yaml (schema v1)
# Every key shown with: type, allowed values, default.
# "managed" choices name the hyperscaler service the IaC layer provisions;
# "self" choices are self-hosted on the Kubernetes cluster. Core code never
# knows which was chosen (C7): every choice is reachable over the same protocol.

schemaVersion: "1.0"            # string, semver major.minor; required; no default

deployment:
  name: ny-pilot                # string, [a-z0-9-]{3,32}; required; resource-name prefix
  environment: staging          # enum: dev | staging | prod; default: dev
  tenant: ny-medicaid           # string; single tenant per deployment (DP-5); required
  scale: pilot                  # enum: pilot | state; default: pilot
                                #   selects sizing profiles (worker floors, partition
                                #   counts, HAPI node counts per load model §3-5)

cloud:
  provider: aws                 # enum: aws | azure | google; default: aws
                                #   google is a fast-follow stub in v1 (§2.4): schema-
                                #   valid, plan-refused with a clear error until implemented
  region: us-east-1             # string; validated against the provider's region list; required
  availabilityZones: 3          # integer, 2..3; default: 3 (prod requires 3; see §1.1)

network:
  vpcCidr: "10.40.0.0/16"       # string, CIDR; default: "10.40.0.0/16"
  privateOnly: true             # boolean; default: true (all data-plane services private;
                                #   ingress only via the load balancer)
  allowedIngressCidrs: []       # list<string CIDR>; default: [] (deny-all beyond LB)

# ---- Per-tier managed-vs-self choices (ADR-004; the heart of the file) ----
# Each tier: mode (managed | self) plus the bounded service choice per cloud.
# C7 guarantee: the protocol column is what core code sees; nothing else leaks.

tiers:

  fhirStore:                    # protocol seen by core: FHIR REST over HTTPS (doctrine 6 seam)
    mode: self                  # enum: self | managed; default: self
                                #   self = HAPI JPA cluster (reference implementation)
                                #   managed = conformance-gated adapter (roadmap); v1 CI
                                #   REFUSES mode: managed until the doctrine-6 conformance
                                #   suite passes against the named service (§5 checklist item 7)
    managedService: none        # enum: none | aws-healthlake | azure-health-data-services
                                #   | google-cloud-healthcare-api; default: none
                                #   must be none when mode: self; must match cloud.provider
    hapi:
      nodes: 2                  # integer, 1..8; defaults by scale: pilot=2, state=4
      postgres:                 # HAPI's backing store; always provisioned with the store
        mode: managed           # enum: managed | self; default: managed
                                #   managed: aws=RDS Postgres, azure=Flexible Server,
                                #   google(stub)=Cloud SQL. self: CloudNativePG-class
                                #   operator on-cluster. Protocol either way: Postgres wire
        vcpu: 4                 # integer; defaults by scale: pilot=4, state=16 (load model §5)

  queue:                        # protocol seen by core: Kafka API (ADR-002)
    mode: managed               # enum: managed | self; default: managed for prod, self for dev
    managedService: aws-msk     # enum: none | aws-msk | azure-event-hubs-kafka
                                #   | google-managed-kafka; default matches provider
                                #   (aws-msk | azure-event-hubs-kafka | google-managed-kafka);
                                #   must be none when mode: self
    selfService: redpanda       # enum: redpanda; default: redpanda (the self-hosted
                                #   reference, single binary, no ZooKeeper)
    partitionProfile: pilot     # enum: pilot | state; default: follows deployment.scale;
                                #   sets topic partition counts per load model §3
                                #   (domain-events 12/96, signals 6/48, dispositions 6/24,
                                #   DLQ mirrored 1:1); set at topic creation, never rekeyed
    topicRetentionDays: 90      # integer, 7..365; default: 90 (operational buffer only;
                                #   history lives in the outbox table per amendment-001 §3)

  workflowEngine:               # journey lane (doctrine 3); protocol: Temporal gRPC to its
                                # own service; Temporal-class self-hostable REQUIRED in core
    mode: self                  # enum: self; default: self. There is NO managed value:
                                #   Step Functions / Durable Functions / cloud-proprietary
                                #   workflow services are banned from core by doctrine 5.
                                #   Temporal Cloud (protocol-compatible hosted Temporal) is
                                #   a permitted future enum value gated on an ADR amendment,
                                #   not a config choice; schema v1 does not offer it.
    engine: temporal            # enum: temporal; default: temporal
    persistence: shared-postgres # enum: shared-postgres | dedicated-postgres;
                                #   default: shared-postgres (pilot), dedicated-postgres (state)
    workers: 2                  # integer, 1..16; defaults by scale: pilot=2, state=4

  orchestrator:                 # batch DAG lane (ADR-003); reached ONLY through the
                                # orchestrator-neutral step contract (SEAM: dag-orchestrator);
                                # streams never run here
    mode: managed               # enum: managed | self; default: managed
    managedService: aws-mwaa    # enum: none | aws-mwaa | azure-adf-managed-airflow
                                #   | google-cloud-composer; default matches provider;
                                #   none when mode: self
    selfService: airflow-on-k8s # enum: airflow-on-k8s; default: airflow-on-k8s
    dagSource: repo             # enum: repo; DAG definitions are data in the app repo
                                #   (pipelines/dags/*.yaml), rendered at deploy (ADR-003)

  database:                     # application Postgres: projections, outbox, evidence ledger,
                                # staging/quarantine/catalog, Temporal persistence when shared.
                                # Protocol seen by core: Postgres wire, nothing else
    mode: managed               # enum: managed | self; default: managed
    managedService: aws-rds-postgres
                                # enum: none | aws-rds-postgres | azure-postgres-flexible
                                #   | google-cloud-sql-postgres; default matches provider;
                                #   none when mode: self
    selfService: cloudnative-pg # enum: cloudnative-pg; default: cloudnative-pg
    vcpu: 4                     # integer; defaults by scale: pilot=4, state=16
    haReplicas: 1               # integer, 0..2; default: 1 (prod requires >=1; see §1.1)
    backupRetentionDays: 35     # integer, 7..3650; default: 35 (the 7-year evidence/audit
                                #   retention is table-level policy plus archival export to
                                #   object storage, not solely instance backups)

  objectStore:                  # landing zone, artifacts, archival. Protocol: S3-compatible API
    mode: managed               # enum: managed | self; default: managed
    managedService: aws-s3      # enum: none | aws-s3 | azure-blob-s3-compat
                                #   | google-gcs-s3-compat; default matches provider.
                                #   Azure note: blob is fronted by an S3-compatible gateway
                                #   (MinIO gateway-class) provisioned by the azure module so
                                #   core speaks S3 API only (C7); ASSUMPTION: gateway posture
                                #   acceptable vs native-SDK adapter, revisit at first Azure deploy
    selfService: minio          # enum: minio; default: minio
    landingRetentionYears: 7    # integer, 1..10; default: 7 (DP-5 audit policy, configurable)
    quarantineTtlDays: 30       # integer, 7..90; default: 30, alarmed expiry (DP-5)

  identity:                     # AuthN for platform services + ops surfaces. Protocol: OIDC
    mode: managed               # enum: managed | self; default: managed
    managedService: aws-cognito # enum: none | aws-cognito | azure-entra-id | google-identity-platform
                                #   default matches provider; none when mode: self
    selfService: keycloak       # enum: keycloak; default: keycloak
    issuerUrl: ""               # string URL; computed output when managed; required input
                                #   when an external enterprise IdP is used

  kubernetes:                   # runtime for app services, workers, projectors, self-hosted
                                # tiers. Protocol: OCI containers; the cluster itself is IaC
    mode: managed               # enum: managed | self; default: managed
                                #   managed: aws=EKS, azure=AKS, google(stub)=GKE
                                #   self: reserved for on-prem futures; v1 CI refuses self
    nodeProfile: pilot          # enum: pilot | state; default: follows deployment.scale
                                #   (sizes node pools for worker floors: 16 loader workers,
                                #   match-scoring pods, consumers per load model §4)

observability:
  stack: bundled                # enum: bundled | byo; default: bundled
                                #   bundled = Prometheus/Grafana/Loki-class on-cluster (open
                                #   protocols); byo = ship OTLP to an endpoint the operator names
  otlpEndpoint: ""              # string URL; required when stack: byo
  alarmReceiver: ""             # string (email or webhook URL); required for prod (§1.1);
                                #   receives reconciliation, quarantine-TTL, DLQ, lag alarms

app:
  imageTag: ""                  # string; required; the app release being deployed
  mockMode: false               # boolean; default: false. The seam switch (C3 rule 3): true
                                #   deploys with mock sources selected; demo stays green.
                                #   prod refuses mockMode: true (§1.1)
  featureFlags: {}              # map<string, boolean>; default {}; passed through to the app
                                #   (AI guardrail 6: flagged features degrade gracefully)
```

### 1.1 Cross-field validation rules (enforced by the schema validator in CI)

1. `environment: prod` requires `availabilityZones: 3`, `database.haReplicas >= 1`, `network.privateOnly: true`, `observability.alarmReceiver` set, and `app.mockMode: false`.
2. `managedService` values must match `cloud.provider` (an `aws-*` service under `provider: azure` is a validation error, caught before any plan).
3. `mode: self` requires the tier's `managedService: none` and vice versa.
4. `tiers.fhirStore.mode: managed` is refused in v1 regardless of other fields, with an error naming the conformance gate (doctrine 6; §5 item 7). The key exists now so the schema does not break when the gate opens.
5. `cloud.provider: google` validates but `plan` refuses with "google modules are fast-follow stubs" until the google implementations land (§2.4).
6. `deployment.scale: state` requires `queue.partitionProfile: state` (partition counts are set at topic creation and never rekeyed mid-flight; a pilot-profile state deployment would be un-fixable without topic recreation, so the validator blocks it).

---

## 2. Terraform module layout

CURRENT: none of this exists (Phase 0 item 5). TARGET: one Terraform repo, `deploy/` (ASSUMPTION: co-located in the app monorepo under `deploy/` rather than a separate repo, keeping docs-as-code and config-to-code versioning atomic; a split is mechanical later).

```
deploy/
  schema/
    deploy.config.schema.json        # §1 validator, the single source the docs render from
  configs/
    ny-pilot.aws.yaml                # one committed config per live deployment
    ny-staging.aws.yaml
  engine/
    render.ts                        # config -> tfvars per layer + selected module set
    validate.ts                      # schema + cross-field rules (§1.1)
    docs-gen.ts                      # renders the deployment guide from config + schema
  modules/
    interface/                       # THE fixed module interface (ADR-004): typed variable
                                     # and output contracts per tier; no resources here
      core.contract.tf               #   network, k8s cluster, postgres, object store, queue
      platform.contract.tf           #   fhir store, temporal, orchestrator, identity, observability
      app.contract.tf                #   services, BFF, projectors, workers, ingress
    aws/
      core/                          # VPC, EKS, RDS, S3, MSK (or Redpanda-on-EKS when self)
      platform/                      # HAPI cluster, Temporal, MWAA (or Airflow-on-EKS), Cognito
      app/                           # k8s manifests/helm for services, workers, projectors
    azure/
      core/                          # VNet, AKS, Flexible Server, Blob+S3 gateway, Event Hubs
                                     #   Kafka (or Redpanda-on-AKS when self)
      platform/                      # HAPI, Temporal, ADF-managed Airflow (or self), Entra ID
      app/                           # same app layer, cloud-agnostic by construction
    google/                          # FAST-FOLLOW STUB (§2.4)
      core/    STUB.md
      platform/ STUB.md
      app/     -> symlink-equivalent reuse of the shared app layer
  stacks/
    main.tf                          # composes interface + selected per-cloud modules from
                                     # rendered tfvars; three layers, ordered core -> platform -> app
  conformance/
    portability-check.sh             # §5 checklist automation
    fhir-conformance/                # doctrine-6 suite (seeded by G3's validation harness)
```

### 2.1 The module interface (one interface, N implementations)

`modules/interface/` defines, per tier, the variables a module must accept and the outputs it must publish. Outputs are protocol endpoints and credentials references only, matching C7 exactly:

| Tier | Required outputs (the contract) |
|---|---|
| database | `postgres_host`, `postgres_port`, `credentials_secret_ref` |
| queue | `kafka_bootstrap_servers`, `credentials_secret_ref` |
| objectStore | `s3_endpoint`, `s3_region`, `credentials_secret_ref` |
| identity | `oidc_issuer_url`, `client_registration_refs` |
| kubernetes | `cluster_endpoint`, `kubeconfig_secret_ref`, node pool names per profile |
| fhirStore | `fhir_base_url` (FHIR REST; HAPI or, post-gate, managed) |
| workflowEngine | `temporal_frontend_address` |
| orchestrator | `dag_deploy_target` (where rendered DAGs are shipped) |
| observability | `otlp_endpoint`, `dashboards_url` |

The interface is the ADR-004 migration seam: adding GCP is a fourth implementation directory satisfying the same contracts, zero core-code change. A module that needs an output outside this table is proposing a sixth protocol dependency, which is an ADR-level decision (C7), not a module author's choice.

### 2.2 The app layer is cloud-agnostic by construction

`app/` modules consume only interface outputs (endpoints + secret refs injected as k8s secrets/env). There is exactly one app layer implementation shared across clouds; per-cloud `app/` directories contain only thin wiring where a cloud's k8s flavor requires it (ingress class, storage class names). Any conditional on `cloud.provider` inside app-layer templates beyond that wiring is a portability leak (§5 item 3).

### 2.3 Sizing profiles

`deployment.scale` selects a profile data file (`deploy/profiles/{pilot,state}.yaml`) carrying the load-model-derived numbers: partition counts (§3), worker floors (16 loaders at state, match-pod counts, consumer counts, §4), HAPI nodes and Postgres vcpu (§5). Profiles are data; a sizing change is a data PR with the load model cited, never an edit to module code.

### 2.4 Google fast-follow stub

`modules/google/` ships in v1 as: the directory structure, `STUB.md` per layer naming the target services (GKE, Cloud SQL Postgres, GCS S3-compat, Google Managed Kafka, Cloud Composer, Identity Platform, Cloud Healthcare API as the eventual conformance-gated FHIR option), the interface contracts it must satisfy (identical, by definition), and a CI guard that lets `google` configs schema-validate but refuses `plan` with a clear message. The stub exists so the schema, docs, and configurator UI never fork when the implementation lands.

---

## 3. CI flow: config change to deployed stack (v1)

TARGET. Trigger: a PR touching `deploy/configs/*.yaml`, `deploy/modules/**`, or a release tag updating `app.imageTag`.

1. **Validate.** `engine/validate.ts` runs JSON Schema + §1.1 cross-field rules. Fail = PR red with the named rule.
2. **Render.** `engine/render.ts` produces per-layer tfvars + the selected module set for the config's provider and modes. Rendered output is uploaded as a build artifact (inspectable, diffable).
3. **Docs gate.** `engine/docs-gen.ts` regenerates the deployment guide for the touched config; a config change whose regenerated guide differs from the committed one fails until the guide is committed too (doctrine 9: docs-stay-current, mechanically).
4. **Portability check.** `conformance/portability-check.sh` (§5 automation) runs against the rendered plan. Fail = red, no plan output retained.
5. **Plan.** `terraform plan` per layer in order (core, platform, app) against the target workspace; plan artifacts posted to the PR. Nothing applies from a PR.
6. **Approve.** Human approval on the PR (prod additionally requires a second approver, ASSUMPTION pending owner policy). Merge to main is the apply authorization for dev/staging; prod apply requires a release tag plus the environment gate.
7. **Apply, layered.** CI applies `core`, waits healthy, applies `platform` (runs HAPI migrations, creates Kafka topics at the profile's partition counts, registers OIDC clients), then `app` (deploys services/workers/projectors at profile sizes, ships rendered DAGs to `dag_deploy_target`).
8. **Post-deploy verification.** Smoke: every interface output reachable over its protocol; C5 demo-green walkthrough against the deployed app (mock ON path always; mock OFF per swapped screens); the D4 NOW-class harness smoke. Prod: verification failure triggers automated rollback of the app layer (previous imageTag) and pages; core/platform rollbacks are runbook-gated, never automatic.
9. **Record.** Deployment record (config hash, plan hash, imageTag, approver, verification results) appended to the evidence ledger (ADR-005) so deployments are audit-visible like every other privileged action.

State-scale note: the first `apply` for a `scale: state` config creates topics at state partition counts (validator rule 6); scaling pilot to state is a new deployment, not an in-place mutation (single-tenant doctrine).

---

## 4. v1 vs v2 phasing (doctrine 7, honest)

**v1 (config + IaC): everything in §1..§3.** The operator's interface is a YAML file and a PR. Deliverables: schema + validator, aws/ and azure/ module implementations, google/ stub, CI flow, generated deployment guides, portability checklist automation. Definition of done: `ny-staging.aws.yaml` deploys clean end-to-end from an empty account through post-deploy verification; the azure config reaches the same bar (per-cloud validated walkthrough docs are build-gated on exactly these first clean deploys, D7).

**v2 (admin-console Deployment screen): the face on the same engine.** A BFF-served screen (BFF-only invariant applies) that: renders the current config from the repo, presents the §1 choices as a form driven by the same JSON Schema (one source of truth; the form is generated from the schema, never hand-mirrored), validates via the same `validate.ts`, and on submit opens the config PR through the repo API. The screen never applies infrastructure directly: it drives the §3 CI flow, inheriting its approvals, evidence records, and rollback behavior. Progress and plan output surface in the screen by reading CI status. Explicitly out of scope for v2: any second execution path, any screen-side Terraform, any cloud credential in the browser or the BFF beyond repo-API scope. v2 ships only after both v1 clouds have a validated walkthrough; a screen in front of an unproven engine would be demo theater, which doctrine 7 exists to prevent.

---

## 5. Portability conformance checklist (no proprietary control plane leaked into core)

Run: item 1..5 automated in CI on every deploy PR (`portability-check.sh`); item 6..9 at each release; all nine before any new cloud or managed-service swap is declared supported. A failure is a portability leak: fix or ADR, never waive silently.

1. **Dependency allowlist (C7).** Static scan of core `package.json` + lockfile + import graph: no hyperscaler SDKs (`aws-sdk`/`@aws-sdk/*`, `@azure/*` except OIDC-generic, `@google-cloud/*`) in app/service/worker/projector code. Cloud SDKs may appear only under `deploy/modules/**`. Automated, blocking.
2. **Protocol probe.** From inside the cluster, core services' outbound connections resolve to exactly: Postgres wire, Kafka API, S3 API, OIDC issuer, container registry pulls, plus declared observability OTLP. Anything else (cloud metadata-service dependence at runtime, proprietary queue endpoints) fails. Automated via egress audit, blocking.
3. **App-layer conditional scan.** Grep rendered app-layer manifests for `cloud.provider` conditionals beyond the declared thin-wiring set (ingress class, storage class). Automated, blocking.
4. **Workflow-engine ban.** No Step Functions / Durable Functions / Logic Apps resources anywhere in `platform` or `app` layers; Temporal is the only workflow engine present (doctrine 5). Automated (resource-type scan of the plan), blocking.
5. **Secret and identity shape.** Credentials reach core only as interface `credentials_secret_ref` k8s secrets; no IAM-role-specific API calls in core (IRSA/workload-identity bindings live in modules, invisible to code). Automated, blocking.
6. **Cross-cloud parity run.** The same app imageTag + equivalent config deploys on aws and azure and passes identical post-deploy verification (C5 walkthrough + D4 harness smoke). Divergent behavior is a leak by definition. Manual trigger, release-gated.
7. **FHIR-store seam gate (doctrine 6).** `mode: managed` for the FHIR store stays refused until the conformance suite (seeded from G3's validation harness fixtures) passes against the named managed service; the suite result is the gate artifact, recorded in the evidence ledger. Release-gated.
8. **Backbone swap drill.** A staging deployment flips `queue` between self (Redpanda) and the cloud's managed Kafka via config only; the D4 backbone contract test (publish/subscribe/replay) passes unchanged. Proves the Kafka-API seam is real, not aspirational. Release-gated, per cloud.
9. **Exit rehearsal (the honest final proof).** Annually or before any new-cloud commitment: restore a deployment onto the other supported cloud from config + landed data + outbox export, and run the C5 walkthrough green. A platform that cannot rehearse leaving a cloud has a proprietary dependency somewhere the scans missed. Runbook-gated (D7 build-gated doc; its doneGate is the first successful rehearsal).

---

## 6. Docs and register hooks (C8)

| audience | document | stateLabel | class | doneGate | generatedFrom |
|---|---|---|---|---|---|
| deployment | per-cloud deployment guide | target-state until first clean deploy | build-gated | first clean end-to-end deploy on that cloud | rendered from deploy.config.yaml + schema (docs-gen.ts) |
| deployment | environment matrix + upgrade/rollback procedure | target-state | build-gated | first staging upgrade executed via the flow | hand-authored on D7 template |
| operations/SRE | deployment runbook (apply failure modes, layered rollback, exit rehearsal) | target-state | build-gated | first prod deploy + first rehearsal | hand-authored |
| engineering | deploy/ module interface reference | current-state once modules land | build-gated | interface contracts compile + parity run green | generated from interface .tf contracts |
| compliance/audit | deployment evidence description (ledger records per §3.9) | mixed-labeled | build-gated | first evidence-recorded deploy | hand-authored |
