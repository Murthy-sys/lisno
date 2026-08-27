# Lisno repository operating instructions

## Working contract

- Lead with the outcome, evidence, and recommended approach. Keep facts, assumptions, and recommendations distinct.
- Give concise decision rationale and concrete evidence; do not expose private chain-of-thought.
- Honor the requested mode. A request to review, diagnose, or plan does not authorize implementation. Return plan/spec artifacts in chat unless the user explicitly requests repository documents or has authorized implementation that includes them. A request to implement includes proportionate local verification, but not deployment, production mutation, commits, pushes, or customer communication.
- Preserve unrelated work. This repository may already be dirty: capture the initial dirty-path set and the relevant per-target diff before writers start. Never overwrite, revert, stage, or reformat changes outside the assigned scope, and do not assign a dirty target until its existing changes are understood and ownership is explicit.
- Use `$lisno-implementation-planner` for substantial or high-risk work. A small, obvious, localized change should be handled directly without planning ceremony.

## Classify the work

- **Small:** localized behavior or copy/style change, no shared contract, data, security, or workflow decision. Inspect, implement the bounded fix, and run a focused check.
- **Substantial:** multiple files or workspaces; a product workflow or API contract; persistence; permissions; finance; email; OCR; migration; or an uncertain cross-boundary defect. Publish a working brief before behavior-changing edits.
- **High-risk:** authentication/RBAC, immutable approvals, financial calculations or lineage, schema/data migration, destructive operations, external mail/files, or production effects. Gather evidence, state invariants and options, and stop at the exact approval boundary when execution lacks authority.

For substantial work, make the development approach visible before coding:

1. Current behavior and evidence, including the traced source of truth or root cause.
2. Proposed behavior, scope/non-goals, invariants, and acceptance criteria.
3. Two or three real options and tradeoffs when a material choice exists, with the recommended option first. Do not invent alternatives when the repository already establishes one credible approach.
4. Data/state transitions, permission matrix, compatibility, failure handling, migration/rollback, side effects, and observability as applicable.
5. A dependency-ordered task plan with explicit ownership and verification. Keep only one parent task in progress.

Ask only about a choice that materially changes behavior, architecture, data, security, or scope and cannot be inferred safely. Otherwise state the evidence-backed assumption and proceed. When repository documents are authorized, persist a cross-cutting, high-risk, or multi-session design and plan under:

- `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`
- `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`

Historical plans, specs, test counts, and `CODEX_IMPLEMENTATION_PLAN.md` are background, not current truth. Reconcile them with current code and the latest user request.

## Multi-agent execution

- Delegate proactively when two or more bounded questions or non-overlapping implementation slices can progress independently. Do not spawn agents for ceremony.
- Start substantial work with independent read-only audits when useful: data/source-of-truth, API/authorization, frontend consumers/UX, migration, and regression coverage.
- Give every child one concrete deliverable, explicit subsystem or file ownership, relevant invariants, and a no-overlap boundary.
- The primary agent owns product interpretation, cross-layer contracts, the integrated plan, shared files, and final reconciliation.
- After the contract is settled, implementation agents may work in parallel only on non-overlapping paths. Share discovered contract changes immediately; do not let agents invent incompatible fallbacks.
- Run `integrity_reviewer` after substantial/high-risk work or shared-contract writes and `verification_runner` after those writers are finished. Tests during concurrent edits can observe transient shared-worktree state, so final verification must run on the integrated result. Keep the small-work path direct.
- Treat agent output as evidence to review, not automatically correct conclusions. Wait for all assigned work, reconcile disagreement, inspect the final diff, and report what was actually verified.
- A custom role's `sandbox_mode = "read-only"` is a default, not hard isolation: live parent permissions can override it and connectors have their own permissions. For a security-sensitive audit, set the parent turn to read-only and avoid write-capable connectors.

Preferred custom roles are `implementation_planner`, `product_ux_architect`, `backend_implementer`, `frontend_implementer`, `ocr_implementer`, `integrity_reviewer`, and `verification_runner`.

## Architecture boundaries

### Backend (`backend/`)

- TypeScript, Express, Mongoose, and NodeNext ESM. Preserve `.js` suffixes on relative imports in TypeScript.
- Preserve the established mixed boundaries: domain rules normally live in `src/domain`; shared public shapes may live in `src/contracts`, while route/service-local schemas remain local; HTTP belongs in `src/routes`, orchestration in `src/services`, and persistence shapes in `src/models`.
- Repository-backed and direct-Mongoose paths both exist intentionally. Keep memory and Mongo implementations aligned when a repository contract changes; preserve an established direct-Mongoose path unless a deliberate refactor is in scope. Route file access through `src/storage` abstractions.
- Keep protected routes synchronized with the canonical route-operation authorization registry and OpenAPI inventory. Runtime Zod validation remains authoritative even when OpenAPI marks a schema as generic.
- Transactions require a Mongo replica set. Do not weaken transaction semantics just to make a non-replica test pass.

### Frontend (`frontend/`)

- React, Vite, and TanStack Query. Keep API types aligned with backend contracts; backend authorization remains authoritative.
- Handle loading, empty, error, stale-data, permission, responsive, keyboard, and accessible-name states where relevant.
- Invalidate or update every affected query after mutations. Never manufacture financial or workflow values in the UI to hide missing backend data.
- For substantial UI work, settle the product/UX brief before browsing 21st components. When the `21st` MCP is available, use it to compare fitting patterns and reuse the established design system; obtain approval before any install/generation that writes files, and never publish, edit, or delete remote library content without explicit authorization.

### OCR worker (`ocr-worker/`)

- Preserve the leased-job protocol: lease, heartbeat, token, result, retry, and manual-review behavior.
- Keep extraction output compatible with backend contracts. Model-dependent tests are opt-in; the default verification lane is non-model tests.

## Product invariants

- **Authorization/identity:** source permission decisions from backend route operations and authorization services. Super Admin access must remain operation-specific, scoped, auditable, and non-disclosing; the sole active Super Admin identity is immutable. Keep built-in demo identities/secrets loopback-development-only. Do not enable public production Client signup/project claiming until email ownership is verified before project linking and session issuance. Keep frontend visibility synchronized but never treat it as enforcement.
- **Approvals/workflow:** Estimate and Design approval records are immutable history. Preserve actor identity, client-on-behalf proof, version/CAS checks, audit events, deduplication, idempotency, and deterministic downstream task generation.
- **Finance:** use integer paise internally and make any whole-rupee conversion explicit at boundaries. Trace all screens to one approved-estimate source. Exclude GST before margin calculations, preserve the approved baseline, classify expenses explicitly, derive overheads only from ledger entries, and test project/detail/portfolio reconciliation with at least two unequal projects.
- **Email/invitations:** invitation create/resend must preflight delivery. Disabled or unavailable mail produces no token, invitation, audit, or email write.
- **Email/publication:** Estimate publication and Design-plan review-round submission commit independently from external delivery. Persist a safe disabled/failed state, retry the same stored artifact and semantic round idempotently, and test disabled, failed, successful, concurrent, and retry paths without exposing credentials, private links, or tokens.
- **Identity/data lineage:** carry stable IDs across list, detail, mutation, and audit paths. Names and labels are presentation, never join keys.
- **Risk/KPI/deadlines:** derive risk and KPI on the backend. Preserve immutable original deadlines, require reasoned/audited deadline changes, and keep manager/head evaluations separate from calculated KPI.
- **Uploads/storage:** keep uploads behind authenticated endpoints using opaque storage references. Preserve signature/type validation and compensating cleanup whenever object or metadata persistence fails.

## Safety and repository hygiene

- Do not stage, commit, push, deploy, seed, backfill, run a write migration, or mutate production unless the user explicitly authorizes that exact action and target.
- Treat seed scripts as destructive. For migrations, require backup/rollback, dry-run evidence, conflict reporting, idempotency, and a final dry run before any live execution.
- Never expose secrets, tokens, client files, private URLs, or personal data in output, fixtures, logs, or screenshots.
- Do not add dependencies or modify lockfiles unless the task needs them. Explain the reason and verify the affected build.
- Required tests, builds, and visual QA may create ignored temporary outputs. Report their paths, do not retain them unnecessarily, and never commit runtime artifacts, caches, screenshots, coverage, uploaded files, local databases, or build outputs unless they are requested deliverables.
- There is no repository lint script. Never claim lint passed unless a lint command is added and actually run.

## Verification

Start with focused regression tests, then broaden according to shared-contract and risk impact. Trace verification to every acceptance criterion.

- Backend focused: `cd backend && npm test -- tests/<relevant>.test.ts`
- Backend full: `cd backend && npm run typecheck && npm test && npm run build`
- Frontend focused: `cd frontend && npm test -- <path-to-test>`
- Frontend full: `cd frontend && npm run typecheck && npm test && npm run build`
- OCR focused: `cd ocr-worker && .venv/bin/python -m pytest -m "not model" tests/<relevant>.py`
- OCR default suite: `cd ocr-worker && .venv/bin/python -m pytest -m "not model"`
- Repository hygiene: `git diff --check` and `git status --short`

Use replica-set integration tests for changed transactional Mongo paths. For every materially user-visible frontend change, include rendered interaction/accessibility checks; add a fuller width/state matrix for redesigns. For permission or finance changes, use asymmetric identities/projects so leakage, stale versions, missing detail, and unit mismatches cannot pass accidentally.

In the final handoff, report the outcome, principal decisions, affected files, exact checks and results, unrun checks, migrations or external actions not performed, and remaining risks. Never call partially verified work complete.
