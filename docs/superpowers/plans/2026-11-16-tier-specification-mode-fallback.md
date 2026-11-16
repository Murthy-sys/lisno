# Selected-tier specification fallback task plan

Date: 2026-11-16
Status: Implemented and verified in Mode A; T1–T4 complete, with one documented pre-existing API-documentation test failure
Approved specification: [Selected-tier specification fallback to Mode](../specs/2026-11-16-tier-specification-mode-fallback-design.md).

## Outcome and implementation boundary

Resolve specification display data on the backend: use a valid nonempty selected-tier list first; use valid saved Mode (default) specifications when that tier's namespace/list is absent or its list is empty. Both existing frontend consumers receive the resolved result through the unchanged `tierDetails` shape.

Preserve whole-list scope ownership: names and brands come from the same selected scope and verified current Main Line revision. Do not merge lists, substitute brands from another scope, or apply this fallback to rates. Malformed selected-tier data and retained nonempty data in an unconfigured/disabled tier remain unavailable. Without a safe Mode fallback, retain existing empty/unavailable feedback.

No UI redesign, new endpoint, dependency, persistence change, Configuration save-flag repair, or stored-data copy is planned. The local runtime was refreshed during diagnosis, but it will need to load the completed correction before the final local check.

## T1. Preserve work and reproduce the missing mapping

Owner: primary. Acceptance criteria: AC2, AC6 preparation.

- Capture an execution-start dirty-path list, relevant diffs, and hashes under `/tmp/lisno-tier-mapping-fix-qa`; retain the earlier diagnosis snapshots separately. All target files already contain approved earlier work.
- Confirm current projection behavior with the existing helper tests. Add the failing regression through the backend slice in T2: configured empty Signature plus two valid default specifications; Premium/Functional namespaces absent. The expected resolved list must come from default, with its own brands.
- Confirm the known unrelated API-documentation enum failure remains separately identified. Do not broaden this correction to fix it.

## T2. Implement fallback and consumer regressions

Depends on T1. This is the only parent task in progress during implementation.

### Backend slice

Owner in Mode A: `backend_implementer`. Owned paths:

- `backend/src/domain/estimator-tier-details.ts`
- `backend/tests/estimator-tier-details.test.ts`
- `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`

Keep the existing public helper and response shape. Internally distinguish an absent/valid-empty list from invalid data before choosing a fallback; a generic null result must not automatically select default. Reuse the safe projection for either scope. Resolve default only from the same supplied pricing section and require a valid configured default payload. Keep current name/ID validation, brand resolution, ordering, and private-field exclusion.

Update the prior tests that intentionally prohibited all default fallback. Preserve tests proving nonempty tiers take precedence and no active-revision, other-tier, or other-Main-Line borrowing occurs.

Cover all three tiers, empty versus missing lists, missing versus malformed namespaces/payloads, default absent/empty/unconfigured/malformed, retained disabled-tier specifications, and unresolved brand names that must not borrow a default brand. Use reused IDs with different labels in two Main Lines and in tier/default scopes. Test the actual Mongo catalogue projection, latest draft precedence, temporary items, applicability filtering, and unchanged financial fields. No service-query change is expected because the current query already loads `payload.tierConfigurations`.

### Frontend regression slice

Owner in Mode A: `frontend_implementer`. Owned paths:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx`

Use the existing catalogue DTO to exercise backend-resolved Mode details alongside a different tier-specific list. Verify both views render only names and bracketed brands, preserve expansion across tier changes, and leave inclusion, quantity, rate, and mutation calls unchanged. Keep missing API metadata unavailable; do not implement a second fallback in the frontend. No component or stylesheet changes are expected.

### Contract/documentation slice

Owner: primary. Owned paths:

- `backend/src/openapi.ts`
- `backend/tests/api-docs.test.ts`
- `frontend/src/features/leads/estimationCatalogueApi.ts` (documentation comment only)
- This task-plan file and implementation status metadata after execution begins.

Update descriptions/comments from exact-tier-only to selected-tier-first with safe default Mode fallback. Keep the schema, optionality, field whitelist, response keys, and mutation contracts unchanged. Preserve the pre-existing project-initiation documentation changes in the same files.

### Parallelism and coordination

After task-plan approval and execution-mode selection, the three T2 slices can run concurrently because their paths do not overlap. In Mode A use native subagents only, give each its explicit ownership, and tell each writer to preserve other changes in the shared worktree. In Mode B the primary performs all slices inline. The primary owns integration and any unexpected shared-file need; agents must report it before expanding their boundaries.

## T3. Integrate and review

Depends on all T2 writers. Owner: primary; independent `integrity_reviewer` in Mode A, inline review in Mode B.

Trace current Main Line/revision selection through the fallback resolver, API whitelist, local draft hydration, and both displays. Check malformed-versus-empty decisions, scope-local brand resolution, missing source clearing, and exclusion from price calculation, explicit save serialization, and dirty fingerprints. Resolve confirmed findings before final verification. Do not change the current pricing or revision-selection rules.

## T4. Verify the integrated result and running local app

Depends on T3. In Mode A, `verification_runner` owns focused tests and typechecks after writers finish; primary owns builds, browser/runtime inspection, and preservation reconciliation. In Mode B, primary runs these sequentially. Do not run a workspace's typecheck concurrently with its build.

From `backend/`:

```sh
npm test -- tests/estimator-tier-details.test.ts tests/api-docs.test.ts
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts -t 'estimator configured catalogue and estimate|estimate per-line Mode tiers|tier details'
npm run typecheck
npm run build
```

Use only the isolated replica-set test database for test writes. The known API-documentation failure is the older four-scope Mode enum assertion; the new/updated tier-details checks must pass independently.

From `frontend/`:

```sh
npm test -- --maxWorkers=2 src/features/estimates/EstimateLineTierDetails.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/estimateDraftFingerprint.test.ts
npm run typecheck
npm run build
```

Refresh the existing local development launcher without seeding or provisioning accounts, using the same loopback target. Verify the reported POP false ceiling record read-only: its empty Signature and absent additional lists should resolve the two current Mode specifications and associated brands. Do not alter stored Configuration to make the example pass.

Inspect the estimator and Configuration Client view using safe local/synthetic data at desktop and mobile widths. Cover default fallback, a different nonempty tier taking priority, missing fallback, keyboard expansion, and no amount/inclusion/write changes. Reuse existing layout checks rather than repeating the prior full responsive matrix unless a visual regression appears. Keep customer data and credentials out of screenshots/logs.

Finish with `git diff --check`, `git status --short`, and execution-baseline preservation comparison. Close owned QA browser sessions, retain evidence under `/tmp/lisno-tier-mapping-fix-qa`, and leave the current local app running. No commit, push, production deployment, migration, seed, or external communication.

## Acceptance trace and handoff

| Criterion | Implementation | Verification |
| --- | --- | --- |
| AC1: tier data takes precedence | Backend helper | Unequal tier/default helper and catalogue cases |
| AC2: empty/missing tier uses current Mode | Backend helper | Three-tier regression, actual Mongo projection, read-only reported record |
| AC3: invalid/unrelated sources stay unavailable | Backend helper and existing source guards | Malformed states, retained data, two Main Lines, draft precedence |
| AC4: same display in both views | Existing consumers plus frontend regression slice | Rendered tests and desktop/mobile browser check |
| AC5: financial/persistence/private boundaries intact | Projection whitelist; unchanged calculation/save paths | Price regression, no-write/fingerprint checks, integration review |
| AC6: compilation and preservation | All slices | Typechecks/builds, focused suites, final diff/hash review |

Record exact results, changed paths, local runtime verification, generated artifact paths, unrun checks, and remaining limitations here at completion. There is no lint script. Broaden testing only for a demonstrated additional impact or new failure.

## Completion record

The backend helper now separates absent scopes/empty lists from malformed data before resolving a fallback. It chooses the complete specification list and brand lookup from one scope. Nonempty configured tier lists retain priority; retained nonempty disabled lists and malformed selected-tier data remain unavailable. The existing service query, source resolver, prices, and frontend components/styles were unchanged.

The three parallel slices changed only their eight assigned files. Consumer regression tests were extended without adding a frontend fallback. OpenAPI and the frontend DTO comment describe the resolved display data while retaining the existing schema. Independent integrity review compared all eight targets to the execution-start copies and found no confirmed defects.

### Verification results

The exact commands are in T4 above. Final verification ran on the integrated worktree after review.

| Check | Result |
| --- | --- |
| Original helper baseline | 33 passed; the new reported-shape regression failed before implementation |
| Backend helper + API-documentation suites | 137 passed, 1 unchanged baseline failure; exit 1 |
| Backend catalogue/estimate replica subset | 71 passed, 41 intentionally filtered skips; exit 0 |
| Frontend five focused suites | 137 passed across 5 files; exit 0 |
| Backend and frontend typechecks | Both exit 0 |
| Backend and frontend builds | Both exit 0; Vite reports large-bundle warnings |
| `git diff --check` and final status inspection | Exit 0; no unexpected path/content changes |

The sole test failure is the older `backend/tests/api-docs.test.ts` assertion **documents scoped Mode tiers without accepting whole namespace maps**, which omits `default` from Configuration's four-scope enum. It is unchanged from the recorded baseline. All 63 helper tests and the updated resolved-tier API schema assertion passed. Total final focused checks: 345 passed, 1 pre-existing failure, 41 filtered skips. No unrelated full suites, OCR, or mobile checks were run; no lint script exists.

### Local data and rendered checks

Read-only verification of the actual local **POP false ceiling** record passed: Signature, Premium, and Functional each resolve both saved Mode specifications, with exact associated brand matches. The preserved original helper returned an empty Signature list and unavailable additional tiers for the same record. Stored Configuration hashes and the catalogue's rates, tier pricing, and base-availability fields remained unchanged. The connection disabled automatic collection/index creation; no database data was changed.

The existing loopback backend/rules/OCR launcher was gracefully refreshed after the correction. The running backend's API documentation confirms the new fallback rule is loaded. The same no-seed launcher and local database were used; no account provisioning occurred. The pre-existing Vite server remains running.

Browser checks used synthetic catalogue data generated by the actual backend helper: Signature/Functional resolved a two-item Mode list, while Premium retained its own different list and brand. The estimator and Configuration Client view both passed at 1440px and 390px, including keyboard expansion, tier switching while expanded, empty/unavailable states, and clearing old fallback text. Expansion preserved quantity, inclusion, displayed rates/amounts, and request counts. All observed requests were reads; both screens reported no rendering errors, no overflow, and zero automated accessibility violations. Existing surrounding controls have incomplete accessibility checks recorded in the browser summary. Synthetic Super Admin catalogue-read permission was supplied only in the browser fixture response; no authorization source was modified.

### Artifacts and preservation

Evidence is under `/tmp/lisno-tier-mapping-fix-qa`: `final-*.log`, `browser-summary.json`, desktop/mobile screenshots, `local-projection-before.log`, `local-projection-after.log`, `local-runtime-check.log`, and `final-preservation.json`. Execution-start hashes and per-target task-delta patches show that only the eight assigned targets and these specification/plan status records changed; all earlier unrelated work remains intact. No new or disappeared worktree paths were introduced during execution.

Owned QA browser sessions were closed. Build outputs are ignored under `backend/dist/` and `frontend/dist/`; no temporary harness was added to the repository. No dependencies, lockfiles, persistence/schema changes, migrations, seeds, commits, pushes, production deployments, or external communications were performed. The current local app is left running with the fix.
