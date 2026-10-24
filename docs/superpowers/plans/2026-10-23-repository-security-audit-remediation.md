# Repository security audit and remediation task plan

Date: 2026-10-23
Status: Specification and task plan approved on 2026-10-23. User selected Mode A. Audit, remediation and integrity review complete; local verification and final handoff recorded, with baseline failures and unverified deployment/runtime limits.

Source of truth: [Approved specification](../specs/2026-10-23-repository-security-audit-remediation-design.md). Its header describes the original proposal; the subsequent user approval is recorded here without changing the approved specification during the task-plan gate.

## Outcome and constraints

Audit every tracked subsystem, remediate confirmed in-scope vulnerabilities, and deliver a redacted findings report with before/after dependency evidence and verified regression results. A finite audit must not be described as proof that the application has no vulnerabilities.

React Native and Expo dependency changes remain excluded, including SDK-coupled packages and transitive overrides that would patch that family. Record their existing advisories as user-deferred. Independent first-party mobile defects and demonstrably unrelated dependencies remain eligible for remediation without crossing this exclusion.

Do not deploy, stage, commit, push, seed, migrate data, rotate credentials, rewrite history, contact customers, or probe production. Do not download model weights, run inference, or build the assistant container on this Mac. Use synthetic data, isolated databases, stubbed mail/providers, and bounded adversarial inputs. No private source or secrets may be uploaded to scanners.

## Baseline and durable deliverables

- At task-plan creation, the only dirty path is the untracked approved specification. Preserve it and any work added before implementation; capture a fresh status and per-target diff before assigning writers.
- Reuse valid preliminary npm reports under `/tmp/lisno-security-audit-2026-10-23/`; rerun if their inputs change or provenance is insufficient. The baseline records 15 backend, 9 web, and 60 mobile flagged package entries, including inherited advisories.
- During approved implementation, create `docs/security/2026-10-23-repository-security-audit.md` as the primary-owned coverage and findings report. Do not create that report at this planning gate.
- Keep raw scans, scanner environments, isolated installs, and visual artifacts in ignored temporary locations. Reports contain commands, tool versions, advisory IDs, redacted evidence, dispositions, and results, not private data or raw secret matches.
- Record acceptance criteria as AC1 through AC7 in the order given in the approved specification.

## Execution and ownership

After task-plan approval, obtain the required execution-mode selection. No subagents start before that selection.

In Mode A, use native Codex agents for bounded independent slices with at most three children running alongside the primary. The primary owns interpretation, the plan/report, shared contracts, root scripts/deployment files, and cross-workspace integration decisions. In Mode B, the primary performs all tasks inline in dependency order without implementation agents.

Every assignment names exact write paths, immutable contracts, required evidence, and its no-overlap boundary. Tell each writer that others are working in the repository: preserve unrelated edits and do not revert or reformat outside the assignment. Read-only auditors return findings to the primary rather than independently editing the shared report. If a finding crosses an ownership boundary, report it before editing; the primary settles the contract and schedules the dependent change.

Maintain one active parent phase at a time:

1. Audit and evidence: T01–T06.
2. Remediation and integration: T07–T10.
3. Integrity review: T11.
4. Final verification and handoff: T12–T13.

Execution record: T01–T06 complete with source-audit findings and dependency/secret scan evidence. T07–T10 complete. T11 review completed with the Render lockfile integration finding corrected. T12–T13 completed for local evidence. Exact target-runtime, native/model and deployment checks remain explicit limitations rather than passed checks. No parent implementation phase remains active.

Implementation ownership refinement: the backend implementer owns dependency/tooling changes, identity repositories/services/routes and related tests. The primary owns the separate PDF/upload/storage resource-protection slice (`middleware/upload.ts`, new PDF budget helpers, workflow evidence middleware, stream/storage helpers and their tests). No writer may modify the other slice. The frontend implementer owns web changes plus the explicitly assigned mobile new-password validation files only; no mobile dependency files. The Python implementer owns both Python services. This split preserves the approved scope and permits non-overlapping work.

Settled contracts: revoke existing sessions monotonically on actual role/active changes; constrain new passwords to at most 72 UTF-8 bytes while preserving legacy login; fence private web responses by session generation and clear other tabs on logout; retain unrestricted workflow media count/size while protecting available disk capacity and concurrent admission; preserve worker lease tokens and allow only configured OCR source destinations. PDF parsing must enforce budgets without global parser monkey-patching. No production or migration action is authorized.

## Dependency-ordered tasks

### T01. Capture reproducible baseline and inventory

**Owner:** Primary. **Dependencies:** Approved plan and selected execution mode. **Acceptance:** AC1, AC6, AC7.

Capture Git revision/status, dirty-path diffs, workspace/runtime versions, manifests, lockfiles, test commands, and available scanners. Classify every tracked directory as application, tooling, configuration, test, documentation, static asset, generated/vendor, or excluded dependency material. Build the report's coverage ledger. Read applicable nested operating instructions before work in each subsystem.

Inventory environment/configuration filenames without printing their values. Establish redacted scanner output handling before inspecting current files or available local history. Review scanner acquisition and dependency installation scripts before allowing execution; install temporary audit tools outside project runtime environments.

**Deliverable:** Initial coverage ledger, baseline provenance, and safe evidence locations. Historical reports are background, not substitutes for current checks.

### T02. Resolve dependency advisory coverage

**Owner:** Primary during the audit phase. **Dependencies:** T01. **Acceptance:** AC1, AC2, AC5, AC7.

Normalize npm results by advisory ID and installed dependency path, preserving production/development distinctions. Trace direct and transitive packages with lockfiles and `npm explain`/`npm ls`; record npm's proposed resolution separately from the chosen fix. Verify primary advisory sources, patched versions, Node requirements, peer constraints, and relevant release notes for each proposed change. Do not use forced automatic fixes.

Audit both assistant lockfiles and the resolved OCR environment with a reputable Python advisory scanner. Resolve any additional optional model dependency metadata in an isolated environment only when possible without model downloads or execution; disclose unresolved coverage. Inspect native parser versions and supplied Docker/base-image configuration. The assistant image is a deployment-supplied build argument, so do not claim a deployed image has been scanned without its actual immutable identity.

Classify all mobile findings by dependency ownership. Leave React Native/Expo-family resolutions untouched. Independently patchable mobile packages require evidence that the selected change neither alters nor overrides that family.

**Deliverable:** Complete advisory register, proposed compatible targets, unresolved upstream/no-patch findings, and explicit exclusions. No package changes in this task.

### T03. Audit backend identity, authorization, and business-data boundaries

**Owner:** Read-only backend authorization auditor; primary in Mode B. **Dependencies:** T01. **Acceptance:** AC1, AC3, AC4, AC6.

Trace registered routes through middleware, operation registry, services, repositories/direct-Mongoose paths, and returned fields. Review login/session revocation, invitations/reset/public tokens, rate limits and proxy assumptions, development identities, Super Admin immutability, project/vendor/client ownership, object-level access, mass assignment, and query/operator inputs.

Review approval/version/audit checks and finance/procurement/configuration source boundaries for unauthorized reads/writes and cross-project identity confusion. Inspect sensitive errors, logs, and caches. Trace list/detail/mutation/download access with at least two asymmetric identities or projects where applicable.

**Boundary:** Read-only `backend/` identity/data/workflow surfaces and related contract consumers. T04 owns content parsing and outbound transport analysis; communicate shared concerns rather than duplicating entire reviews.

**Deliverable:** Source-backed findings with prerequisites and bounded reproductions or clear uncertainties. Existing controls are recorded as controls, not automatically certified by passing tests.

### T04. Audit content ingestion, storage, workers, and outbound transport

**Owner:** Read-only content/transport auditor; primary in Mode B. **Dependencies:** T01. **Acceptance:** AC1, AC3, AC4, AC6.

Trace multipart and document/media inputs through parsers, storage, download endpoints, and worker handoff. Inspect path traversal, symlinks, file types/signatures, resource limits, archive/decompression handling, temporary cleanup, download headers, SSRF/redirects, TLS validation, and secret handling. Review all upload variants rather than only the common middleware.

Inspect SMTP/provider boundaries, service-authenticated worker endpoints, lease/heartbeat/token behavior, assistant provider requests, timeout/retry behavior, and failures that could leak data or bypass authorization. Distinguish parser advisories from application-specific reachability and existing mitigations.

**Boundary:** Read-only relevant `backend/src/middleware`, `storage`, content/transport routes and services. Python internals belong to T06; backend actor/object scope belongs to T03.

**Deliverable:** Findings and targeted negative/positive test recommendations, including cleanup and disabled-mail semantics.

### T05. Audit web and independent mobile application security

**Owner:** Read-only client auditor; primary in Mode B. **Dependencies:** T01. **Acceptance:** AC1, AC3, AC4, AC6.

Inspect web DOM/HTML/URL sinks, redirects, session/logout behavior, per-user query/cache separation, persisted sensitive data, exports/downloads, and client-side configuration. Check that frontend permission assumptions agree with backend contracts without treating visibility as enforcement.

Review first-party mobile secure storage, environment identity, deep links, session-generation races, local file handling/logging, and release settings. Review native configuration as source without prebuild or dependency upgrades. Report framework-family advisories as deferred rather than proposing incidental SDK changes.

**Boundary:** Read-only `frontend/` and first-party `mobile/`; shared contract questions return to the primary.

**Deliverable:** Source-backed findings, client regression targets, and any rendered verification required by a proposed fix.

### T06. Audit Python services and repository/operational surfaces; reconcile findings

**Owner:** Read-only Python auditor for `assistant-service/` and `ocr-worker/`; primary owns repository/history/operations review and final triage. **Dependencies:** T01; final triage waits for T02–T05. **Acceptance:** AC1–AC4, AC6, AC7.

Review Python service authentication, body limits, model endpoint restrictions, allowlisted tool contracts, network/file boundaries, parser resource bounds, cancellation, logging, and the OCR leased-job protocol. Trace Node/Python contract consistency without authorizing the model to supply actor identity, prices, permissions, or arbitrary tool execution.

The primary reviews `shared/`, `contracts/`, root scripts, deployment configuration, process execution, tracked configuration and redacted current-tree/local-history secret scan results. Triage candidate secrets locally without printing values; record test/example false positives. Review runtime/build controls relevant to actual deployed behavior and identify missing external facts.

Merge all evidence into one findings register. Assign priority using severity, reachability, data impact, and fix availability. Confirm exact write ownership, patched dependency choices, contract implications, and regression checks before opening the remediation phase. Prepare any genuinely necessary shared-contract change before dependent writers consume it. Reopen a gate only for a material change to the approved scope/contract, not for normal in-scope findings or supported package-version selection.

**Deliverable:** Reconciled remediation queue with evidence for each entry and explicit coverage/disposition for every subsystem. No speculative vulnerability claims.

### T07. Remediate backend dependencies and confirmed backend defects

**Owner:** One `backend_implementer` with exclusive ownership of approved `backend/` paths, including its manifest, lockfile, configuration, and regression tests. **Dependencies:** T02–T06. **Acceptance:** AC2–AC6.

Apply compatible patched production packages and transitive resolutions, then necessary development-tool upgrades. Preserve NodeNext imports and supported runtime requirements. Address confirmed first-party defects at the server trust boundary. Synchronize route-operation/OpenAPI inventory when affected; preserve repository/direct-Mongoose parity and transaction guarantees.

Run focused tests after each logical fix and record dependency/compiler compatibility adaptations. Never remove assertions or weaken protections to accommodate a package upgrade. Report required shared changes to the primary before editing outside `backend/`.

**Deliverable:** Bounded backend diff, targeted regression evidence, updated dependency inventory, and integration notes.

### T08. Remediate web dependencies and confirmed client defects

**Owner:** One `frontend_implementer` with exclusive ownership of approved `frontend/` paths. Any independent mobile edits require a separately enumerated path assignment to this writer or the primary, with no overlapping writer. **Dependencies:** T02, T05, T06 and any settled backend/shared contract. **Acceptance:** AC2–AC6.

Apply supported router/build/test-tool fixes and necessary compatibility adaptations. Fix confirmed client security defects while preserving intended workflows, backend authority, cache invalidation, and accessible error states. Any mobile dependency change requires recorded independence from the excluded React Native/Expo family.

**Deliverable:** Client diff, focused tests, applicable rendered interaction evidence, and dependency-resolution evidence.

### T09. Remediate Python dependencies and confirmed service defects

**Owner:** One Python-service implementer with exclusive ownership of approved `assistant-service/` and `ocr-worker/` paths; use `ocr_implementer` for worker changes. **Dependencies:** T02, T06 and settled shared contracts. **Acceptance:** AC2–AC6.

Update vulnerable packages and related pinned/ranged dependency declarations consistently. Validate both full assistant and rules-runtime dependency sets. Introduce reproducibility changes only where justified by the approved security finding and environment constraints. Preserve Python support, optional model constraints, native decoding behavior, and leased-job/extraction contracts.

Use isolated test environments and non-model tests. Do not install or invoke an inference runtime, fetch model weights, or build containers on this Mac. Record native/optional/deployed-environment limits explicitly.

**Deliverable:** Service fixes, aligned dependency definitions, non-model regression results, and remaining environment limitations.

### T10. Integrate repository/shared fixes and reconcile the whole worktree

**Owner:** Primary. **Dependencies:** T07–T09 and all writers finished. **Acceptance:** AC1–AC7.

Integrate approved root script/configuration/shared-contract fixes and inspect every changed file against its initial diff. Reconcile cross-workspace types, authorization, worker protocols, dependency compatibility, and scanner evidence. Do not silently extend the mobile exclusion or reset other contributors' work.

Complete missing coverage dispositions and record unresolved findings with severity, reason, mitigation, and required external action. A secret exposure requiring rotation remains unresolved until that external step is authorized and verified; a source edit is not a substitute.

**Deliverable:** Stable integrated worktree and report ready for independent review.

### T11. Review integrated security and contract integrity

**Owner:** Read-only `integrity_reviewer` in Mode A; primary in Mode B. **Dependencies:** T10. **Acceptance:** AC3, AC4, AC6, AC7.

Review the final diff, finding-to-fix traceability, permission/identity boundaries, resource limits, error disclosure, finance/approval invariants, races/cleanup, and dependency/override rationale. Ensure tests exercise the actual defect rather than mirroring implementation. Confirm no React Native/Expo dependency changes slipped into the diff.

Return concrete issues with file/line evidence. Assign corrections to the original owner, then integrate and recheck the affected areas before final verification. Do not run the final verification lane while writers are changing its inputs.

**Deliverable:** Review disposition, resolved review findings, and named remaining risks.

### T12. Run final verification on the integrated result

**Owner:** `verification_runner` in Mode A; primary in Mode B. **Dependencies:** T11 corrections complete and all writers finished. **Acceptance:** AC2–AC7.

Execute the verification matrix below, retaining exact commands and outcomes. Confirm dependency installation reproducibility in a disposable workspace copy that preserves relative shared-package paths; review lifecycle scripts before running a full install. Do not erase or replace unrelated local environments to perform this check. Re-run advisories against the final lockfiles/resolved Python environments and compare deduplicated findings with the baseline.

If a failure requires a source change, return to the relevant owner, integrate it, and rerun affected checks. Treat scanner/network failures as incomplete evidence, never as a clean scan. Record any unrun command and its concrete reason.

**Deliverable:** Verification evidence tied to acceptance criteria, with no reliance on tests run against transient concurrent edits.

### T13. Final report and handoff

**Owner:** Primary. **Dependencies:** T12. **Acceptance:** AC1–AC7.

Inspect final `git diff --check` and `git status --short`, reconcile all report entries, and update task outcomes. Report fixes, principal file changes, exact checks, residual advisories, React Native/Expo exclusions, unscanned environments, and operational steps not performed. Keep temporary artifacts out of versioned changes. Describe unresolved or partially verified work accurately; do not claim that a zero scanner count proves the entire application secure.

## Safe parallel scheduling

- T02 may run in the primary while T03, T04, and T05 run as three independent read-only agents after T01. Start the Python portion of T06 when one child slot becomes free; final T06 triage waits for all audits.
- T07, T08, and T09 may run concurrently only after T06 settles contracts and write ownership. Each workspace has one manifest/lockfile/configuration owner; no simultaneous installs or conflicting writes in that workspace.
- The primary may handle non-overlapping repository/shared preparation during remediation, but integration changes to a writer-owned file wait for that writer or an explicit ownership transfer.
- T10, T11, and T12 are sequential integration, review, and verification gates. Independent checks in T12 may run concurrently only when their data, ports, caches, and output paths are isolated and resource use is bounded.

## Verification matrix

Commands run from the named workspace; use actual files implicated by findings in addition to these established checks. No tests have been run for this task at plan creation.

| Area | Checks and evidence | Criteria |
| --- | --- | --- |
| npm advisory coverage | `npm audit --json --ignore-scripts` in backend/web and any independently changed mobile workspace; retain full scope, runtime classification, advisory IDs, dependency paths, and final dispositions. | AC1, AC2, AC7 |
| Backend identity/authorization | Focused `npm test -- tests/auth.test.ts tests/auth-authorization.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/super-admin-authorization.test.ts tests/audit-security.test.ts`; add invitation/reset/ownership regressions for affected paths. | AC3, AC4 |
| Backend ingestion/storage/workers | Focused `npm test -- tests/uploads.test.ts tests/local-storage.test.ts tests/managed-storage.test.ts tests/project-chat-audio-upload.test.ts tests/extraction-worker.test.ts`; include other upload variants and bounded resource/cleanup reproductions when affected. | AC3, AC4 |
| Mail and public tokens | Existing relevant mailer, invitation, reset, disabled/failed-delivery and retry tests plus precise regressions for changed parser/transport behavior. Assert no external deliveries. | AC3, AC4, AC6 |
| Backend compatibility | `npm run typecheck`, `npm test`, `npm run build`. Use relevant `*.replica-set.test.ts` cases for changed transactional paths; never weaken transactions for a standalone Mongo test. | AC4, AC5 |
| Web compatibility and sessions | Focused auth/API/cache/router tests, then `npm run typecheck`, `npm test`, `npm run build`. Render changed flows with synthetic local data; check denied/expired/error states, keyboard/accessibility and relevant screen widths. | AC3–AC5 |
| Assistant Python | In an isolated environment installed from aligned approved lockfiles and test extras: `python -m pytest -m 'not model'` from `assistant-service/`, including app/runtime/rules tests. Validate rules-only dependency resolution separately. | AC3–AC5 |
| OCR Python | `.venv/bin/python -m pytest -m 'not model'` from `ocr-worker/`, or the equivalent isolated-environment interpreter; focus on worker, extraction, image-format, and shared contract tests when affected. | AC3–AC5 |
| Python advisories | Scan both assistant lockfiles, resolved OCR runtime/test dependencies, and obtainable optional/native metadata. Record scanner version, interpreter/platform, resolved inputs, errors, and excluded/unavailable components. | AC1, AC2, AC5, AC7 |
| Independent mobile changes, conditional | Relevant Jest tests and `npm run typecheck`; use `npm run test:contracts` when shared contracts change. Add targeted export/native verification only if needed without Expo prebuild or upgrades; record unavailable native checks. | AC3–AC5 |
| Reproducibility and secrets | Isolated installs from final lockfiles, final tree/history scan disposition, absence of real secrets in added fixtures/logs/report, and confirmation that deferred SDK resolutions remain unchanged. | AC2, AC5, AC6 |
| Repository hygiene | `git diff --check`, `git status --short`, final diff inspection and report reconciliation. No lint claim: this repository has no lint script. | AC6, AC7 |

## Completion and escalation rules

Complete the implementation only when all approved tasks have a verified outcome and the final report accounts for every finding and coverage gap. User-deferred React Native/Expo work is recorded as excluded; unavailable environments and unresolved in-scope risks remain explicit limitations rather than being marked fixed.

If a newly confirmed issue requires a material contract change, destructive data action, live credential rotation, production access, or history rewrite, prepare a concrete redacted proposal and stop only the dependent action at the applicable authority boundary. Continue independent authorized work. Ordinary compatible dependency selection and in-scope fixes do not require repeated permission requests.

## Final outcome, 2026-10-23

- AC1/AC7: repository coverage, secret-scan limits, individual advisory IDs, fixes and residual risks are recorded in [the audit report](../../security/2026-10-23-repository-security-audit.md) and [advisory register](../../security/2026-10-23-dependency-advisory-register.md).
- AC2/AC5: backend/web npm audits zero; Python runtime/test/model-metadata audits zero; mobile 59 SDK-family entries deferred, with only independent ExcelJS UUID changed. Clean JS installs/builds and Python installations/compatibility checks passed. Render now consumes the OCR lock/constraints and declares Python 3.11.17; local tests ran on 3.11.15 because a temporary 3.11.17 macOS download was unavailable.
- AC3/AC4: first-party identity, session/cache, PDF, disk-admission and OCR transport fixes have focused regressions and independent integrity review. Backend/Python bridge 24 passed, web changed-flow/vendor 213 passed, mobile 31 passed, assistant 274 passed, OCR 388 passed in clean and updated local environments.
- AC4 verification limits: backend broad run retains 13 assertions reproduced on original HEAD; timeout cases passed on rerun. Web broad evidence retains 73 baseline failures; the additional vendor readiness case passed after correction. No claim of globally green suites.
- AC6: no commit/stage/push/deployment, production mutation, migration, seed/bootstrap, mail delivery, secret rotation, model inference or container build. Temporary evidence/build artifacts are documented and excluded from deliverables.

The finite local audit is not proof of absence of all vulnerabilities. Exact target-runtime execution, optional native/model inference, deployment images and the documented resource limits require environment-specific verification before rollout.
