# Designer resubmission readiness: task plan

Status: specification and task plan approved; Mode A selected on 2026-10-01. T1–T5 complete; integrated verification passed.

Source of truth: [approved specification](../specs/2026-10-01-designer-resubmission-readiness-design.md).

## Outcome and settled contract

Identify old returned drawings that remain active after a Designer uploads an additional plan. Explain how to resolve them using existing Replace or eligible upload-deletion controls, then permit submission once the current drawing set is ready.

- Keep `POST /estimates/:estimateId/design-drawings/submit` and its request/success response unchanged.
- Use HTTP 409 with `DESIGN_PLAN_RETURNED_DRAWINGS_PENDING` for unresolved current returned drawings in the commercially approved Designer flow. Provide an actionable message through the existing error envelope; no new response-detail schema is required.
- Preserve `DESIGN_PLAN_REVISION_CONFLICT` for genuinely inconsistent review preparation and existing stale-revision checks for concurrent edits.
- The UI derives its explanatory list from authorized workspace drawing IDs and latest revisions. The backend independently validates the transaction's current drawing set.
- A new upload remains an additional file. Superseding an old upload requires the existing explicit user action and confirmation. Approval protections, review history and audit behavior remain authoritative.

## Dependency order and ownership

`T1 baseline/contract → T2 backend + T3 frontend → T4 integration/review → T5 final verification`

Only one parent task is in progress at a time. In Mode A, T2 and T3 may run concurrently after T1 with non-overlapping ownership. In Mode B, execute inline. Do not start agents or implementation before the execution choice.

### T1. Preserve the worktree and establish the regression case

Owner: primary agent. Criteria: AC1–AC5.

- Capture `git status --short` and relevant target diffs under a temporary task directory. Preserve earlier upload, furniture, Client review and Project status changes, especially the already modified frontend upload component.
- Confirm the latest-current-revision selection, Designer-only applicability and error code/message before assigning writers.
- Establish a synthetic regression fixture with one old returned drawing and one newly uploaded draft. No live project reads/writes or real email are needed.

### T2. Add backend readiness validation and transactional regressions

Owner: backend implementer in Mode A; primary agent in Mode B. Criteria: AC1, AC3–AC5.

Owned paths:

- `backend/src/services/estimate-design.service.ts`
- `backend/tests/project-workflow-mongo.replica-set.test.ts`
- Relevant focused submission tests in `backend/tests/estimate-design-extraction.test.ts` or `estimate-design-review.test.ts` only where they cover an additional risk.

Tasks:

1. After validating the transaction's current drawing/revision set, reject outstanding `changes_requested` latest revisions with the dedicated readiness error before revision bulk updates and review preparation. Apply this guard to the commercially approved Designer submission flow; preserve commercial Estimator behavior.
2. Keep the final `prepareDesignReview` guard, lifecycle/CAS protection, workflow prerequisites, attachment checks and supported approved-revision resubmission behavior intact.
3. Add Mongo regressions for the reported old-returned-plus-new-draft case. Assert that rejection commits no revision changes, review round, audit event or delivery.
4. Exercise existing explicit deletion of an eligible superseded upload followed by successful submission of the new plan. Verify exactly one new review round, correct current revisions/attachments and preserved earlier history.
5. Cover returned-drawing replacement followed by submission, approved-plus-draft and supported no-draft approved resubmission. Retain true stale-revision failure and approval/deletion protection checks.

Do not modify the upload-deletion service or final review guard unless a concrete defect within the approved scope is found and reconciled with the primary agent. No automatic retirement or changes to approved records.

### T3. Show Designer readiness and actionable errors

Owner: frontend implementer in Mode A; primary agent in Mode B. Criteria: AC2–AC5.

Owned paths:

- `frontend/src/features/leads/EstimateDesignUploads.tsx`
- `frontend/src/features/leads/EstimateDesignUploads.test.tsx`
- Existing component-scoped styles only if needed for wrapping/accessibility.

Tasks:

1. Identify active drawings whose latest revision is returned. Ignore historical returned revisions when a current replacement exists.
2. In the editable Designer variant, show a compact list of outstanding drawing names and explain that ordinary uploads add separate plans. Guide the user to existing Replace controls and eligible upload-deletion controls, retaining confirmation and permission handling.
3. Disable submission for known unresolved returned drawings and pending extraction. Keep replacement/removal actions usable. Preserve other workspace variants and valid submission cases.
4. Render safe actionable API error messages. Refresh the workspace and relevant workflow queries after readiness/stale failures so a concurrent update is visible; provide loading/error handling for this refresh.
5. Add rendered tests for the reported case, historical-versus-current revisions, removal/replacement clearing the blocker, approved-plus-draft submission, API error visibility and refresh. Check accessible naming and keyboard use for any added links/controls.

No new API requests, dependencies, broad redesign or automatic deletion.

### T4. Integrate and review

Owner: primary agent; read-only integrity reviewer in Mode A after writers finish. Criteria: AC1–AC5.

- Reconcile backend error handling and frontend readiness while preserving the original dirty diffs.
- Review authorization, current-revision lineage, rollback, immutable review history, protected approved uploads and post-commit delivery behavior.
- Verify the UI cannot bypass backend guards and that a changed workspace can recover without a page reload.
- Fix confirmed findings, then finish all writers before final verification.

### T5. Verify and hand off

Owner: verification runner in Mode A after review fixes; primary agent in Mode B. Primary agent owns browser inspection. Criteria: AC1–AC5.

Run focused checks, expanding only for a concrete remaining risk:

```text
# backend/
npm test -- tests/project-workflow-mongo.replica-set.test.ts tests/estimate-design-upload-delete.replica-set.test.ts
npm test -- tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/leads/EstimateDesignUploads.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx
npm run typecheck
npm run build

# repository root
git diff --check
git status --short
```

- Render the Designer workspace with synthetic old/new plan fixtures at desktop and mobile widths. Check long drawing names, accessible blocker text, existing Replace/delete confirmation, successful readiness refresh and actionable failure display.
- Use synthetic Mongo replica-set data and mocked storage/email; never delete the user's old upload or send a real review email during verification.
- Report exact checks/results, affected files, unrun checks and remaining limits. Keep logs/screenshots outside tracked sources. No lint script exists.
- No dependencies, migrations, seeds, commits, pushes, deployment or production mutation are planned.


## Execution record

- Initial dirty-path set and diff captured in `/tmp/lisno-designer-resubmission/prior-status.txt` and `prior-work.diff`. The existing upload component changes were reviewed before assigning its owner; they preserve deletion permission gating and workflow/client invalidation. Backend target paths were clean.
- Backend and frontend implementations have explicit separate ownership. Primary agent owns integration, browser QA and these documents.
- Backend added the Designer readiness guard before writes and six Mongo regression cases. The existing commercial-approval fixture was aligned with the immutable Client publication contract; its original assertions remain intact.
- Frontend lists every active returned drawing by stable ID, provides a direct existing Replace action, blocks known-invalid submissions, and refreshes affected queries on conflict. Earlier deletion permissions and query invalidations were preserved.
- Independent integrity review found no confirmed defects in authorization, transaction ordering, history preservation, deletion protections or refresh recovery.
- Browser QA passed with synthetic API fixtures at 1440px and 390px: blocker visibility, long-name wrapping, no horizontal overflow, Replace dialog and keyboard focus restoration, delete cancellation, explicit synthetic deletion followed by submission, and stale-409 refresh/retry. No customer records or real email were used. Screenshots and fixture scripts are in `/tmp/lisno-designer-resubmission/`; the temporary browser and Vite server were closed.

## Final verification evidence

| Check | Result | Acceptance criteria |
| --- | --- | --- |
| Backend: `npm test -- tests/project-workflow-mongo.replica-set.test.ts tests/estimate-design-upload-delete.replica-set.test.ts tests/estimate-design-extraction.test.ts tests/estimate-design-review.test.ts` | 155 tests passed across four files, including real Mongo replica-set transaction tests | AC1, AC3, AC4, AC5 |
| Frontend: `npm test -- src/features/leads/EstimateDesignUploads.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx` | 62 tests passed across two files | AC2, AC3, AC4, AC5 |
| Synthetic Playwright interaction checks and visual inspection | Desktop 1440px and mobile 390px passed; the expected mocked HTTP 409 was the only browser error | AC2, AC3, AC5 |
| Backend: `npm run typecheck` and `npm run build` | Both passed, exit 0 | AC5 |
| Frontend: `npm run typecheck` and `npm run build` | Both passed, exit 0 | AC5 |
| Repository: `git diff --check` and `git status --short` | Passed; unrelated original dirty work preserved and task browser outputs moved outside the repository | AC5 |

Non-failing warnings: backend tests report Mongoose `new` option deprecations; frontend Vite build reports chunks over 500 kB (largest JavaScript chunk 2,125.43 kB, gzip 582.87 kB). These warnings do not prevent the verified submission flows.

Verification generated ignored build outputs in `backend/dist/` and `frontend/dist/`, TypeScript build information in `frontend/node_modules/.tmp/`, and test/tool caches under ignored `node_modules/`. Browser evidence is outside the repository in `/tmp/lisno-designer-resubmission/`.

Affected product files: `backend/src/services/estimate-design.service.ts`, `frontend/src/features/leads/EstimateDesignUploads.tsx`, and `frontend/src/styles/designer-design-plans.css`. Regression additions are in `backend/tests/project-workflow-mongo.replica-set.test.ts` and `frontend/src/features/leads/EstimateDesignUploads.test.tsx`.

No full repository suites or OCR checks were run because the change is limited to Design submission/readiness. No lint script exists. No dependencies, migrations, customer data changes, real email, commits, pushes or deployment were performed. The user's actual failed upload was not inspected or changed; existing returned drawings still require an explicit Replace or eligible superseded-upload deletion before resubmission.
