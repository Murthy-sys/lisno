# Repository security audit and remediation

Date: 2026-10-23
Status: Approved on 2026-10-23; Mode A implementation completed, local verification and report reconciliation recorded, with explicit baseline/deployment limitations. Baseline statements below describe the specification-stage evidence; see the audit report for final results.

## Goal and user direction

Audit the Lisno codebase and its dependencies, fix confirmed security vulnerabilities within the approved scope, and provide reproducible evidence and an explicit account of remaining risks.

The user subsequently directed: “we can ignore react/native or expo for now.” React Native and Expo dependency remediation is therefore deferred. Existing findings in that dependency family remain recorded rather than presented as resolved. This exclusion does not apply to the React web application, backend, Python services, or independent first-party mobile security defects that can be fixed without changing the deferred dependency family.

## Current behavior and evidence

The working tree was clean at the start of this request. The tracked inventory contains 3,674 files, including `backend/`, `frontend/`, `mobile/`, `assistant-service/`, `ocr-worker/`, `shared/`, `contracts/`, and operational scripts and deployment configuration. File inventory is not a claim that every file has received a security review.

Read-only `npm audit --json --ignore-scripts` scans completed for all three JavaScript workspaces. Each returned exit code 1 with a valid advisory report. Initial sandbox DNS failures were retried with network approval; the successful reports are the evidence used below.

| Workspace | Critical | High | Moderate | Total flagged package entries |
| --- | ---: | ---: | ---: | ---: |
| Backend | 3 | 9 | 3 | 15 |
| Web frontend | 2 | 6 | 1 | 9 |
| Mobile, including deferred dependencies | 1 | 52 | 7 | 60 |

These are vulnerable package entries, including transitive and inherited findings. They are not counts of unique vulnerabilities, confirmed exploits, or separate application defects. Development tooling and deployed runtime exposure must be classified separately.

Initial evidence is retained temporarily at `/tmp/lisno-security-audit-2026-10-23/`: `backend-npm-audit.json`, `frontend-npm-audit.json`, `mobile-npm-audit.json`, and `ocr-worker-installed.json`. These outputs must not be committed. A durable, redacted findings report will retain the information needed to reproduce conclusions during implementation.

### Dependency findings requiring remediation assessment

| Installed package | Observed advisory severity | Context and assessment needed |
| --- | --- | --- |
| Backend `multer@2.2.0` | High | Production upload parser; evaluate the reported malformed multipart, resource exhaustion, and cleanup issues against all upload entry points. |
| Backend `nodemailer@9.0.5` | High | Production mail transport; evaluate parser, validation, DNS/TLS, and message-processing advisories. Preserve disabled-mail and delivery-state semantics. |
| Backend `sharp@0.35.4` | High | Production native image processing; assess the reported bundled librsvg issue and accepted input formats. |
| Backend `music-metadata@11.15.0` | Moderate | Production media parsing; verify exact affected releases and adversarial input handling. |
| Backend `proxy-addr@2.0.7` | Critical | Transitive address/trusted-proxy advisory. Actual exposure depends on proxy configuration; do not enable or broaden trusted proxies to address it. |
| Web `react-router-dom@7.18.1` | High | Inherited router advisory; distinguish used client-side APIs from any server-only affected features. |
| Web `vite@6.4.3` | High | Development/build dependency; assess development-server and build-time exposure separately from deployed static assets. |
| Backend and web `vitest@3.2.7`, `tinypool@1.1.1` | Critical | Test tooling and transitive worker issues. npm proposes a major Vitest upgrade; compatibility and regression validation are required. |
| Mobile `shell-quote@1.10.0` | Critical | Transitive build/tooling command-injection advisory. Record its dependency path; defer changes when owned by the excluded React Native/Expo family. |

Other npm findings include redirect handling, query parsing, URI/YAML handling, generated IDs, and source maps. The final findings register must cover every advisory, rather than only the examples above.

Mobile's flagged entries largely inherit advisories from shared transitive dependencies. npm's proposed fixes include downgrading Expo and React Native to older major release families. Such suggestions are not an approved or validated remediation strategy. No React Native/Expo upgrade, downgrade, or transitive override will be applied in this scope.

The assistant service has pinned runtime lockfiles. OCR declares Python dependency ranges and optional PaddleOCR/PaddlePaddle model dependencies; no committed OCR lockfile was identified in the initial inventory. An inventory of 71 installed OCR-environment distributions was captured using package metadata only. Python vulnerability scanning, optional-model resolution coverage, native library coverage, and container/base-image assessment remain outstanding. Missing lockfiles or unavailable scanners are coverage concerns, not automatically exploitable defects.

### Source reconnaissance and existing controls

Initial source inspection found established protections that remediation must preserve:

- `backend/src/services/auth.service.ts` verifies HS256 tokens, expiry, current user status, role, and session version. Built-in development authentication uses the socket peer and loopback restrictions.
- `backend/src/middleware/auth.ts` validates Bearer syntax; route authorization has a canonical operation registry.
- `backend/src/middleware/cors.ts` uses an explicit origin allowlist. Public identity endpoints have rate-limiting middleware.
- Upload validation includes file-size limits, content/signature checks, bounded PDF inspection, opaque storage references, and cleanup paths. These controls do not by themselves disprove dependency parser advisories.
- Managed storage uses restrictive file permissions and no-follow file opens. Other storage paths require their own threat-model review.
- Assistant service endpoints have token checks, bounded request bodies, and restricted model endpoint configuration.
- `mobile/src/core/session/tokenVault.ts` uses secure storage with environment separation and session-generation fencing. `mobile/app.config.ts` rejects local HTTP in production configuration.

No exploitable first-party defect has yet been confirmed by this preliminary review. Authentication, authorization, data-access paths, deployment posture, and secrets coverage are not certified by this reconnaissance.

## Scope

| Area | Required review |
| --- | --- |
| Backend HTTP and persistence | Route authentication/authorization coverage; role, tenant, project and object ownership; mass assignment; input validation; query/operator injection; field disclosure; pagination and resource bounds; error/log sanitization. |
| Identity and public workflows | Login, JWT/session revocation, password reset, invitations, public links, token lifetime/replay, enumeration, rate-limit bypass, development-only identities, and immutable Super Admin rules. |
| Sensitive business workflows | Approval/version checks, audit attribution, destructive operations, file access, finance/procurement data exposure, concurrency and idempotency where security-sensitive. |
| Files, documents, media and OCR | Multipart parsing, signature/type mismatch, path traversal, symlinks, archive/decompression exhaustion, parser time/memory limits, temporary-file cleanup, download headers, worker lease/token boundaries. |
| Outbound requests and services | SSRF/redirects, URL validation, TLS, service credentials, mail and provider payload boundaries, timeouts, assistant/model tool boundaries, and untrusted extracted content. |
| Web frontend | XSS and DOM sinks, URL navigation, uploads/downloads, session storage and logout, cache separation between users, sensitive data rendering, client configuration, and dependency/build tooling. |
| Mobile first-party code | Session and environment separation, deep links, file handling, sensitive persistence/logs, and release configuration. Fix independent confirmed defects only when they do not require deferred React Native/Expo dependency changes. |
| Python and native dependencies | Assistant lockfiles, OCR runtime and optional model dependencies, relevant native parsers, supported runtime versions, and supplied container configuration. Record unresolved or unavailable environment coverage explicitly. |
| Repository and operations | Tracked configuration, redacted secret detection including available local Git history, process execution, build scripts, deployment headers/settings, dependency provenance and reproducibility. Do not upload private source to external scanning services. |
| Shared contracts and consumers | Cross-workspace identity and authorization assumptions, API validation, worker contracts, and sensitive fields crossing boundaries. |

Every tracked subsystem must have a coverage disposition: reviewed, generated/vendor content with its upstream dependency assessment, deferred under the user's exclusion, or blocked with a specific reason. Prioritize executable code and security boundaries over prose and static assets; a coverage record must not imply exhaustive formal proof.

## Non-goals and exclusions

- React Native/Expo dependency remediation, including SDK-coupled packages, native dependency upgrades, and overrides intended to patch that deferred dependency family.
- Product redesign, unrelated refactoring, or replacing the authentication architecture without a demonstrated need.
- Production scanning or penetration testing, real customer account/file access, production data changes, deployments, commits, pushes, or external communications.
- Secret rotation, history rewriting, migrations, backfills, or seed execution. If required, prepare evidence and a separate concrete operational action for explicit authorization.
- Blanket dependency modernization, automated forced fixes, or claiming the absence of all vulnerabilities after finite scanning.

## Requirements

### R1. Evidence and findings register

Maintain a durable redacted audit report with coverage and findings. Each finding must identify its source or advisory ID, affected path/package and installed version, severity, runtime/development classification, prerequisites, relevant data flow, reproducible safe evidence, recommended fix, disposition, and verification result. Separate confirmed application defects, dependency advisories, hardening observations, false positives, and user-deferred work.

Use current primary advisory/vendor sources to validate affected and patched versions. Deduplicate advisory IDs across package chains while preserving all affected installations. Do not infer application exploitability from an npm severity label alone. Do not conceal unresolved advisories by suppressing output or adding undocumented exceptions.

### R2. Dependency remediation

Prefer supported, compatible patched releases and minimal lockfile changes. Reconcile manifests and lockfiles in every affected ecosystem. Patch transitive dependencies through a compatible parent release or a narrowly justified override only where the upstream compatibility contract and tests support it.

Avoid `npm audit fix --force`. Major upgrades may be required for in-scope packages; assess runtime, peer dependency, configuration, and test-runner compatibility before adopting them. Do not cross the React Native/Expo exclusion through a transitive override. An unrelated mobile package may be remediated only when the change is demonstrably independent of that family.

Assess both production and development dependencies: developer/test tooling can still execute with repository or local user access. Python audit evidence must distinguish committed lockfile resolution, installed environment inventory, and optional dependencies not actually resolved. Any reproducibility changes must preserve supported Python/model constraints and avoid downloads of model weights during ordinary verification.

### R3. Application fixes

Fix confirmed vulnerabilities at their trust boundary using the existing architecture. Preserve backend authorization as authoritative; names and frontend visibility must never substitute for stable IDs and server checks. Keep repository and direct-Mongoose implementations aligned where contracts change. Do not weaken validation, transaction semantics, security gates, or tests to obtain passing builds.

Add meaningful regression tests for confirmed defects, including a rejected adversarial case and the legitimate workflow that must continue to work. Use bounded synthetic inputs, temporary storage, stubbed external services, and isolated test databases. Avoid destructive payloads or uncontrolled memory/CPU stress against running shared services.

### R4. Sensitive data and operational safety

Secret scanning must report only redacted identifiers and locations. Do not print credentials, tokens, private URLs, personal data, or file contents into reports or tool output. Distinguish test/example values from plausible credentials. If a genuine credential is identified, remove unsafe first-party usage within scope where possible, document the exposure without the value, and report rotation as outstanding until separately authorized and verified.

Package advisory queries may send package names and versions to established vulnerability registries. They must not transmit source files, environment files, customer data, or private repository content.

### R5. Preserved contracts and failure behavior

Preserve the immutable Super Admin identity, operation-scoped permissions, active-user/session revocation checks, loopback-only development identities, invitation ownership checks, and public signup restrictions.

Preserve approval history, version/CAS checks, audit events, deduplication, approved financial values, integer-paise boundaries, and Configuration's stable-ID source of truth. Security changes must not fabricate missing values or silently alter financial history.

Preserve invitation delivery preflight, publication-independent mail delivery state, retry idempotency, upload compensating cleanup, and the OCR lease/heartbeat/token/result protocol. Fail closed at changed security boundaries and return safe, actionable errors without disclosing internal details.

No database migration is assumed necessary. If a confirmed defect requires persistent data changes or operational remediation, update the affected specification before introducing a materially different contract; live execution remains separately authorized.

## Recommended approach and tradeoffs

Use evidence-led remediation: prioritize reachable in-scope critical/high defects and production parsers, then development-tool and remaining findings. Choose the smallest supported dependency changes, escalating to a major version only when necessary and verified. Record the excluded React Native/Expo family explicitly.

A blanket forced upgrade is faster to initiate but risks incompatible framework combinations and hidden behavior changes; it is rejected. Reporting without fixing would avoid compatibility work but would not satisfy the user's request. An unpatched finding must instead receive an evidence-backed mitigation or a clearly stated unresolved disposition, without claiming complete remediation.

## Risks and constraints

- Advisory databases change; scan results are dated snapshots, and package severity is not application-specific reachability.
- Framework/tooling upgrades can change module resolution, peer requirements, test behavior, or runtime requirements even when application code is unchanged.
- Uploads, image/audio/PDF parsers, and optional OCR dependencies have native components whose effective versions may differ from top-level package labels.
- The local environment may not represent deployed images or installed optional model dependencies. Unavailable production facts must be reported as verification limits.
- Broad code review can miss vulnerabilities. Coverage, regression evidence, and remaining risks must be stated precisely.
- Existing business/security invariants take precedence over eliminating a scanner count through a breaking or weaker configuration.

## Acceptance criteria

1. **Coverage:** Every tracked subsystem has an audit disposition, with security-sensitive entry points and dependencies traced. React Native/Expo exclusions and all unscanned environments are visible.
2. **Dependencies:** Every reported in-scope advisory has a recorded disposition. Available compatible fixes are applied and verified; there are no unexplained residual findings. Deferred mobile advisories are not represented as fixed.
3. **Application security:** Confirmed first-party vulnerabilities are fixed with relevant negative and positive regression evidence, or explicitly reported as unresolved with concrete blockers. Hardening observations are not mislabeled as proven exploits.
4. **Authorization and integrity:** Changed boundaries pass asymmetric identity/project tests where applicable, preserving scoped access, immutable approvals, financial lineage, and worker contracts.
5. **Compatibility:** Affected workspace typechecks, focused regressions, proportionate broader tests, and builds pass. Lockfiles and manifests are consistent; dependency installation can be reproduced without unreviewed forced resolution.
6. **Secret handling:** Reports and tests contain no real secrets or customer data. Any rotation or external mitigation still required is explicitly outstanding.
7. **Final evidence:** Re-run applicable dependency scans after changes, inspect the integrated diff, and provide exact commands/results, remaining findings, excluded work, unrun checks, and temporary artifact paths. Do not label partially verified work secure or complete.

## Verification requirements

The separate task plan will select checks for the actual findings. Expected verification includes:

- Reproducible npm audits for backend/web and independently affected mobile packages, plus Python advisory checks against resolved runtime dependencies; preserve all failures and exclusions.
- Backend focused security regressions, then `npm run typecheck`, `npm test`, and `npm run build` for broad dependency or shared security-boundary changes. Use replica-set tests for changed transactional Mongo paths.
- Frontend focused regressions, then `npm run typecheck`, `npm test`, and `npm run build` for dependency changes. Include rendered interaction/accessibility checks when user-visible behavior changes.
- Mobile focused tests and typecheck only for independent in-scope code changes; proportionate export/native checks if affected. Do not run Expo prebuild or upgrade the excluded family as incidental verification.
- Assistant tests and OCR `.venv/bin/python -m pytest -m "not model"`, with isolated test environments when needed. Optional model tests remain opt-in and any resulting coverage gap is explicit.
- Bounded malformed input, revocation, access isolation, replay, cleanup, and failure-path tests tied to each confirmed finding rather than generic tests that merely mirror implementation.
- `git diff --check` and `git status --short`. The repository has no lint script; no lint result may be claimed unless an actual appropriate command is introduced and run.

## Open decisions and workflow state

No additional product decision is required to prepare the task plan. Exact fixed package versions and any necessary major-version compatibility adaptations must be selected using current evidence during the approved work. React Native/Expo remediation remains deferred unless the user changes that direction.

This file is the specification only. The repository's separate task-plan approval and execution-mode selection remain pending. No application code, dependency manifests, or lockfiles have been changed for this request.
