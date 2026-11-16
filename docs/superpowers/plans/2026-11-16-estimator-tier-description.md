# Estimator tier description task plan

Date: 2026-11-16
Status: Implemented and verified in Mode A; T1–T4 complete, with one documented pre-existing API-documentation test failure
Approved specification: [Tier description in estimator details](../specs/2026-11-16-estimator-tier-description-design.md).

## Implementation boundary

Add the selected tier's Description above the existing specification list in the estimator and Configuration Client view. Resolve descriptions on the backend using the same paragraph formatter as Configuration. Use default Mode only when the selected tier has no usable description source; preserve the approved malformed/disabled-data guards. Resolve descriptions independently of specifications.

Keep the existing `tierDetails` specification shape and introduce optional catalogue metadata:

```ts
tierDescriptions?: Partial<Record<KnowledgeModeTier, string | null>>;
```

Each entry is the resolved display paragraph or null. This separate map permits a description to display when specifications are unavailable without changing their existing empty/unavailable meaning. It is not accepted in estimate saves and does not participate in edit fingerprints. Missing metadata from older responses is supported.

The backend build is rooted at `backend/src`; it cannot directly import the current shared TypeScript formatter without changing build boundaries. Follow the repository's existing shared specification-name pattern: move only the dependency-free paragraph formatting implementation to `backend/src/domain/knowledge-mode-description.ts`, and preserve the existing shared module's public exports through a forwarding wrapper. Keep the Configuration editor's behavior unchanged; do not move its broader parsing/UI modules or change build configuration.

## T1. Capture baseline and settle source validation

Owner: primary. Acceptance criteria: AC2, AC3, AC6 preparation.

- Capture the execution-start dirty-path list, target diffs/copies, and hashes under `/tmp/lisno-tier-description-qa`. Preserve all earlier changes; inspect each dirty target before assigning it.
- Reproduce the missing description in the existing catalogue/disclosure fixtures. Record the previously known API-documentation enum failure separately.
- Trace the existing Mode payload validation and canonical PMC/in-house selection used by Configuration. Reuse validation where possible; ensure invalid/ambiguous rows and disabled retained content cannot be treated as an empty tier. Do not resolve legacy identities by display name.
- Confirm source identity, applicable-tier filtering, current revision selection, custom text synchronization, generated paragraph eligibility, and the 4,000-character bound before starting writers. An absent custom string alone does not trigger Mode fallback if the tier has a valid saved configuration that generates its paragraph.

## T2. Add descriptions end to end

Depends on T1. Keep this as the only parent task in progress while its bounded slices execute.

### Shared formatting and contract foundation

Owner: primary. Owned paths:

- `backend/src/domain/knowledge-mode-description.ts` (new pure formatter)
- `shared/knowledge/knowledgeModeDescription.ts` (preserve public exports and validation behavior)
- `frontend/src/features/leads/estimationCatalogueApi.ts`
- `backend/src/openapi.ts`
- `backend/tests/api-docs.test.ts`
- This plan and specification status records during execution

Move the formatter without changing wording, inclusion/exclusion synchronization, or ordering. Use narrow structural input types for the scope lists so both backend projection and the existing frontend configuration objects can call it. Do not add backend/server imports to the browser dependency graph beyond the pure module. Add the optional `tierDescriptions` map to frontend types and OpenAPI, with only the three estimation tiers and nullable bounded strings.

Make the formatter interface and DTO shape available before the backend and frontend writers use them. Run existing formatter tests to verify the extraction preserves Configuration behavior. The primary owns any shared-file adjustment discovered later.

### Backend projection slice

Owner in Mode A: `backend_implementer`. Owned paths:

- `backend/src/domain/estimator-tier-description.ts` (new description-only resolver)
- `backend/src/services/estimator-catalogue.service.ts`
- `backend/tests/estimator-tier-description.test.ts` (new)
- `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`

Project the paragraph from the advanced section already loaded for the same verified Main Line/current revision. Add the backend DTO field in the service. Prefer a valid configured selected-tier paragraph, including generation from saved canonical configurations; use valid configured default Mode only for ordinary absence. Return null for malformed/ambiguous selected data or disabled retained content. Validate the final synchronized/generated output as well as custom input. Expose only the paragraph.

Do not modify the specification resolver, pricing logic, revision resolver, stored Configuration, eligibility, or mutation contracts. Verify unequal tiers and Main Lines, draft precedence, applicability, custom/generated text, missing/empty/invalid namespaces, disabled retained content, default fallback, and private-field exclusion. Cover description-only and specification-only results independently. Assert existing rates and specification lists remain unchanged.

### Frontend display and hydration slice

Owner in Mode A: `frontend_implementer`. Owned paths:

- `frontend/src/features/leads/configuredEstimate.ts`
- `frontend/src/features/leads/configuredEstimate.test.ts`
- `frontend/src/features/leads/estimateDraftFingerprint.test.ts`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx`
- `frontend/src/features/estimates/EstimateLineTierDetails.tsx`
- `frontend/src/features/estimates/EstimateLineTierDetails.test.tsx`
- `frontend/src/features/estimates/estimate-line-tier-details.css`

Carry `tierDescriptions` through draft creation and both refresh paths; clear it whenever the current source is missing/incompatible. Pass only the selected applicable tier's paragraph into the existing shared disclosure. Render it as plain text before specifications, with preserved line breaks and natural wrapping. Keep the disclosure open across tier changes and retain its keyboard behavior.

When a paragraph exists but specifications are unavailable, use specification-specific feedback rather than saying all details are unavailable. Keep previous feedback for responses lacking all metadata. Do not add a second frontend fallback, an expansion-time request, new headings, or new controls. Keep styles limited to paragraph spacing/wrapping and preserve current typography/colors.

Test tier switching, refresh/removal, independent room rows, read-only use, missing metadata, text escaping, and description/specification state combinations. Confirm metadata changes neither serialize into save requests nor mark drafts dirty, and that expansion leaves inclusion, quantity, and rate unchanged.

### Parallel execution rules

Only after task-plan approval and execution-mode selection: in Mode A, the backend and frontend slices can run concurrently after the primary's contract/formatter foundation is settled. Their owned files do not overlap. Use native agents, explicitly state shared-worktree preservation requirements, and route any requested ownership expansion to the primary. In Mode B, the primary performs all slices inline. No agents are needed at the current planning gate.

## T3. Integrate and review

Depends on all T2 writers. Owner: primary; use `integrity_reviewer` in Mode A, equivalent inline review in Mode B.

Review the integrated delta against the baseline. Trace paragraph source and fallback independently from specification fallback, verify scope/revision identity, nullable API behavior, source clearing, final output limits, and exclusion from persistence/pricing/fingerprints. Confirm the formatter extraction introduces no Configuration behavior change or browser server dependencies. Resolve confirmed findings before final verification.

## T4. Verify the integrated result

Depends on T3. Use `verification_runner` for focused tests/typechecks in Mode A; primary owns builds, browser inspection, local runtime confirmation, and preservation. In Mode B, primary performs verification inline. Do not run a workspace's typecheck concurrently with its build.

From `backend/`:

```sh
npm test -- tests/estimator-tier-description.test.ts tests/estimator-tier-details.test.ts tests/api-docs.test.ts
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts -t 'estimator configured catalogue and estimate|estimate per-line Mode tiers|tier details|tier description'
npm run typecheck
npm run build
```

Use only the isolated replica-set test database for test writes. Keep the known unrelated API-documentation enum assertion separately identified; all new description/schema checks must pass.

From `frontend/`:

```sh
npm test -- --maxWorkers=2 src/features/estimates/EstimateLineTierDetails.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/estimateDraftFingerprint.test.ts src/features/ai-estimator-knowledge/knowledgeModeDescription.test.ts src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx
npm run typecheck
npm run build
```

Inspect both views in the local browser at desktop and mobile widths using synthetic data. Check paragraph order, multiline/long text wrapping, custom/generated/fallback content, tier switching while open, keyboard expansion/focus, description-only/specification-only/unavailable states, overflow, and accessibility. Confirm expansion makes no writes and preserves financial controls. Reuse the existing QA harness where practical.

Refresh the existing local backend through its no-seed development launcher if needed to load the implementation. Verify the reported local Main Line read-only against its saved current Configuration without logging sensitive data or changing it. Keep the pre-existing frontend server running.

Finish with `git diff --check`, `git status --short`, and a baseline preservation comparison. Record exact results and any known failure, unrun suites, and artifact paths. Close owned browser sessions. No lint script exists; do not claim lint passed. No dependency installation, seed, migration, commit, push, production deployment, or external communication is planned.

## Acceptance trace

| Criterion | Implementation | Verification |
| --- | --- | --- |
| AC1: both views display paragraph above specifications | Shared disclosure and both callers | Consumer tests and desktop/mobile browser checks |
| AC2: saved/custom/generated description and safe Mode fallback | Shared formatter and backend resolver | Formatter regression, unequal source fixtures, read-only reported record |
| AC3: current source and applicability, invalid/disabled guards | Backend projection and frontend source clearing | Helper/catalogue cases with distinct Main Lines and revisions |
| AC4: useful partial states and accessible rendering | Disclosure text/CSS and selection handling | Rendered states, escaping, keyboard and width checks |
| AC5: unchanged prices, persistence and dirty state | Additive metadata and explicit existing serializers | Price/spec regressions, refresh/fingerprint/no-write tests |
| AC6: compiled integrated changes and preserved work | All slices and final review | Focused suites, typechecks/builds, baseline diff comparison |

## Handoff

After execution, append exact checks/results, principal changed paths, remaining limitations, and QA artifacts under `/tmp/lisno-tier-description-qa`. Report the outcome without presenting the pre-existing API test failure as a new regression or claiming unrun checks passed.

## Completion record

The catalogue now exposes independent `tierDescriptions` display metadata. Both views render the selected paragraph above specification names/brands in the existing disclosure. Source refresh replaces or clears paragraph metadata without changing saved values or dirty fingerprints. Paragraphs remain plain text with preserved line breaks and wrapping; no new controls, colors, or typography were introduced.

The existing paragraph formatter was moved without changing its implementation, with the shared module forwarding the same exports. Its narrow structural input type accepts existing optional scope-item IDs. The new backend resolver validates only consumed description inputs, distinguishes absence from malformed/disabled retained content, and resolves custom/generated tier descriptions or a safe current Mode fallback. Specification and price projection remain unchanged.

The independent source audit and final integrity review found no confirmed defects. Review also verified that the formatter extraction retained its implementation and that the final optional-ID type correction changed no runtime behavior.

### Exact checks and results

The commands in T4 were run on the integrated worktree.

| Check | Result |
| --- | --- |
| Backend description/specification helper and API-documentation suites | 178 passed, 1 unchanged baseline failure; exit 1 |
| Backend catalogue/estimate replica subset | 76 passed, 41 intentionally filtered skips; exit 0 |
| Frontend eight focused suites | 193 passed; exit 0 |
| Backend and frontend typechecks | Both exit 0 |
| Backend and frontend builds | Both exit 0; existing Vite large-chunk warnings remain |
| `git diff --check`, status inspection, baseline preservation | Passed; only assigned paths and these two status documents changed |

Total final focused tests: **447 passed, 1 pre-existing failure, 41 filtered skips**. The unchanged failure is `backend/tests/api-docs.test.ts` **documents scoped Mode tiers without accepting whole namespace maps**, which expects three Configuration scopes and omits `default`. All new description and schema checks pass. An initial sandboxed API test attempt could not bind local listeners; the final approved local-socket run removed those environment failures. Initial frontend typechecking caught the formatter's narrow scope-item type rejecting existing object-literal IDs; the type-only correction was reviewed and both typechecks/builds then passed.

New rendered description regressions failed before the UI implementation. The formatter's existing tests passed after extraction. Full unrelated suites, OCR and mobile-workspace suites were not run for this bounded change. No lint script exists.

### Browser and local data evidence

Both estimator and Configuration Client view passed browser checks at 1440px and 390px using synthetic data generated through the actual backend description resolver. Checks covered custom, generated, and Mode fallback paragraphs; paragraph order above specifications; open-state retention across tier changes; Enter/Space expansion; description-only, specification-only, empty and unavailable states; and clearing old text after refresh. A 1,250-character multiline paragraph with an unbroken word wrapped on mobile in both views without horizontal overflow.

Expansion preserved quantity, inclusion, displayed rates/amounts, and request counts. All observed requests were reads. Neither view reported rendering errors or automated accessibility violations. Existing surrounding-control incomplete accessibility checks are recorded in `browser-summary.json`. Synthetic Super Admin catalogue-read permission was supplied only in the browser fixture response, without modifying authorization sources. Screenshots were visually inspected, and owned browser sessions were closed.

Read-only verification of the reported local **POP false ceiling** record confirms that its Signature paragraph matches Configuration's displayed saved paragraph. That record currently has no paragraph or canonical saved Mode configuration for Premium, Functional, or default Mode, so the other tiers correctly have no description to display or borrow. Stored Configuration hashes, prices, and specification lists were unchanged. The read connection disabled automatic index/collection creation.

The existing local backend/rules/OCR development launcher was refreshed using the unchanged no-seed command. The running API now serves the description contract; the existing frontend server remains running. No saved data or accounts were provisioned or modified.

### Changed paths and artifacts

The implementation touched the 16 existing code/test targets listed in T2 and added `backend/src/domain/knowledge-mode-description.ts`, `backend/src/domain/estimator-tier-description.ts`, and `backend/tests/estimator-tier-description.test.ts`. Baseline hashes confirm unrelated work was preserved and no existing files disappeared.

Evidence is under `/tmp/lisno-tier-description-qa`: `final-*.log`, `final-task-diff.patch`, `final-preservation.json`, `browser-summary.json`, desktop/mobile screenshots, `local-before.log`, `local-after.log`, and `local-runtime-check.json`. Initial failure logs are retained separately. Build outputs are ignored under `backend/dist/` and `frontend/dist/`; no QA harness or runtime artifact was added to the repository.

No dependencies, lockfiles, schema/persistence changes, migrations, seeds, commits, pushes, production deployments, or external communications were performed.
