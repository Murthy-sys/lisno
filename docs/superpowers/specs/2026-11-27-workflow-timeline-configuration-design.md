# Design and execution timeline configuration

Date: 2026-11-27
Status: Approved and implemented on 2026-11-27. Verification and remaining baseline failures are recorded in the separate task plan.

## Goal and bounded first step

Add a visible **Design & execution timelines** button to the Super Admin Configuration screen. It opens two editable workday charts using the supplied project-value bands and Custom-item percentages. Super Admin edits each row's 0% base workdays; all other cells recalculate automatically and the configuration saves to the backend.

The latest user message identifies the missing Configuration button. This specification covers that independently useful configuration feature. The earlier question about applying completion dates to projects remains unanswered and is outside this first step; it must not block the button, charts or persistent settings.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx` renders the Configuration header actions, beginning with Manage reusable values. It has no timeline button.
- `frontend/src/app/routeRegistry.ts` and `router.tsx` register the existing Configuration index, Main Line and reusable-values pages. No workflow timeline configuration route exists.
- Main Lines already save `customizationType: standard | custom` in `backend/src/models/Estimate.ts`, the estimate API and publication snapshot. This field is separate from Standard/Special pricing classification. `estimate-collaboration-policy.service.ts` deliberately excludes it from commercial revision identity.
- Existing operational stage clocks use calendar-day rules in `backend/src/domain/design-workflow-instructions.ts`; the quotation proposal also contains separate fixed working-day copy in `backend/src/domain/estimate-proposal.ts`. Neither is this configurable chart, and neither should be silently replaced by it.
- A calculation check reproduced all 56 supplied cells using the formula below.
- The worktree contains substantial prior changes. Implementation must capture target baselines and preserve them.

## Interpretation and calculation

“Base price” is interpreted here as **base workdays in the 0% column**, because all editable chart values are durations. This feature does not change monetary prices or project-value band limits.

The column percentage means Custom-item value as a share of total estimated value, not a count of items and not a pricing margin. This page compares the fixed scenarios; it does not yet calculate a particular project's share or pick an estimate version.

For percentage `p` expressed as 0, 5, 10, 15, 20, 25 or 30:

`workdays = ceil(baseWorkdays × (100 + 2 × p) / 100)`

Each 5 percentage-point increase in Custom share adds 10% of the original base duration. Calculate each column from the base, not from the preceding rounded column. Round upward to whole workdays. For example, base 15 at 5% gives ceil(16.5) = 17; base 25 at 15% gives ceil(32.5) = 33.

## Default charts

### Design workdays

| Project value | 0% base | 5% | 10% | 15% | 20% | 25% | 30% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Below ₹10,00,000 | 15 | 17 | 18 | 20 | 21 | 23 | 24 |
| ₹10,00,000 to below ₹15,00,000 | 20 | 22 | 24 | 26 | 28 | 30 | 32 |
| ₹15,00,000 to below ₹20,00,000 | 25 | 28 | 30 | 33 | 35 | 38 | 40 |
| ₹20,00,000 to ₹25,00,000 | 30 | 33 | 36 | 39 | 42 | 45 | 48 |

### Execution workdays

| Project value | 0% base | 5% | 10% | 15% | 20% | 25% | 30% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Below ₹10,00,000 | 40 | 44 | 48 | 52 | 56 | 60 | 64 |
| ₹10,00,000 to below ₹15,00,000 | 50 | 55 | 60 | 65 | 70 | 75 | 80 |
| ₹15,00,000 to below ₹20,00,000 | 70 | 77 | 84 | 91 | 98 | 105 | 112 |
| ₹20,00,000 to ₹25,00,000 | 80 | 88 | 96 | 104 | 112 | 120 | 128 |

Ranges have explicit non-overlapping labels. No rule for amounts above ₹25 lakh or Custom shares above 30% is invented.

## User experience

1. Place the text button **Design & execution timelines** beside the existing Configuration header actions. Keep it visible and keyboard accessible, including when actions wrap on smaller screens.
2. Open `/admin/configuration/estimation/workflow-timelines` within the existing Configuration shell, with a **Back to Configuration** link and the title **Design & execution timelines**.
3. Show Design workdays and Execution workdays as separate labelled tables, each with project-value rows and the seven percentage columns above.
4. Only the eight 0% base cells are editable. Show the 5–30% results as calculated values. Editing one base affects only that phase and value band. Explain that percentages refer to Custom-item value share and that each 5% adds 10% workdays.
5. Support comparison through the complete visible matrix and a short calculation explanation; no charting library or extra dashboard is needed.
6. A **Save timelines** action saves all eight base values together. **Discard changes** restores the last fetched/saved configuration. Disable save while unchanged, invalid or saving; preserve entered values after a failed save.
7. Provide loading, failed-load with retry, save success/error, unsaved-change and concurrent-edit conflict states. Do not turn a failed server read into an apparently saved default configuration.
8. Use semantic table headers, input labels including phase and project-value band, inline validation, keyboard focus and a bounded horizontal table scroll on narrow screens. Preserve the existing visual language without new icons or dependencies.

## Data, API and authorization

- Persist one versioned application configuration containing stable band IDs and eight positive integer base-workday values, with updater identity and timestamps. Fixed bands and percentage columns come from the shared definition.
- Store base days only; derive all other cells with one shared deterministic calculation. Return the calculated matrices from the backend and use the same shared rule for an explicitly unsaved UI preview.
- Proposed API: `GET /admin/workflow-timelines` and `PUT /admin/workflow-timelines`. The update accepts `expectedVersion` and the complete set of base values keyed by stable band ID. Strictly reject unknown fields, missing/duplicate bands and non-integer/out-of-range values; use a documented bound of 1–3650 base workdays.
- Before the first save, GET returns the supplied defaults with revision 0 and no updater. GET performs no writes. The first successful save creates revision 1; simultaneous first saves must not both succeed.
- Use compare-and-swap for later saves. Return a conflict for a stale version without overwriting the newer data. Record a safe audit entry with actor, before/after values and revision. Persistence and its required audit must succeed together.
- Register dedicated read/update operations and permissions, align OpenAPI and frontend contracts, and restrict this configuration to authenticated active Super Admin. Other roles cannot read or mutate it by calling the API directly. Backend authorization is authoritative.
- Keep Mongo and memory repository behavior aligned. Invalidate the saved configuration query after a successful save. Scope frontend cached data to the current authorized identity/session.
- No seed or backfill is required. Defaults are read-only until the first explicit configuration save. No live migration, deployment or production mutation is authorized by this specification.

## Scope exclusions and deferred decisions

This step does not select projects, derive their actual Custom share, edit approved estimates, update proposal/PDF timeline copy, recalculate project completion dates, alter original deadlines, or replace stage/key-collection clocks and notification rules.

Applying the configuration to projects needs a separate decision on new versus ongoing projects, the authoritative estimate/tax basis, phase start events, the workweek/holiday calendar, between-column percentages, amounts above the supplied bands, and preservation of original deadlines. Those choices remain deferred; no date promises are manufactured from an undefined calendar.

No unresolved decision blocks this bounded Configuration feature. Approving this specification approves the configuration step and its base-workday interpretation; it does not authorize automatic project rescheduling.

## Risks and acceptance criteria

| ID | Acceptance criterion and verification |
| --- | --- |
| AC1 | Super Admin can see the button on Configuration, open the correct route and return; test navigation and render at desktop/mobile widths. |
| AC2 | All 56 initial values match the supplied tables exactly; verify every cell and upward rounding. |
| AC3 | Editing a base recalculates only its row from the original base; verify unequal base edits in both phases and that derived cells cannot be edited. |
| AC4 | Save survives refresh/revisit; discard restores saved values. Verify first save, ordinary update, strict validation, failure and stale-version conflict. |
| AC5 | Active Super Admin is authorized and other roles/inactive identities are denied; verify route operation/OpenAPI parity and no unauthorized cached display. |
| AC6 | No existing estimate, original deadline, stage clock or key-collection appointment is changed by saving this configuration; verify the update's persistence boundary. |
| AC7 | Tables and controls work by keyboard, show understandable errors, and fit narrow screens through contained scrolling; rendered accessibility/responsive checks. |
| AC8 | Focused backend/frontend tests, applicable typechecks/builds and diff hygiene pass. Use replica-set tests for transactional save/audit and concurrent-save behavior. Report existing unrelated failures separately. |

The main risks are rounding drift, confusing workdays with calendar dates, stale saves and inadvertent application to ongoing projects. A single formula, explicit duration labels, versioned updates and the bounded persistence scope address these risks. Rollback removes the new page/API use while retaining configuration audit history; no project data rewrite is involved.
