# Work-order email and Procurement vendor invitations: implementation plan

Date: 2026-10-09
Status: Specification and task plan approved; Mode A selected. T0–T6 complete for local implementation and verification. No unresolved feature regression found. Full repository suites retain confirmed baseline failures; deployment and real provider/inbox verification are not performed.

Approved source: [Work-order email delivery and Procurement vendor invitations](../specs/2026-10-09-vendor-work-order-email-and-procurement-invitations-design.md).

## Outcome and boundary

Implement both approved entry points: automatic vendor onboarding/work notification after successful work-order issuance, and explicit Send invitation / Resend invitation from Procurement vendor details and issued-order context. Preserve saved vendor identity, single-use invitation acceptance, immutable issued work, and the existing execution tracker.

The plan gate is complete and implementation is authorized. Environment settings, deployed data, and customer email remain untouched; local verification uses isolated fixtures and fake mail transports.

## Current baseline

- The earlier execution implementation remains uncommitted. The current dirty paths include `app.ts`, `server.ts`, environment/authorization/invitation/repository files, issuance services, related tests, Procurement project/admin views, and the untracked execution/onboarding feature. These changes are the starting point, not disposable work.
- `VendorAccessIntent` currently requires project/order/revision identity and has a unique order/revision/vendor index. Keep this order-specific model intact; do not insert fake order IDs for pre-order invitations or weaken its identity requirements.
- `UserInvitation.authority` currently supports work-order authority and historical manual Super Admin authority. Extend that tagged contract for Procurement vendor invitations; retain the existing source rules.
- `VendorKpiStaffPage.tsx` is the existing Procurement/Super Admin vendor detail route. Add the compact login-access section there rather than create another vendor-detail page. The project `VendorAccessPanel` remains the order-facing surface.
- The onboarding worker starts only with the disabled-by-default flag and has no post-commit wake. The plan must test production composition/startup, not merely call `processPending()` in a service test.
- Previous full-suite failures and test counts are background. Reproduce current focused results before implementation, record existing failures, and never change unrelated assertions to make the suite green.

## Contract to settle before parallel writes

The primary agent owns the public contract and publishes it to all writers in T1. Internal helper decomposition may change within the assigned subsystem without changing these approved behaviors.

### Delivery readiness and persistence

1. Resolve one effective onboarding readiness value from configured invitation/work mailers and the optional `VENDOR_ACCESS_DELIVERY_ENABLED` override. Omitted flag plus usable provider enables delivery; explicit false means paused; no usable provider means unavailable. Explicit true never bypasses provider/identity preflight. Leave `EXECUTION_REMINDERS_ENABLED` unchanged.
2. Add explicit dispatch authorization metadata to newly issued order intents. Missing metadata on historical documents means manual recovery required. Never default missing historical fields to auto-eligible during hydration or queries. Orders issued while paused/unavailable have no automatic dispatch authorization.
3. Add a small `ProcurementVendorInvitationIntent` record for manual vendor commands, separate from order intents. It holds vendor/actor/contact lineage, expected source versions, command kind, idempotency key/digest, safe delivery state, invitation reference, bounded lease/retry metadata, and timestamps. It contains no raw setup token or artificial project/order identity.
4. Both kinds of intent use the existing invitation service and common identity/recipient coordination. A manual request commits its intent before external sending, returns a truthful pending/completed status, and wakes processing after commit. An invocation denied by delivery preflight creates no intent, token, invitation, invitation audit, or email-job record.
5. Add a `procurement_vendor` invitation authority referencing its durable manual source and stable vendor/contact binding. Keep source lookup in the repository contract, with equivalent memory and Mongo behavior, and validate active issuer authority for this manual source at dispatch/inspection/acceptance.
6. Explicit resend can rotate a compatible pending generation only under the existing email coordination, cooldown, and in-flight protection. Automatic issuance reuses valid setup when applicable. Neither path takes ownership of a historical Super Admin-managed invitation or changes account credentials/binding.

### API and permission boundaries

| Operation | Purpose and authority |
| --- | --- |
| `GET /procurement/vendors/:vendorId/login-access` | Read vendor login/setup/delivery status and available actions; new `procurement.vendor_access.read`, also requiring applicable directory access. |
| `POST /procurement/vendors/:vendorId/login-access/send` | Explicit pre-order setup invitation; new `procurement.vendor_access.manage`. |
| `POST /procurement/vendors/:vendorId/login-access/resend` | Explicit compatible setup resend; same narrow manage permission. |
| Existing `GET /projects/:projectId/vendor-access` | Retain existing project authorization; extend safe order labels, readiness, and server-derived actions. Include recoverable currently issued orders without a recorded intent as read-only projections. |
| `POST /projects/:projectId/vendor-access/orders/:orderId/send` | Send setup, resend setup, or send work notification for the addressed current issued order; existing `execution.access.retry` plus current project/order/vendor checks. |
| Existing `POST /projects/:projectId/vendor-access/:intentId/retry` | Preserve compatibility, preflight before queue changes, and wake a real processor after commit. |

- New vendor read/manage permissions are granted only to the appropriate Procurement and operation-specific sole Super Admin paths. Do not broaden generic user-invitation permissions or unrelated project visibility.
- Strict manual request schemas accept an idempotency key, expected saved vendor version, and the exact invitation ID/version or explicit absence observed by the read. Order requests additionally carry the observed order version/revision and access-intent version/absence. An action enum is allowed only on the order endpoint and must match server-derived action availability. Revalidate all supplied expectations transactionally.
- Reject unexpected role, email, authority, user binding, and alternate source fields. Replays with the same key/body/actor resolve the original logical command; changed-body or cross-actor replays fail. Preserve the existing token acceptance request contract.
- Responses distinguish effective readiness, account state, invitation lifecycle, provider delivery state, last attempt/sent time, cooldown, and available actions. Vendor DTOs expose only authorized saved recipient information; order DTOs expose only scoped order/vendor data. No credential, token, private setup URL, or raw provider error is returned.
- Add the public types to a focused backend vendor-access contract and matching frontend API types. Update route registry, OpenAPI, audit actions, and the frontend authorization version together. Existing execution routes remain compatible.

### UI behavior

- Vendor detail: compact **Vendor login access** section beside the existing vendor overview, with saved recipient, delivery/setup status, and backend-selected Send invitation / Resend invitation action. Show Account active without password setup controls. Expose profile correction through the existing editor.
- Issued-order/project access: human-readable vendor/order labels, effective paused/unavailable reason, Send invitation / Resend invitation / Send work notification as appropriate, and recovery for old orders with no intent. No reads initialize records.
- Use existing panels, buttons, focus/error patterns and modest spacing. No redesign, new icon package, hover-only interaction, or new dependency.
- Query keys include actor/vendor/project context. Mutations invalidate vendor login access, related project/order access and affected invitation administration reads. Poll pending sends with existing visible-page patterns; stop presenting revoked/stale data as actionable. Keep unrelated dirty vendor forms intact.

## Dependency-ordered tasks

Keep only one parent task in progress. T2 and T3 are child slices of the implementation parent and may run in parallel after T1; T4 integrates them. All other dependencies below are sequential.

| Task | Owner and write boundary | Dependencies | Outcome / acceptance criteria |
| --- | --- | --- | --- |
| T0: Capture baseline and reproduce | Primary, read-only product inspection and temporary evidence | Plan approval and execution-mode choice | Snapshot dirty-path list, tracked target diffs and untracked target contents before writers. Run focused baseline, identify preserved changes and prove the disabled-startup/missing-action gaps. AC1, AC3, AC7. |
| T1: Freeze shared contract | Primary | T0 | Publish DTO/request schemas, readiness mapping, source-authority union, intent eligibility rules, permission matrix and post-commit callback interfaces. Own shared contracts and canonical authorization/OpenAPI inventories. AC1–AC5, AC7. |
| T2: Implement backend capability | Backend implementer in Mode A; primary in Mode B | T1 | Implement durable manual intent/source authority, preflight, send/resend, current-account handling, order recovery, worker lease/eligibility/readiness, and narrow routes with regression tests. AC1–AC5. |
| T3: Implement Procurement controls | Frontend implementer in Mode A; primary in Mode B | T1 | Implement typed API/query handling, vendor detail login access, order panel actions/statuses and interaction regressions against T1 contract. AC3, AC6. Can run alongside T2. |
| T4: Integrate startup and issuance | Primary | T2 and T3 | Wire effective environment readiness, mailer/service/router lifecycle and post-commit wake for every issuance family; integrate contracts/fixtures and verify historical backlog exclusion. AC1, AC2, AC5, AC7. |
| T5: Integrity review and corrections | Integrity reviewer read-only in Mode A, primary sequentially in Mode B; fixes by assigned owner | T4, all writers finished | Review identity authority, transactions, email preflight, ambiguous sends, concurrent manual/automatic commands, account binding, scope and backlog controls. Resolve findings before final verification. AC1–AC7. |
| T6: Final verification and handoff | Verification runner plus primary in Mode A; primary in Mode B | T5 corrections complete | Run integrated commands, rendered desktop/mobile interaction/permission scenarios and fake-mail end-to-end issuance/setup/resend. Record exact results, remaining baseline failures and rollout limits. AC1–AC7. |

### Non-overlapping ownership in Mode A

**Primary owns:** this plan and the approved specification; new backend public vendor-access contract; `backend/src/domain/authorization.ts`, `route-operations.ts`, `audit-actions.ts`; `backend/src/openapi.ts` and vendor-access OpenAPI/inventory fixtures; `backend/src/models/application-indexes.ts`; `backend/src/config/env.ts`, `backend/.env.example`, `backend/src/app.ts`, `server.ts`; post-commit integration in the three `project-purchase-order*.service.ts` issuance families; corresponding server/environment/authorization/OpenAPI/issuance integration tests; `frontend/src/api/authorization-contract.ts` and its inventory test. Public contract updates go through the primary before downstream edits.

**Backend writer owns:** `backend/src/domain/user-invitations.ts`; `models/UserInvitation.ts`, `VendorAccessIntent.ts`, new `ProcurementVendorInvitationIntent.ts`; `repositories/types.ts`, `memory.ts`, `mongo.ts`; `services/user-invitation.service.ts`, `vendor-work-onboarding.service.ts`, `vendor-work-invitation-authority.ts` and focused new vendor-access/source helpers; `routes/vendor-execution.ts` and new `routes/procurement-vendor-access.ts`; related invitation/onboarding/manual-access unit and replica-set tests. The writer supplies integration exports/index descriptions to the primary and does not edit primary-owned files.

**Frontend writer owns:** `frontend/src/features/execution/VendorAccessPanel.tsx`, its CSS/tests; new vendor-login API/panel/tests under `frontend/src/features/procurement/`; `VendorKpiStaffPage.tsx`, `ProcurementProjectPage.tsx`, and `SuperAdminPurchaseOrdersPage.tsx` only for this feature's integration; narrowly affected frontend fixtures and rendered tests. The writer does not alter authorization contracts or backend files.

Agents must be told they are not alone in the worktree, must preserve prior edits, and must not revert, reformat, stage, or commit another owner's work. Any new overlapping path is handed back to the primary before editing. Mode B executes the same slices inline without implementation subagents. No subagents are started before this amendment's execution-mode choice.

## Implementation detail and completion conditions

### T0–T1

- Capture the initial status and target snapshots under an ignored temporary evidence directory such as `/tmp/lisno-vendor-email-fix/`; keep secrets and personal data out of outputs.
- Inspect current source plus existing focused test failures, including earlier execution modifications. Do not use an old test count as current proof.
- Add negative tests for omitted flag/real startup and unavailable initial-send controls before changing behavior where practical. Establish asymmetric vendors/projects and existing/new account fixtures.
- Publish the shared interfaces before parallel work. Confirm additive index shape without applying production indexes. Check every new operation's permissions and Super Admin behavior explicitly.

### T2

- Keep order intent identity and unique source key. New authorization metadata must be explicitly written only by issuance with effective delivery ready, or by an authorized manual recovery command.
- Manual vendor intent creation preflights readiness/identity and expected versions before write. A unique semantic command key and digest cover ambiguous HTTP retries. Read state derives from durable records and actual bound accounts.
- Add the manual source repository lookup/coordination and authority checks through token inspection, dispatch, resend, acceptance, and authentication compatibility. Preserve historical Super Admin records.
- Use shared recipient coordination to cover two orders for one vendor, manual send racing automatic issuance, two resends, and acceptance racing resend/deactivation/contact changes. Provider calls remain outside every retried transaction.
- Do not allow missing/invalid contact, multiple bound users, inactive account, foreign-role email, cancelled/stale order, or revoked actor to fall back to another source/recipient. Return safe actionable states.
- Extend the processor to dispatch both authorized source types using bounded leases/recovery and explicit uncertain-acknowledgement handling. Add safe last-tick/failure health, retain pause visibility, and stop timers gracefully.

### T3

- Implement actions directly from server availability and versions. Preserve the same request key/body across uncertain retries; clear it only after a definite outcome or explicit refresh/conflict resolution.
- Show separate email and account/setup statuses. A queued response never shows Sent; provider Sent never shows Account active before acceptance.
- Show paused/unavailable reasons even when no send action is possible. Existing active account displays no setup action; order context offers the correct notification action.
- Handle pending/loading/empty/error/stale/permission-revoked states. Do not expose all vendor contacts to populate one project panel. Never clobber a vendor edit form during a delivery refresh.

### T4

- Resolve omitted/true/false flags consistently in environment loading and application composition. Inject explicit safe fake transports in tests; update `.env.example` with operational meaning without editing `.env` or real provider configuration.
- Keep the transactional issued hook as persistence-only. Add a post-commit notification from the outer successful transaction for direct order approval, project request approval and manual/automatic basket issue. A wake failure cannot roll back a committed order; polling is durable recovery. Do not send from `setTimeout` scheduled inside a retried transaction.
- Wake on manual command commit too. Exercise startup/stop behavior using the actual application/server wiring. Ensure no unhandled fire-and-forget rejection is the only record of failure.
- Preserve old unmarked intents, paused/unavailable-at-issue records, and immutable approved sources across restart. A selected legacy order can be recovered explicitly without reapproval/reissue.

## Verification matrix

| Acceptance criteria | Focused evidence |
| --- | --- |
| AC1 | Environment matrix (omitted/true/false × usable/disabled provider), production server/app startup, real issuance HTTP/service path with fake mail, post-commit dispatch within five seconds, rollback/replay zero extra logical sends, pause/unavailable zero invitation-related writes. |
| AC2 | New account setup and one-use acceptance; active account work email with unchanged password; valid pending setup reuse; two unequal vendors and two simultaneous orders; invalid contact and cross-role collision. |
| AC3 | Procurement pre-order send/resend, assigned order recovery and sole Super Admin operation; other roles denied, foreign project non-disclosing, archived/inactive vendor blocked, saved-contact/version authority, original issuer deactivation. |
| AC4 | Replica-set concurrent manual/automatic send, duplicate commands, mismatched idempotency digest, cooldown, stale versions, acceptance/resend race, failure/retry, lease expiry and ambiguous provider acknowledgement. |
| AC5 | Seed only isolated test fixtures with unmarked historical requests and paused/unavailable issuance; startup/default change/restart causes no unsolicited sends. Explicit single-order recovery uses unchanged approved revision/amounts. |
| AC6 | Rendered send/resend/status tests and browser vendor-detail/order-panel flows at 1440, 390, 320 pixels; keyboard, focus, accessible action names/errors, no document overflow, revoked access cleared, dirty form retained, no console/API errors. |
| AC7 | Canonical authorization/route/OpenAPI parity, memory/Mongo authority parity, current focused/integrated regressions, both workspace typechecks/builds, full suites with independent baseline classification, final diff check and status review. |

### Commands and test locations

Use the following existing suites plus new focused files `tests/procurement-vendor-access.test.ts`, `tests/procurement-vendor-access.replica-set.test.ts`, and `tests/vendor-access-startup.replica-set.test.ts`. Fixture-only files do not count as executed tests.

Backend focused:

```sh
npm test -- tests/vendor-work-onboarding.test.ts tests/vendor-work-onboarding.replica-set.test.ts tests/procurement-vendor-access.test.ts tests/procurement-vendor-access.replica-set.test.ts tests/vendor-access-startup.replica-set.test.ts
npm test -- tests/user-invitations.test.ts tests/user-invitations-mongo.replica-set.test.ts tests/user-invitation-models.test.ts tests/user-invitation-repository.test.ts tests/invitation-rate-limit.test.ts
npm test -- tests/server.test.ts tests/development-env.test.ts tests/project-purchase-order.replica-set.test.ts tests/project-purchase-order-request.replica-set.test.ts tests/project-purchase-order-basket-issue.replica-set.test.ts tests/vendor-execution-integration.replica-set.test.ts
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
```

Frontend focused:

```sh
npm test -- src/features/execution/VendorAccessPanel.test.tsx src/features/procurement/VendorLoginAccessPanel.test.tsx src/features/procurement/VendorKpiWeb.test.tsx src/features/procurement/SuperAdminPurchaseOrdersPage.test.tsx src/api/authorization-contract.test.ts
```

Run these from their respective workspace directories, including any additional directly affected suites identified during integration. On the final integrated tree, run `npm run typecheck`, `npm test -- --maxWorkers=2`, and `npm run build` in both backend and frontend. Run `git diff --check` and `git status --short` at repository root. Tests that require local sockets or replica-set startup use the appropriate approved execution environment; never weaken transactional behavior for the sandbox. There is no repository lint script. OCR is unaffected.

Browser QA uses isolated fake identities, temporary local Mongo and fake mail transports. Demonstrate actual vendor login after setup, visible account-active state in Procurement, manual resend, existing-account notification, paused/unavailable states, and already-issued order recovery. Store only sanitized screenshots/results under `/tmp/lisno-vendor-email-fix/`, and stop owned services/browser sessions afterward.

## Rollout and handoff

- Document omitted-flag behavior, explicit pause, provider prerequisites, historical manual recovery, and required additive indexes. No deployment, production config change, index mutation, backfill, real email, commit, push, or dependency installation is part of this implementation authorization.
- Report local fake-provider dispatch/acceptance evidence separately from unverified real provider/inbox delivery. Do not say the user's deployed email problem is fixed unless that environment is separately verified.
- Record each task's status and exact commands/results here during execution. Distinguish confirmed baseline failures, unresolved feature failures, and unrun checks. Do not mark the feature complete with unresolved acceptance criteria.
- Final handoff names both Procurement entry points, explains active-account behavior, links affected files/verification evidence, and states any deployment/provider work still needed.

## Execution record

- Baseline snapshots: `/tmp/lisno-vendor-email-fix/baseline/` (120 preserved dirty/untracked files plus tracked diff).
- Baseline backend onboarding/repository: 34/34 passing. Baseline frontend affected views: 26/26 passing. Backend integration/authorization/OpenAPI/server: 171/171 passing. First sandbox socket-denied attempt excluded; authorized local rerun passed.
- T1 public contract frozen in `backend/src/contracts/vendor-access.ts`. Primary owns environment/lifecycle/authorization/OpenAPI integration; backend and frontend agents own independent slices; a separate test agent owns startup and three issuance regression suites.

- Initial integration results: backend config/server/authorization/route/OpenAPI 241/241 pass; actual startup plus HTTP direct issuance 7/7 pass with no manual processor call; new invitation/manual recovery/onboarding focused tests 44/44 pass. Additional edge tests and browser QA remain in progress; these are interim results.
- T2–T4 implemented: separate manual-vendor intents and source authority, narrow read/send/resend routes, omitted-flag delivery readiness, post-commit wakes for all issuance families, operation inventories, and Procurement vendor/order controls. No dependency or actual environment-file change.
- Initial integrity review identified a lost-acknowledgement defect for explicit resends. T5 correction persists a private command/generation receipt while preserving invitation authority; deterministic resend replay and manual/automatic race tests are being verified. No public DTO change.
- Browser QA identified a stale queued success notice after delivery became sent. Both panels now derive that notice from the latest query state; focused frontend checks passed 51/51 plus typecheck after the correction. Final browser matrix remains pending.
- Startup acceptance passed 7/7 with the actual server/application and fake provider, including HTTP setup acceptance and login, active-account notification, pause/unavailable handling, backlog exclusion, and provider failure. Direct-order and basket-issuance checks passed 19/19 and 26/26. Project-request checks passed 13/18; the five failures were independently reproduced on unchanged HEAD `67bdb78997671068803d6c5f051dddfc16c80554` (`/tmp/lisno-vendor-email-fix/request-baseline-confirmed.log`). Final integrated rerun remains required.
- T5 closed: independent integrity re-review found no unresolved confirmed defects. Its isolated explicit-resend replay returned `replayed: true`, two total provider sends (initial plus explicit resend), final state `sent`, authority preserved, and private receipt omitted from the public DTO. Reviewer checked Mongo/memory parity, unrelated-generation rejection, concurrent initial-send final status, and both frontend status transitions.
- Backend correction verification: eight focused suites passed 218/218, followed by the final manual/onboarding replica suites at 42/42 and typecheck. Frontend final correction focused checks passed 51/51 and typecheck. These focused results precede T6 full-suite execution.
- Browser setup acceptance returned HTTP 201; the newly created vendor signed in using the real login form and reached Assigned work. Root inspected desktop/320-pixel login-access and account-active screenshots; no visual defect found. All fixtures are isolated and provider calls fake.
- T6 interim: both workspace typechecks passed; final two-panel rendered regressions passed 21/21; final backend startup/manual/onboarding group passed 62/62 together in the authorized local-socket environment. The initial sandbox EPERM run is excluded from product results. Full suites/builds remain pending.
- Browser checks additionally passed existing-account work notification and legacy issued-order invitation, with separate provider counters and no real mail. Both panels passed 1440/390/320-pixel overflow and axe checks; paused/unavailable detail states at 320 pixels offered no send action. Root inspected corresponding order and paused screenshots.
- Browser QA complete: eight axe scans returned zero violations, all measured document/body widths matched their viewports, dirty contact edits survived a background access refresh, discard restored keyboard focus, and positive order/readiness/editor flows produced zero console errors or failed responses. Evidence: `/tmp/lisno-vendor-email-fix/qa/results.json`. The issued-order browser scenario mounted the real component in a temporary entry against the real API; backend integration covers actual issuance families. Only Chromium was exercised. Owned browser and local services were stopped; fixture setup/work emails remained fake.
- Both production builds passed; frontend reports its existing large-chunk warning. Full-suite failures are being compared with an unchanged-HEAD temporary copy before final classification. No frontend or backend product writes remain in progress.
- Frontend full run (`npm test -- --maxWorkers=2`): 4,424 passed, 29 failed across 289 files. One failure was a stale permission-prefix assertion in this task's test inventory; corrected to assert both new vendor permissions and all seven execution permissions. Final inventory/client-review rerun passed 19/19. One unrelated Client review failure did not reproduce on either current or unchanged HEAD (13/13 each). The other 27 failures reproduced by exact test name on unchanged HEAD across eight files. The baseline run had two additional KnowledgeScreens timing failures not present in the full current run. Logs: `final-frontend-full.log`, `final-frontend-inventory-client-rerun.log`, `final-frontend-head-baseline-complete.log`, and `final-frontend-head-client.log` under `/tmp/lisno-vendor-email-fix/`. Full frontend suite is not green; no unresolved feature regression was found.

## Final verification and handoff

Both approved features are implemented locally. The automatic path is woken only after issuance commits; the manual path is available at Procurement → Vendors → vendor details → Vendor login access and in issued-order access. Existing active vendor accounts receive work notifications without password or identity changes. Explicit delivery pause is preserved, and historical/paused backlog requires manual recovery.

| Final check | Result | Evidence under `/tmp/lisno-vendor-email-fix/` |
| --- | --- | --- |
| Backend focused startup, manual access, onboarding | 62/62 passed | `final-backend-focused-authorized.log` |
| Frontend focused access panels | 21/21 passed; broader affected UI checks 51/51 passed | `final-frontend-focused.log`; `qa/results.json` |
| Both `npm run typecheck` | Passed; frontend repeated after test-only inventory correction | `final-backend-typecheck.log`, `final-frontend-typecheck-after-inventory.log` |
| Both `npm run build` | Passed | `final-backend-build.log`, `final-frontend-build.log` |
| Backend `npm test -- --maxWorkers=2` | 4,874 passed / 18 failed; 234 passing / 8 failing files | `final-backend-full.log` |
| Backend unchanged-HEAD comparison | Exact 16 baseline failures reproduced; 337 passed | `final-backend-head-baseline.log` |
| Backend isolated suggestions rerun | 22/22 passed; the other two full-run failures were fixture timeout/duplicate-fixture cascade | `final-backend-suggestions-rerun.log` |
| Frontend `npm test -- --maxWorkers=2` | 4,424 passed / 29 failed; 279 passing / 10 failing files | `final-frontend-full.log` |
| Frontend unchanged-HEAD comparison | Exact 27 baseline failures reproduced; two additional baseline-only timing failures | `final-frontend-head-baseline-complete.log` |
| Frontend final corrected inventory/client review | 19/19 passed; client review also 13/13 on HEAD | `final-frontend-inventory-client-rerun.log`, `final-frontend-head-client.log` |
| Browser interactions/responsive/accessibility | All requested flows passed; 8 axe scans with zero violations; no overflow at 1440/390/320 pixels | `qa/results.json` and sanitized PNGs |
| Final `git diff --check` / `git status --short` | Passed; pre-existing work preserved, no staging/commit | Final verifier and primary checks |

The full-suite counts above are the actual original run outcomes, not adjusted totals. Only the corrected test and timing-sensitive failures were rerun afterward. The stable failures outside this feature remain unresolved: 16 backend and 27 frontend. Their exact names and assertion evidence are in the linked log paths; the unchanged comparison used HEAD `67bdb78997671068803d6c5f051dddfc16c80554` without modifying the worktree.

Commands were executed in their respective workspaces as specified in the verification matrix. The focused final backend command was:

```sh
npm test -- tests/vendor-access-startup.replica-set.test.ts tests/procurement-vendor-access.replica-set.test.ts tests/vendor-work-onboarding.replica-set.test.ts tests/vendor-work-onboarding.test.ts tests/procurement-vendor-access.test.ts --maxWorkers=2
```

Final targeted reruns were:

```sh
# Backend
npm test -- tests/project-vendor-suggestions.replica-set.test.ts --maxWorkers=1
# Frontend
npm test -- src/api/authorization-contract.test.ts src/features/client/ClientProject.estimateReview.test.tsx --maxWorkers=1
```

Principal implementation files are `backend/src/services/vendor-work-onboarding.service.ts`, `procurement-vendor-access.service.ts`, `user-invitation.service.ts`, the new manual-intent model and vendor-access contract/routes, application/server integration, the three issuance services, and `frontend/src/features/procurement/VendorLoginAccessPanel.tsx` plus `frontend/src/features/execution/VendorAccessPanel.tsx`. Permission, audit, route and OpenAPI inventories were synchronized. No dependency was added.

Remaining operational limits: production configuration, real provider acceptance and inbox arrival are unverified; no deployment, production index application, data migration/backfill, actual environment edit, customer communication, commit or push occurred. Backend mail configuration was inspected only for key presence and delivery-override status, never credentials. Local SMTP keys are present and the override is omitted, but this does not establish delivery validity. OCR is unaffected; there is no lint script. Browser QA used Chromium and isolated fake transports, not physical devices. Existing Mongoose deprecation and frontend bundle-size warnings remain. Build outputs are ignored; temporary evidence and the unchanged-HEAD comparison copy are under `/tmp/lisno-vendor-email-fix/`. Owned browser and QA services were stopped.
