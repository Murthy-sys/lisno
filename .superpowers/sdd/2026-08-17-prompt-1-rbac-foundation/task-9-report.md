# Task 9 report — Estimation route authorization

## Scope

- Plan task: Task 9 only, matrix rows 40–84.
- Base HEAD: `b3d0b80a2a2f2ef68001cb9146881a259c3cb4eb`.
- No Task 10 access-request route or workflow was implemented.
- Estimation remains a non-project ownership namespace. No Estimation production path consults `ProjectAccessGrant`.

## Task 9A — Estimate Design rows 40–53

RED:

- `npm test -- tests/route-operation-registry.test.ts -t "Estimate Design"`
- Failed because `POST /estimates/:estimateId/design-uploads` and the remaining Estimate Design routes had no operation marker.

Implementation:

- Mounted `authenticate -> requireOperation` exactly once for all rows 40–53.
- Kept upload, retry, manual drawing, annotation, decision, edit, assignment, delete, replacement, and submission personal.
- Added narrow Super Admin readers for workspace reads and client-visible reads only.
- Kept strict Estimator ownership and Client relation helpers for every mutation.
- Ensured workspace, source image, revision image, and client drawing reads do not consult project grants.

GREEN:

- Estimate Design integration: 2 files, 51 tests passed.
- Estimate Design registry focus: 1 test passed.
- Backend typecheck passed.

Commit: `9a1cebe feat: enforce estimate design authorization`

## Task 9B — Estimate Plan Review rows 54–65

RED:

- `npm test -- tests/route-operation-registry.test.ts -t "Estimate Plan Review"`
- Failed because the Plan Review routes had no operation markers.

Implementation:

- Mounted `authenticate -> requireOperation` exactly once for all rows 54–65.
- Kept annotation draft, change-request creation, and Client request update personal.
- Added Super Admin global reads for Client plan pages, previews, staff queues/details, and staff page images.
- Super Admin client-shaped reads resolve the estimate's actual active Client account from the Lead email. Draft and request queries never use the Super Admin ID.
- Staff ownership/assignment rules remain unchanged for Estimator, Designer, Manager, and Head.
- Target linking and page resolution allow Super Admin and audit `actorId` as the actual Super Admin.

GREEN:

- Plan Review Client/Staff integration: 2 files, 12 tests passed.
- Plan Review Super Admin/registry focus: 13 tests passed, 140 skipped.
- Backend typecheck passed.

Commit: `57eb6d9 feat: enforce estimate plan review authorization`

## Task 9C — Lead rows 66–71

RED:

- `npm test -- tests/route-operation-registry.test.ts -t "Lead operations"`
- Failed because `GET /leads` and the remaining Lead routes had no operation markers.

Implementation:

- Mounted `authenticate -> requireOperation` exactly once for rows 66–71.
- Added repository-level `pageAllLeads` and a distinct Lead reader path for Super Admin.
- Kept create, update, and activity-create strictly Estimator-owned and personal.
- Super Admin may globally page/read Leads and read Lead activities.
- Memory and Mongo repositories implement the same global paging filters and ordering.

GREEN:

- Lead integration: 15 tests passed at slice completion.
- Lead Super Admin/registry focus: 7 tests passed, 153 skipped.
- Backend typecheck passed.

Commit: `b0bb895 feat: enforce lead operation authorization`

## Task 9D — Estimate rows 72–84 and legacy role-gate cleanup

RED:

- `npm test -- tests/route-operation-registry.test.ts -t "Estimate operations|mounts exactly the 84"`
- Failed because rows 72–84 were unmarked and the exact mounted-baseline assertion was incomplete.

Implementation:

- Mounted `authenticate -> requireOperation` exactly once for rows 72–84.
- Super Admin global reads omit owner/email restrictions only for rows 72–73, 76–78, and 82–83.
- Review queue returns both pending-manager-assignment and pending-Designer-approval estimates for Super Admin.
- Assignable Designers returns every active Designer for Super Admin.
- Assignment validates the selected active Designer and that Designer's active accountable Manager, stores the Manager ID rather than the Super Admin ID, preserves workflow/review/notification behavior, and writes an audit event for the real Super Admin actor.
- Save, submit, Designer decision, send-client, and Client decision remain personal and return 403 before validation or Mongoose entry for Super Admin.
- Client list/PDF reads preserve client-visible status restrictions while avoiding Super Admin email filtering.
- Removed the final `authorizeRoles` implementation and all callers.
- Deleted `src/domain/permissions.ts` and removed obsolete role-gate unit tests while retaining authentication/stored-role/inactive-user/client-signup coverage.
- Registry coverage proves exactly 84 baseline rows are mounted once. `GET /auth/authorization` is also mounted, making 85 mounted Prompt 1 operations; only rows 86–93 remain absent.

Focused GREEN:

- Lead/PDF/Auth focus: 3 files, 53 tests passed.
- Estimate Super Admin/registry focus: 7 tests passed, 160 skipped.
- Row 79 compatibility focus: 1 passed, 11 skipped.
- Backend typecheck passed.
- `rg` found no `authorizeRoles`, `isRoleAuthorized`, or `domain/permissions` production/test references.

Commit: `79fb66d feat: enforce estimate operation authorization`

Compatibility commit:

- `f4cd67c test: align estimate assignment characterization`
- `full-journey.test.ts` is outside the top Task 9 file map but contains the Task 8 row-79 compatibility characterization. The approved row-79 implementation necessarily performs two user lookups: selected Designer, then active accountable Manager. The prior assertion expected only the first lookup.
- A fifth scoped test-only commit was used because the attempted amend required an unavailable filesystem escalation; the parent explicitly directed the normal approved commit flow to avoid another approval wait.

## Full-suite evidence

Diagnostic full run after the four feature commits:

- 44/45 files passed.
- 816/817 tests passed.
- Only failure: the stale row-79 characterization expected `UserModel.findOne` once, while the approved accountable-manager validation correctly calls it twice.

After the compatibility assertion update:

- `npm test -- --reporter=dot`
- 45/45 test files passed.
- 817/817 tests passed.
- Duration: 7.47 seconds.
- Backend typecheck passed after the final code/test state.

## Boundary and safety review

- Every row 40–84 has one ordered authentication marker and one matching operation marker.
- Personal Super Admin operations are denied before validation, multipart parsing, service entry, or direct-Mongoose access as applicable.
- Global reads and admin overrides retain existing Estimator owner, Client relation, Designer/Manager assignment, OCR/image/annotation, calculation/PDF/email/notification, workflow/version, and audit behavior.
- Tests explicitly spy `findActiveProjectAccessGrant`, `listProjectsForUserInModule`, and `pageProjectsForUserInModule` for Estimation reads and assert zero calls.
- No stale legacy role-gate import remains.
- No Prompt 2 behavior was added.

Known concerns: none remaining after focused tests, typecheck, registry coverage, and the final 817-test backend suite.

## Fix Round 1 — estimation authorization guarantees

Review findings reproduced (RED):

- Estimate Design client-shaped identity:
  - `npm test -- estimate-design-review.test.ts -t "uses the related Client draft identity" --reporter=dot`
  - The related Client's saved annotation draft was absent because the lookup used `clientId: "user-super-admin"`.
- Plan Review integration identity:
  - `npm test -- estimate-plan-review-client.test.ts -t "runs Super Admin Plan Review through the real related-Client Estimate Design reader" --reporter=dot`
  - The real Estimate Design reader reached through Plan Review queried the design draft under `super-admin-1` instead of the related Client.
- Typed/atomic row 79 audit:
  - `npm test -- authorization-policy.test.ts -t "registers estimate assignment" --reporter=dot`
  - `estimate_designer_assigned` was absent from the typed audit catalog.
  - `npm test -- leads.test.ts -t "rolls back row 79" --reporter=dot`
  - The route returned 200 because assignment state was saved before a separate non-transactional audit append.
- Matrix test contract:
  - The prior green suite used hand-maintained grouped arrays rather than manifest-derived cases. It had no `requestCaseFor`, no four row slices, no valid stripped-gate bodies/multipart for personal operations, no exact-key cases for all rows 72–84, no existing-role control per row, and no meaningful three-grant-spy proof in each family.
  - This was a test-contract RED discovered by independent fixture comparison: the old tests passed while omitting required guarantees, which is the failure the replacement contract is intended to prevent.

Implementation:

- `estimateDesigns.listClient` now receives the Client identity from `requireClientVisibleEstimateReader`. For Super Admin, that helper resolves the active Client account by the related Lead's normalized email; design drafts never use the Super Admin ID. Strict Client mutations still use the authenticated Client ID.
- A real Plan Review integration test calls the real Estimate Design service, contains a related Client draft, and proves the draft query uses the related Client ID. Existing Plan Review integration also proves related Client requests are returned rather than querying under Super Admin.
- Added `estimate_designer_assigned` to `EXISTING_AUDIT_ACTIONS`, retained the exact nine `PROMPT_1_AUDIT_ACTIONS`, and typed `AuditWrite.action` as `AuditAction`.
- Row 79 now performs selected active Designer lookup, active accountable Manager lookup, assignment/review/notification mutation, `estimate.save({ session })`, and `appendInMongoTransaction` under one Mongo transaction. It stores the selected Designer's actual Manager and audits the actual Super Admin actor.
- A real replica-set rollback test proves an audit insert failure leaves persisted status, assigned IDs, reviews, notifications, and audit collection unchanged.
- Added row 64 coverage for the actual Super Admin actor and `estimate_plan_page_resolved` audit action, alongside the existing row 63 target-link audit assertion.
- Replaced the grouped Task 9 arrays with fixture-derived `ESTIMATE_DESIGN_CASES`, `ESTIMATE_PLAN_REVIEW_CASES`, `LEAD_CASES`, and `ESTIMATE_CASES`, produced through `requestCaseFor` from independent expected manifest rows 40–84.
- The four slices contain exactly 14, 12, 6, and 13 cases (45 total). Each exact operation key is present in its test name. Every case checks the specified Super Admin result and a valid existing Estimator/Client/Designer/Manager positive control. Personal cases also prove the same valid JSON or multipart input reaches the exact service/direct-Mongoose boundary only when the operation gate is removed.
- All four families authenticate through a real memory repository. `findActiveProjectAccessGrant`, `listProjectsForUserInModule`, and `pageProjectsForUserInModule` are spied on directly and remain at zero for Super Admin, existing-role, and stripped-gate requests.
- The direct-Mongoose Estimate harness replaces only the terminal handler, preserving authentication, operation authorization, validation, and middleware order. Real Lead/Estimate/PDF/full-journey tests continue to cover ownership, relationship, query, workflow, and response behavior.

Fix Round 1 GREEN evidence:

- Client identity focused tests: both new real-service/integration paths passed.
- Row 79 success plus real replica-set rollback: 2 passed, 17 skipped.
- Row 64 staff audit suite: 5 passed.
- Fixture-derived matrix suite: `super-admin-authorization.test.ts`, 146 passed.
- Complete Task 9 focus:
  - `npm test -- estimate-design-upload.test.ts estimate-design-review.test.ts estimate-plan-review-client.test.ts estimate-plan-review-staff.test.ts leads.test.ts estimate-pdf-routes.test.ts super-admin-authorization.test.ts route-operation-registry.test.ts auth.test.ts authorization-policy.test.ts full-journey.test.ts --reporter=dot`
  - 11/11 files passed; 323/323 tests passed.
- Final row 79 recheck after its session assertion: 2 passed, 17 skipped.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Legacy-gate search found no `authorizeRoles`, `isRoleAuthorized`, or `domain/permissions` references.
- Registry coverage remains exactly 84 baseline routes; only rows 86–93 remain unmounted.
- Independent scoped code review found no Critical or Important issues and returned Ready.

Fresh full backend suite after all Fix Round 1 code and tests:

- `npm test -- --reporter=dot`
- 45/45 files passed.
- 830/830 tests passed.
- Duration: 7.96 seconds.

Fix Round 1 commit subject: `fix: complete estimation authorization guarantees`.

Fix Round 1 concerns: none. No Task 10 route, workflow, or Prompt 2 behavior was added.
