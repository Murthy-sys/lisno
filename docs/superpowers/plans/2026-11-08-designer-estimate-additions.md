# Designer estimate additions: task plan

Date: 2026-11-08
Status: Implemented and verified

## Authority and scope

The user approved the [Designer estimate additions specification](../specs/2026-11-08-designer-estimate-additions-design.md).
Its requirements and AC1–AC5 govern this plan. The user approved both documents
and selected Mode A. Implementation and focused local verification are authorized.

Restore a clear entry point to the existing staff editor after initial Client
approval, and verify that the assigned Designer can add, save and resubmit items.
No permission expansion, new editing API, dependency, migration or unrelated
redesign is planned. Keep one parent task in progress.

## 1. Capture the baseline and reproduce the missing flow

Owner: primary. Depends on execution authorization. Covers AC1–AC5.

- Capture the dirty-path list and per-target diffs before assigning writers.
  `ProjectQuotationWorkspace.test.tsx`, `LeadEstimateWorkspace.tsx` and
  `ConfiguredEstimateBuilder.tsx` already contain approved earlier work, as do
  related tests. Preserve those changes; no resets or blanket formatting.
- Trace the initially approved, post-phase draft through the Designer task DTO,
  project quotation page and staff editor. Use synthetic primary/secondary
  identities and two different project/estimate/lead ID sets.
- Reproduce whether the absent control is the project entry point, the editor's
  Add items picker, or both. The existing picker must be reused when it already
  works; do not replace Designer presentation with the Sales catalogue by default.
- Confirm the existing capability/query key, freshness and invalidation rules.
  Treat pending/closed states separately from permission to view the staff editor.

## 2A. Restore the Designer entry points

Owner in Mode A: `frontend_implementer`; Mode B: primary.
Depends on task 1. Covers AC1, AC4 and AC5.

Owned files:

- `frontend/src/features/estimates/ProjectQuotationWorkspace.tsx`
- `frontend/src/features/estimates/ProjectQuotationWorkspace.test.tsx`
- `frontend/src/features/designer/DesignerDesignPlanTasksPage.tsx`
- `frontend/src/features/designer/DesignerDesignPlanTasksPage.test.tsx`

Use the established Designer task read and backend `canEditQuotation` capability,
joined by exact project/estimate IDs, to resolve the correct lead editor route.
Show **Add / edit estimate items** for an eligible current draft/initially approved
estimate. Preserve viewing and the existing explicit reopening flow for closed
states, without suggesting they are immediately editable. Place the action beside
the estimate context using existing components.

Keep Client rendering and secondary/unrelated Designer restrictions intact.
Handle missing/ambiguous identities, loading, refresh/error and account/project
changes without showing a stale editing action. Add rendered tests for these
states, including keyboard access and accessible names.

Do not edit the staff editor, shared API types, backend or shared styles. Return a
demonstrated shared dependency to the primary. Any small shared helper is owned
and integrated by the primary only if existing patterns require it.

## 2B. Verify and repair the existing add/save/submit path

Owner: primary in either mode. Depends on task 1; may run alongside 2A in Mode A.
Covers AC2–AC5.

Owned files under `frontend/src/features/leads/`:

- `LeadEstimateWorkspace.tsx` and its collaboration/catalogue tests.
- `ConfiguredEstimateBuilder.tsx` and its existing tests, only if reproduction
  demonstrates a local restriction that must change.
- Existing collaboration query invalidation only if a demonstrated stale-state
  issue prevents the required flow.

Exercise a real Designer role with an initially approved post-phase draft. Open
Add items, select one absent item in one room, save and reload, then submit the
saved revision for Client reapproval. Assert exact selected item identity,
unchanged unrelated items/rooms and approval snapshot, versioned save/submit, and
no duplicate addition. Keep the existing save-conflict/retry protections.

Make only the local corrections demonstrated by these tests. Do not modify Sales
recommendation behavior, pricing rules, approval semantics or publication logic.
If an incompatible backend contract is discovered, stop that dependent slice and
present the evidence before expanding the approved scope.

## 3. Integrate and review

Owner: primary. Depends on both slices finishing. Covers AC1–AC5.

- Review the combined diff and confirm the initial dirty work is preserved.
- Verify exact project/estimate/lead matching and reuse of the staff editor, so
  Client-only projections never replace internal draft lines.
- In Mode A, use a bounded read-only `integrity_reviewer` after writers stop; in
  Mode B, perform the equivalent review inline. Check role isolation, stale cache,
  pending/closed approvals, save/version lineage and duplicate additions.
- Resolve confirmed findings before final verification. Tell every Mode A writer
  they share the worktree and must preserve others' changes; no overlapping paths.

## 4. Focused verification and handoff

Owner in Mode A: `verification_runner` for automated checks, primary for browser
inspection; Mode B: primary. Depends on task 3 and frozen product sources.

From `frontend/`, run the relevant existing suites once on final sources:

```sh
npm test -- src/features/estimates/ProjectQuotationWorkspace.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx
npm run typecheck
npm run build
```

Add a directly affected suite only when a changed shared consumer warrants it.
Do not run full frontend/backend repository suites. Backend checks are limited to
a focused contract test if a backend change becomes explicitly in scope. No OCR
checks or lint claim; this repository has no lint script.

Use the real components with synthetic responses at desktop and mobile widths.
Check the entry point, item picker, one-item addition, save/refresh, submission,
permission/error states, focus and overflow. No real projects or Client messages.

Run `git diff --check` and `git status --short`; compare earlier dirty diffs.
Record exact results and any limitations against AC1–AC5 in this plan. Stop and
clean task-owned browser/server/fixture artifacts. Report principal changed files,
verification and unrun checks. Do not stage, commit, push, migrate or deploy.

## Execution evidence

- Initial status and tracked diff captured in `/private/tmp/lisno-designer-additions-initial-status.txt` and `/private/tmp/lisno-designer-additions-initial.patch` before writers started. Prior changes in dirty targets were inspected and assigned explicitly.
- Pre-edit focused baseline: **111 passed** across the five planned files.
- The existing Designer editor's Add items picker works without product changes. A new rendered regression adds exactly one previously absent item after initial approval, preserves the other room and internal lines, saves/reloads, and submits the current saved revision for reapproval. The collaboration suite passes **25 tests** with this coverage.
- Entry-point implementation and temporary synthetic browser fixture are proceeding on separate owned paths. No backend change is needed.
- Entry-point writer finished with **53 passing tests** across the project quotation and Designer workspace suites. Exact project/estimate identity, primary capability, approval state and refreshed session data govern the link.
- Browser checks passed at **1440×900** and **390×844**: keyboard entry into the exact lead editor, one-item addition, no duplicate add, save/reload persistence, unchanged Bedroom/internal line/initial approval, current-version resubmission and secondary read-only access. No runtime/console errors or horizontal overflow. Both entry-point screenshots were visually inspected.
- Primary made one related copy correction in `ClientQuotation.tsx`: “Read-only estimation preview.” The old assignment-based sentence was misleading beside an authorized primary Designer's editor link. Earlier changes in that dirty file were inspected and preserved. Include its focused test suite in final verification; no Client editing behavior changed.
- **45** prior dirty tracked paths remain byte-for-byte unchanged. Three dirty paths within the task were reviewed to preserve earlier changes.


## Final results

- **AC1 / AC4:** Project quotation and Designer workspace entry points use backend primary capability, exact project/estimate/lead identity and current approval state. Pending/final states retain View estimate and existing reopening rules. Loading, error, ambiguous identity and stale/session data fail closed. Existing Client rendering and secondary restrictions remain intact.
- **AC2 / AC3:** The existing staff editor required no product changes. New rendered coverage and real-browser checks confirm exactly one selected addition, preservation of the other room/internal scope/initial approval, save/reload persistence and submission of the saved current version for Client reapproval.
- **AC5:** Final six-suite command below passed **157 tests**, exit 0. Typecheck found a test-only unsupported selector option; it was removed, then the affected collaboration suite passed **25/25** again. Product sources did not change during this correction. `npm run typecheck` and `npm run build` both exited **0**. Vite built in 9.46 seconds with the existing >500 kB chunk warning.

```sh
cd frontend
npm test -- src/features/estimates/ProjectQuotationWorkspace.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/client/ClientQuotation.test.tsx
npm test -- src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx
npm run typecheck
npm run build
```

The independent integrity review found no confirmed defects. Synthetic browser
checks covered five desktop/mobile flow cases and two visually inspected entry
screens, with no unexpected writes, console/runtime errors or horizontal overflow.
Final `git diff --check` and `git status --short` passed. All 45 earlier dirty
tracked paths outside this task remain byte-for-byte unchanged; earlier changes
in the three owned dirty paths were preserved.

Product files changed: `ProjectQuotationWorkspace.tsx`,
`DesignerDesignPlanTasksPage.tsx`, and the read-only preview sentence in
`ClientQuotation.tsx`. Regression coverage changed their two workspace suites and
`LeadEstimateWorkspace.collaboration.test.tsx`.

No backend/API/permission changes, dependencies, migrations, seeds, commits,
pushes, deployment or customer communication occurred. Full repository suites,
backend and OCR checks were intentionally not run for this frontend-only change;
there is no lint script. Real production data was not used. Ignored
`frontend/dist/` and TypeScript/Vite caches were refreshed by verification.
Temporary browser/server, fixture, screenshots and task logs were removed.
