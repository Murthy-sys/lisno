# Lisno security audit and remediation

Date: 2026-10-23
Status: Local remediation and verification completed. Known baseline test failures, deferred SDK advisories, and deployment/runtime verification limits remain explicitly recorded below.

Approved scope: [specification](../superpowers/specs/2026-10-23-repository-security-audit-remediation-design.md) and [task plan](../superpowers/plans/2026-10-23-repository-security-audit-remediation.md). Execution mode: parallel native agents with non-overlapping write ownership.

## Baseline and interpretation

Baseline revision: `ca1504bd666a65ed2ab18b1cd2f1cd3da1e48a3b`. Product sources were clean; only the approved specification and plan were untracked. The tracked inventory contains 3,674 paths. This is a repository-wide inventory and risk-based boundary audit, not a claim of exhaustive semantic review of every line or formal proof of security.

Initial npm scans reported 15 backend, 9 web, and 60 mobile vulnerable package entries. These include inherited/transitive findings and are not counts of distinct exploitable application bugs. Across all three workspaces the normalized baseline contains 45 unique advisory IDs. Runtime and developer/test-tool exposure are assessed separately.

The [dependency advisory register](2026-10-23-dependency-advisory-register.md) retains the individual npm advisory IDs and consolidated Python baseline records.

The user deferred React Native and Expo dependency changes. Their SDK-coupled packages and transitive dependency overrides remain excluded. The independent ExcelJS UUID dependency is eligible for a scoped patch that leaves SDK resolutions unchanged; first-party password validation is updated to match the server's corrected policy.

Tools and evidence: Node 24.18.0, npm 11.16.0, pip-audit 2.10.1, Gitleaks 8.30.1. Raw and redacted temporary evidence is under `/tmp/lisno-security-audit-2026-10-23/`; do not commit runtime outputs. Scanner network requests send public package names/versions, not repository source or credentials.

## Coverage

| Subsystem | Review performed and evidence | Limits |
| --- | --- | --- |
| Backend identity and authorization | Auth/JWT/session lifecycle, operation registry, public reset/invitation ownership/replay, immutable Super Admin controls, memory/Mongo parity, project/vendor/client scope, audit projections, validation and query sinks. Existing registry and asymmetric assignment tests exercised. | Business-service review is risk-based, not every branch of every service. Deployment proxy topology is unavailable. |
| Backend business workflows | Traced finance/procurement actor/project scope, approval/version boundaries, sampled estimate/client review and Configuration mutations. Existing scoped observer tests distinguish stable IDs with equal display names. | Full integration-suite results are reported separately; approved financial/history values are unchanged. |
| Uploads/storage/transport | Common/profile/chat/workflow variants, PDF/image/audio/archive parsing, opaque refs, temporary/permanent cleanup, authenticated downloads, worker service tokens, SMTP/SendGrid/assistant transport. Bounded synthetic PDF reproduction. | No destructive stress or production storage inspection. Cluster quotas and native parser containment remain deployment responsibilities. |
| Web | HTML/DOM/URL sinks, redirects, token fragments, session and query cache isolation, download/multipart paths, public auth flows, dependency/build tooling. Synthetic failing reproductions confirmed logout and stale-response defects. | Browser/server authorization are distinct. Rendered tests and their limits appear in verification. |
| Mobile first-party | SecureStore/environment separation, deep-link guards, scoped APIs and native transfers, session generations, release configuration; initial focused baseline 65 tests passed. | No release-device test. React Native/Expo dependencies deferred by user. |
| Assistant Python | All source inspected for sensitive sinks, detailed auth/body limits/runtime endpoint and typed planner controls, cancellation, safe logging, rules runtime and deployment templates. Both lockfiles audited. | No inference, model download, container build, or deployed-image scan. |
| OCR Python | Settings/contracts, worker transport/lease/token/cleanup, extraction/image limits and failure reporting. Installed environment inventory and dependency audit. | Native termination/resource containment and optional-model execution require deployment-specific verification. |
| Shared/contracts | Shared modules inventoried and searched for execution/HTML/network/persistence sinks; cross-workspace identity, price/source and worker contract edges traced in the owning services. | Algorithmic helpers receive boundary review, not exhaustive mathematical verification. |
| Scripts/deployment | Process spawning uses argument arrays; reviewed launcher environments, safe operational logging, fixed loopback readiness, build scripts, scheduler dry-run behavior and Render configuration. No scripts that seed/bootstrap/migrate were executed. | Actual deployment image/runtime/proxy/firewall settings were not accessed. |
| Documentation/configuration/artifacts | Current tracked files and local Git history scanned for secrets; supplementary PDF text and image metadata scans. Generated/tool artifacts classified as coverage material rather than executed. | No image-pixel OCR or exhaustive historical binary extraction. Unreachable/remote Git objects and deployment secrets unavailable. |

## First-party findings

### SEC-01: retired sessions could revive after reactivation or role restoration

Severity: medium. An attacker must retain an unexpired previously issued JWT and the account must later regain its prior active/role state. The original repository updates changed user version but not session version. A safe memory-repository reproduction showed `acceptedAfterReactivation: true`.

Fix: atomically advance effective session version on actual active/role transitions in both memory and Mongo implementations. Preserve no-op updates, legacy missing session version, validated CAS and concurrent reset semantics. Existing tokens remain invalid after a round trip; fresh authentication works.

Affected areas: `backend/src/repositories/{memory,mongo}.ts`; session-revocation and replica-set regressions. Status: implemented; focused regressions and integrated checks passed.

### SEC-02: new passwords exceeded bcrypt's effective input length

Severity: low-to-medium, conditional. Reset/invitation schemas accepted 128 characters while bcrypt used only the first 72 UTF-8 bytes. Two synthetic distinct 82-byte strings with the same first 72 bytes authenticated equivalently. Suffix-only password changes could leave the previous password equivalent.

Fix: new-password validation retains the minimum 12-character requirement and rejects values over 72 UTF-8 bytes at route and service boundaries, including operational bootstrap configuration. Web/mobile forms provide matching validation. Legacy login does not reject existing long passwords. Tests cover ASCII, multibyte input, exact boundaries, rejection before token/account side effects, and legacy login.

Affected areas: backend password policy, reset/invitation/bootstrap paths; web and mobile new-password forms. Status: implemented; focused regressions and integrated checks passed. No bootstrap command was executed.

### SEC-03: logout did not clear other authenticated browser tabs

Severity: moderate confidentiality. A second tab retained the authenticated user/private cache after shared credentials were removed. A rendered synthetic test reproduced the stale signed-in state. This was not a server authorization bypass.

Fix: shared-credential removal transitions authenticated/restoring tabs out of the session and clears private cached state, respecting existing generation guards.

Affected area: `frontend/src/auth/AuthProvider.tsx` and tests. Status: implemented; focused regressions and integrated checks passed.

### SEC-04: old-session responses could reach a replacement session

Severity: moderate confidentiality/integrity. Pending TanStack mutation callbacks survive cache clearing. The API layer delivered an old user's response after an account switch, allowing a normal callback to refill a project-keyed cache. A synthetic API/query-cache reproduction confirmed this behavior.

Fix: credential/session-generation fences cover JSON parsing, XHR multipart completion, blob reads, and error completion. Same-token local logout/relogin changes the generation. Public login/signup stay credential-free and unbound; stale errors cannot expire replacement sessions.

Affected area: `frontend/src/api/client.ts`, AuthProvider public-auth calls and tests. Status: implemented; focused regressions and integrated checks passed.

### SEC-05: PDF object streams could bypass decompression budgets

Severity: high availability. Any actor able to reach an accepted PDF upload endpoint could cause API-process decompression before object-level mutation checks. Existing validation bounded only the final xref stream. A bounded reproduction accepted an 8,623-byte PDF expanding an object stream to 8,388,615 bytes and observed about 32 MiB of ArrayBuffer growth; no outage was induced.

Fix: request-local parser budgets validate all structural streams before pdf-lib's structural parsers consume them. Flate decoding uses a native output limit; other supported filters receive an instance-local allocation boundary, one filter at a time. Object streams are checked for count, offsets and nesting, then passed onward uncompressed. Aggregate decoded bytes, object count, depth and elapsed work are bounded. Page traversal is iterative and rejects cycles. No global parser prototype is patched. All parsing runs in a disposable worker, so library-wide name/reference caches disappear after each document. A hard five-second deadline terminates the worker even inside non-cooperative token parsing; worker heap/stack limits and a two-active/four-waiting admission boundary isolate concurrent work. Worker diagnostics are discarded rather than exposing document-derived text.

Defaults: 8 MiB per decoded structural stream, 32 MiB aggregate decoded structural data, 100,000 parsed objects, depth 64, five-second validation budget. These are parser-resource controls, not workflow media size/count limits. Content/image rendering remains the responsibility of separately bounded consumers.

Affected areas: `backend/src/domain/pdf-validation-budget.ts`, `domain/pdf-document-validation.ts`, `services/pdf-validation.ts`, `middleware/upload.ts`, PDF/upload tests. Status: implemented; independent review, focused regressions and compiled-worker smoke passed.

### SEC-06: unrestricted workflow media could exhaust disk capacity

Severity: high availability exposure for an authenticated project actor. Continuous uploads had no byte/count cap and only an inactivity timeout. The earlier approved unrestricted-media requirement intentionally permits large/many files, so fixed product caps were not reintroduced.

Mitigation: admit at most eight active evidence uploads per process and two per actor, with no waiting queue. Hold admission until parsing/import/cleanup finishes. Temporary and permanent streamed writes check a 64 MiB available-space reserve before each chunk; capacity checks/writes are serialized within the process. Reject busy admission with retryable 503 and insufficient capacity with retryable 507, clean partial files and release slots. Existing successful 32-file/large-media behavior is retained when capacity permits.

Affected areas: workflow admission/evidence middleware, streamed storage and safe error mapping. Status: implemented mitigation; regression and integrated checks passed. Residual: this is not a cluster-wide quota; unrelated processes can consume disk between checks. Unrestricted request duration/count remains subject to deployment resource management and abuse monitoring.

### SEC-07: OCR worker transport could forward service credentials to redirects

Severity: medium; high impact conditional on a malicious/misconfigured/intercepted transport or compromised claim response. Offline tests showed urllib redirects preserve Authorization and claim-token headers across origins; remote plaintext HTTP and foreign absolute source URLs were accepted. The backend constructs relative source URLs, so no ordinary-uploader SSRF was established.

Fix: require HTTPS outside literal loopback, validate the exact configured origin/current-job source path and callback identifiers, disable redirects/environment proxies, bound JSON/download reads and socket/header/body deadlines, preserve claim protocol, and remove private temporary files on all failures. Source default is 64 MiB with a 256 MiB configuration ceiling; JSON responses are capped at 1 MiB. Host DNS resolution follows operating-system resolver timeouts.

Affected areas: OCR contracts/settings/transport/worker and transport tests. Status: implemented; complete non-model suites passed in both clean and updated existing environments.

### SEC-08: OCR unexpected exception strings reached user-visible failure records

Severity: low disclosure. Arbitrary exception strings were reduced in whitespace/length but persisted and displayed. A synthetic exception containing a private-path marker was forwarded unchanged; no actual credential exposure was observed.

Fix: fixed safe messages for unexpected failures and explicitly controlled messages for classified failures. Preserve actionable status/code and lease/retry semantics.

Affected area: OCR failure classification and tests. Status: implemented; disclosure and worker-protocol regressions passed.

## Dependency remediation

| Workspace | Baseline | Current result | Principal changes |
| --- | --- | --- | --- |
| Backend | 15 flagged npm package entries | 0 in post-update audit | Multer 2.5.0, music-metadata 11.16.1, Nodemailer 10.2.1, Sharp 0.35.5, Vitest 4.1.12, compatible transitive refresh. |
| Web | 9 flagged npm package entries | 0 in post-update audit | React Router DOM 7.18.4, Vite 6.4.5, Vitest 4.1.12, compatible nanoid/source-map-js/brace-expansion refresh. |
| Mobile | 60 flagged entries | 59 deferred entries: 1 critical, 52 high, 6 moderate | ExcelJS-owned UUID 8.3.2 → 11.1.1. All 1,021 other lock entries, including Expo/RN, unchanged. |
| Assistant | Runtime: certifi; test-environment follow-up additionally found pytest | 0 across runtime, rules-only and final installed test environment | certifi 2026.10.19; pytest 9.0.3; test/install tooling pip 26.2. |
| OCR | 50 installed-environment records across 6 packages; includes a duplicate pip record | 0 in base/test lock, optional model lock, clean base environment and patched existing environment | Pillow 13.0.0, aiohttp 3.14.4, multidict 6.9.1, certifi 2026.10.19, urllib3 2.8.0, pip 26.2; required yarl 1.25.1. Added pillow-heif 1.8.1 for declared HEIF support. |

No `npm audit fix --force` was used. Vitest 4.1.12 removes the affected Tinypool path and supplies patched mocker packages; upgrading to Vitest 5 was unnecessary. Mobile downgrade suggestions were rejected. Vulnerability reachability varies: uploaded SVG is not accepted in the inspected Sharp consumers; React Router's baseline advisory concerns RSC mode while this app is a client SPA; development tooling is not equivalent to deployed runtime code. Compatible patches were still applied.

The final Python scanner covered 17 assistant runtime packages, 14 rules-only packages, 9 OCR base/test packages, 70 optional-model metadata-resolved packages, 23 assistant test-environment packages, 10 clean OCR third-party packages and 71 existing OCR third-party packages. Every final scan completed with zero findings and no skipped packages. The optional model resolution was checked for both macOS ARM64 and Linux x86_64/Python 3.11; both produced the same 70 pinned versions. Existing PaddleOCR 3.7.0, PaddlePaddle 3.3.1 and PaddleX 3.7.2 versions were preserved. No model package installation or inference was required for resolution.

ExcelJS's prebuilt browser distribution retains embedded UUID code. The scoped override updates its installed dependency; reviewed workbook code calls UUID v4, whereas the advisory concerns v3/v5/v6 explicit-buffer paths. Do not interpret the clean installed-tree result as replacement of every embedded browser UUID implementation.

`render.yaml` now installs pinned pip, the reviewed OCR model lock/constraints, then the project with `--no-deps`. Its old Python 3.11.11 pin was updated to the security release [Python 3.11.17](https://www.python.org/downloads/release/python-31117/), supported by [Render's version selection](https://render.com/docs/python-version). Local execution used Python 3.11.15. A temporary attempt to obtain 3.11.17 through uv found no macOS ARM64 download; that exact target runtime and the deployed image remain unverified. System Python was not replaced. Package-scanner results do not certify the host interpreter or native OS libraries.

## Secret audit

Official Gitleaks 8.30.1 was downloaded into `/tmp` and its SHA-256 matched the official release checksum. The tracked tree produced 13 generic-key findings; local history produced 28. All were locally classified as synthetic test signing secrets, privacy-test inputs, documentation examples, or noncredential workflow/idempotency identifiers. No plausible real credential was confirmed and no values are included here.

History coverage includes all 701 reachable commits: 698 with added text, plus three verified deletion-only commits. Supplemental checks covered 106 browser text artifacts, text from eight PDFs, and metadata from 56 images. No additional credential candidates were found. `mobile/.env.local` contains public settings; its URLs do not contain credentials/query strings. The Android debug keystore contains the standard debug certificate, not a confirmed production signing key.

Evidence: `secrets/summary.json`, `tree-classified.json`, `history-with-merges-classified.json`, `browser-locations.json`, `binary-text-index.json` under the temporary audit directory. Image pixels, all historical binary metadata, unreachable/remote Git objects and deployment secrets were not exhaustively scanned. A final changed-file scan reported one unchanged synthetic secret fixture in `backend/tests/user-invitations.test.ts`; no new real credential was confirmed. No external credential validation, rotation, or history rewrite occurred.

## Residual and deployment-dependent observations

- Identity rate limits use socket/Express peer addresses. A shared reverse proxy could collapse clients into one bucket; actual topology was not established. Do not blindly trust forwarded headers. Confirm trusted proxy configuration and edge abuse controls before changing this behavior.
- Legacy local-storage reads follow symlinks. A remote primitive allowing arbitrary symlink placement was not found; this is defense in depth requiring prior filesystem write access, not a demonstrated remote file-disclosure path.
- Dynamic disk protection is process-local and cannot guarantee capacity against other writers or replace per-volume/tenant quotas and monitoring.
- PDF worker admission begins after existing multipart buffering. The new limits bound parser work and its queue, not aggregate memory across every concurrent HTTP upload; deployment request/concurrency limits remain necessary. Worker heap limits also do not replace explicit decoded-byte bounds or operating-system process isolation for native libraries.
- Native OCR/image parser isolation and termination need validation on the real deployment image. The assistant base image is supplied by deployment; no actual deployed digest was available for scanning.
- Optional model execution, Python 3.11.17 target execution, actual release-device behavior, remote Git objects and deployment secrets are outside verified local evidence. The current local interpreter remains 3.11.15; use the patched runtime on the deployment target.
- OCR socket deadlines cannot interrupt host DNS resolution; resolver configuration remains a deployment concern.

## Verification ledger

Pre-fix audit evidence: identity/security baseline 511 passed and two stale Procurement deny-all assertions failed; separate asymmetric memory/Mongo assignment suite 16/16 passed. Those obsolete denial fixtures were corrected to test current scoped reads without weakening other denied operations.

Final checks and outcomes:

| Check | Result |
| --- | --- |
| Backend `npm run typecheck` and `npm run build` | Passed. |
| Backend focused security group, six files | 55 passed; session revocation, password policy, Mongo reset races, PDF budgets, capacity and streaming admission. |
| Backend broader upload/storage group | 115 passed before the added queue-saturation case; final PDF suite includes all 10 cases and passes. Compiled `.js` PDF worker accepted a valid PDF and rejected invalid bytes. |
| Backend `npm test -- --maxWorkers=2` | 6,030 passed, 14 failed, 55 skipped. All 13 assertion failures reproduced on original HEAD/original dependencies (baseline comparison: 372 passed, 13 failed). Seven Mongo setup/teardown timeouts and one test timeout cleared on a single-worker rerun of all eight affected suites: 75 passed. |
| Backend/Python bridge, opt-in lightweight lane | All 24 previously opt-in cases passed with the patched assistant interpreter. The other 31 broad-run skips came from the timed-out setup hooks and were covered by the successful rerun. |
| Web final security/auth and complete vendor suite | 213 passed across seven suites; includes rendered password/error focus, accessible descriptions, an axe check and session isolation. |
| Web `npm run typecheck` / `npm run build` | Passed. Existing large-chunk warning remains. |
| Web earlier full suite | 5,188 passed, 74 failed. 73 failures across eight suites reproduced on isolated original HEAD/original Vitest 3 dependencies. The remaining vendor test clicked Save before loading completed; its readiness correction passed in the final full 59-test vendor suite. The entire web suite was not repeated after that test-only correction. |
| Mobile auth/workbooks | 31 passed across five suites; typecheck passed. Actual browser-bundle XLSX generation/import and separate Node/browser round trips passed. |
| Clean JS installations | Exact backend/web lockfiles installed into a disposable copy with `npm ci --ignore-scripts --no-audit --no-fund`; both clean production builds passed. Lifecycle scripts were disabled in this isolated reproduction. No worktree dependency directories were replaced for this check. |
| Assistant Python | Final pytest 9.0.3 environment: 274 passed. Clean rules-only install created the app and returned health successfully, with HTTP-client/model packages absent. |
| OCR Python | Clean patched non-model environment: 388 passed, one model test deselected. Updated existing environment: 388 passed, one model test deselected. HEIF tests ran successfully after installing the declared pillow-heif dependency. Existing SWIG deprecation warnings remain. |
| Python metadata/install checks | Clean environments and existing OCR `uv pip check` passed; optional model Linux/macOS resolution agrees; all final advisory scans zero. Exact Python 3.11.17 execution unavailable as described above. |
| Independent integrity review | No confirmed blocking finding remains. Review caught the OCR deployment command bypassing locks; that configuration was corrected and re-reviewed. |
| Hygiene / secrets | `git diff --check` passed; only scoped source/test/dependency/docs/config changes. Final changed-file secret scan classified the one existing fixture. No lint script exists; no lint result claimed. |

The overall test suites are not globally green because of the proven baseline failures. No separate browser width matrix, native app build, model inference, container build or live deployment test was run.

Reproduction commands (from the relevant workspace):

```sh
# Backend full and targeted security
npm run typecheck
npm test -- --maxWorkers=2
npm test -- tests/auth-session-revocation.test.ts tests/password-policy-security.test.ts tests/password-reset-mongo.replica-set.test.ts tests/pdf-validation-budget.test.ts tests/storage-capacity.test.ts tests/workflow-evidence-streaming.test.ts --maxWorkers=2
npm run build

# Web final changed-flow verification
npm test -- src/api/client.test.ts src/auth/AuthProvider.test.tsx src/auth/passwordPolicy.test.ts src/auth/InvitationAcceptancePage.test.tsx src/auth/PasswordResetPage.test.tsx src/auth/ProjectInvitationAcceptancePage.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx --maxWorkers=2
npm run typecheck
npm run build

# Mobile
npm test -- --runInBand src/features/auth/validation.test.ts src/features/auth/ProjectInvitationScreen.test.tsx src/features/knowledge/KnowledgeQualityWorkbook.test.ts src/features/knowledge/knowledgeWorkbookArchive.test.ts src/features/procurement/VendorInductionWorkbook.test.ts
npm run typecheck

# Python, using each patched environment's interpreter
python -m pytest -m 'not model' -q --tb=short

# Advisory inputs are complete resolved lockfiles or installed inventories
npm audit --json --ignore-scripts
pip-audit --no-deps --disable-pip -r <pinned-input> -f json
```

Evidence: `/tmp/lisno-security-audit-2026-10-23/integrated-*.log`, `frontend-baseline*.log`, `backend-clean-build.log`, `frontend-clean-build.log`, `assistant-final-tests.log`, `ocr-final-tests.log`, `ocr-local-final-tests.log`, `python-final-audit-summary.json`, and the per-workspace final audit JSONs. Original comparison trees are under `backend-baseline/` and `frontend-baseline/`; clean JS installations are under `final-install/`; clean Python environments use `*-clean/`. Ignored build outputs are `backend/dist`, `frontend/dist`, and TypeScript metadata. These are temporary verification artifacts, not deliverables to commit.

## External actions

No deployment, production scan/data mutation, seed/bootstrap execution, migration, credential rotation, commit, push, customer communication, model download or inference was performed. External network actions were public package/advisory/documentation queries, dependency downloads, temporary scanner acquisition, and an unsuccessful temporary interpreter lookup. No private source or credentials were sent to scanners.
