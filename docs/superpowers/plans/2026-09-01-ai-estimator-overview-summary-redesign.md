# AI Estimator Main Line Overview Configured-Only Rendering Task Plan

## Approved source of truth

- Specification:
  `docs/superpowers/specs/2026-09-01-ai-estimator-overview-summary-redesign-design.md`
- Approved follow-up: Overview shows only saved/available summary information;
  empty values and empty tab summaries are omitted.

## 1. Delivery outcome

Refine the existing Super Admin Main Line Overview so it keeps the Main Line
identity and UOM/Surfaces editing controls, but progressively discloses all
tab-derived summary content:

- show a Mode only when it is referenced by saved Overview, Scope, Pricing, or
  Advanced data;
- show Pricing, Recommendations, Quality, Shared calculation values, and a
  detailed-tab card only when their canonical section payload contains saved,
  meaningful configuration;
- render only meaningful fields within a visible record/card;
- omit empty cards, zero derived count rows, placeholder highlights,
  **No … configured**, and summary-only **Not configured** copy;
- preserve saved numeric `0`, persisted boolean `false`, and unresolved saved
  stable IDs as meaningful information; and
- keep loading, cached-refresh warnings, errors, and retries visible until the
  application can distinguish an empty section from an unavailable one.

This is a frontend-only follow-up. No backend contract, persistence,
authorization, calculation, dependency, migration, deployment, commit, or push
work is included.

## 2. Fixed implementation contract

- Canonical section payloads remain the source of truth for whether information
  is saved. Completeness state and reusable master availability do not qualify an
  otherwise empty section for display.
- A meaningful saved value is any value other than `null`, `undefined`, a blank
  string, an empty array, or an object with no meaningful descendant value.
- Numeric `0` and persisted boolean `false` are meaningful. Filtering must not
  use generic JavaScript truthiness.
- A structured row with a stable ID qualifies as saved even when optional fields
  are absent. Only the row’s available fields are rendered.
- A saved unresolved stable ID renders as **Unavailable value**; raw IDs remain
  hidden.
- Main Line identity always renders. UOM and Surfaces remain usable Overview
  editors even when their current selections are empty.
- View-only Mode, Specification, and Recommendation selections never dirty or
  mutate a section.
- Loading/error/refresh states are operational feedback and remain visible. A
  successfully loaded empty section disappears without empty-state copy.
- Existing exact query keys, CAS writes, conflict rebasing, cache synchronization,
  permissions, financial units, and detailed-tab editors remain unchanged.

## 3. Baseline and dirty-work ownership

The repository already contains broad uncommitted user work, and the existing
Overview implementation files are themselves modified or untracked. Before any
writer starts:

1. Capture `git status --short` and the relevant per-target tracked diff.
2. Read each assigned untracked target in full because it has no Git baseline.
3. Preserve all existing Overview behavior not changed by the approved
   configured-only contract.
4. Assign one writer per file and do not reformat, revert, stage, or overwrite
   unrelated work.
5. Treat the previously verified 121-file/1,306-test frontend suite and the
   10-file/103-test Overview lane as the pre-follow-up baseline, then reproduce
   the current empty-summary presentation with focused tests before changing it.

The primary agent owns product interpretation, the spec/plan files, interface
reconciliation, integration, and any edit to shared route tests or CSS.

## 4. Dependency-ordered task graph

### T0 — Capture configured, empty, falsy, and failed-source fixtures

**Owner:** primary agent.

**Files:** read-only baseline inspection of:

- `frontend/src/features/ai-estimator-knowledge/knowledgeOverviewSummary.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- their focused tests and `KnowledgeScreens.test.tsx`

**Depends on:** approved updated specification.

**Outcome:** settle one asymmetric fixture matrix and exact projection contract
before behavior-changing writes.

**Fixture matrix:**

- one completely empty set of section payloads;
- one section containing only null/blank/empty collection values;
- saved `0` BPS/paise/numeric values;
- saved `false` Recommendation/Quality flags;
- a saved row with a stable ID and only one optional field;
- an unresolved saved master/relationship ID;
- two referenced Modes with disjoint saved records plus one active but
  unreferenced Mode master;
- one loading source, one failed source, and one cached source whose refresh
  fails while data remains available.

**Acceptance criteria covered:** specification AC5–AC9, AC13, AC16.

**Stop/report condition:** if canonical payload shapes contain contractually
required default values that are indistinguishable from user-saved values,
record the exact field and return it for product interpretation rather than
guessing from completeness.

### T1 — Add explicit meaningful-content projection

**Owner:** frontend implementer A.

**Exclusive files:**

- `frontend/src/features/ai-estimator-knowledge/knowledgeOverviewSummary.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts`

**Depends on:** T0 contract.

**Outcome:** expose display-ready configured-only metadata without mutating
source payloads or converting `0`/`false` to absence.

**Implementation steps:**

1. Add a pure recursive meaningful-value predicate with explicit null, blank,
   array, object, `0`, and `false` semantics.
2. Mark each section card with `hasConfiguredContent`; retain its full source-key
   and completeness metadata so the panel can still render unknown/error states.
3. Include only referenced Mode IDs in `modeOptions`; preserve referenced
   inactive or unresolved Modes while excluding active unreferenced masters.
4. Expose whether Shared calculation values contain at least one saved scalar or
   quantity slab.
5. Filter or mark count/highlight entries so zero derived counts and placeholder
   highlights are not presented as configured content.
6. Preserve nullable canonical fields in projected detail objects so the view
   can omit absent fields without replacing them with sentinel strings.
7. Keep integer paise and basis points exact and keep names presentation-only.

**Focused tests:**

- null/undefined/blank/empty arrays/nested empty objects are not meaningful;
- `0` and `false` are meaningful;
- unreferenced active Mode is excluded and referenced inactive/unresolved Mode
  remains;
- empty/default section cards report no configured content;
- a partial saved row qualifies its card but exposes only its actual values;
- shared values distinguish absent fields from saved zero; and
- input objects remain unchanged.

**Stop/report condition:** do not infer configured state from a resolved master,
completeness finding, or display label when the saved section has no reference.

### T2 — Render only configured/available Overview content

**Owner:** frontend implementer B.

**Exclusive files:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`

**Depends on:** T0 and the exact T1 interface contract. It may run in parallel
with T1 only after the primary agent publishes the final property names.

**Outcome:** conditionally render every summary block and every definition row
while preserving configuration controls and operational feedback.

**Implementation steps:**

1. Always render Main Line identity plus UOM/Surfaces controls.
2. Render Modes and Selected Mode details only when referenced Mode options
   exist or their source is still loading/failed.
3. Render Shared calculation, Pricing, Recommendations, and Quality blocks only
   when saved content exists or the relevant source is loading/failed.
4. Render a section card when `hasConfiguredContent` is true or any source state
   is unresolved/error; hide it after a successful empty load.
5. Omit the **All section summaries** wrapper once every source is ready and no
   card has configured content.
6. Render individual definitions only for available canonical values. Persisted
   `false` displays as **No**, **Inactive**, or **Optional**; saved `0` receives
   normal money/percentage/number formatting.
7. Treat derived absence booleans such as “Referenced by Scope: false” as empty
   summary noise; show relationship labels only when the relationship exists.
8. Remove **No … configured**, summary-only **Not configured**, “No minimum,”
   “No maximum,” and placeholder-only count/highlight rows from rendered summary
   blocks.
9. Preserve retry buttons, cached-data warnings, refreshing status, accessible
   headings, radio/select keyboard behavior, and all non-mutating callbacks.

**Focused tests:**

- fully empty data renders identity and UOM/Surfaces only;
- no empty summary heading, card, selector, placeholder, or Open action remains;
- loading and failed sources remain visible and retryable;
- cached content remains visible with a refresh warning;
- partial rows render only their saved fields;
- saved zero/false values remain visible;
- unreferenced Mode masters do not appear in the radio group;
- unresolved saved IDs show **Unavailable value** without raw IDs; and
- Draft/read-only controls plus axe coverage continue to pass.

**Stop/report condition:** do not hide an error merely because the last known
payload is empty, and do not remove UOM/Surfaces as a way to satisfy the empty
state.

### T3 — Integrate route-level regression coverage and layout cleanup

**Owner:** primary agent after T1/T2 reconciliation.

**Exclusive files:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css` only
  if conditional rendering leaves a demonstrated layout gap

**Depends on:** T1 and T2 integrated.

**Outcome:** prove configured-only behavior through the real workspace query
boundary without changing save/query contracts.

**Implementation steps:**

1. Add a route fixture where every detailed section loads successfully but is
   empty; assert no tab-derived summary blocks/cards are rendered.
2. Add a populated asymmetric route fixture proving saved information renders
   while empty sibling fields do not.
3. Keep one rejected section query and assert its retryable error remains while
   successfully loaded empty siblings stay hidden.
4. Assert UOM/Surfaces remain configurable and Overview save still preserves
   hidden payload values, latest applicability, and exact CAS versions.
5. Adjust feature-scoped CSS only when a rendered layout assertion demonstrates
   orphaned gaps; do not perform a broad stylesheet rewrite.

**Focused verification:**

```sh
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx
```

**Acceptance criteria covered:** specification AC1, AC4–AC9, AC12–AC17.

**Stop/report condition:** if route integration needs an API, query-key,
mutation-sync, or backend change, stop and return to the specification gate.

### T4 — Integrity review

**Owner:** `integrity_reviewer` after all writers finish.

**Depends on:** T1–T3 integrated.

**Required review questions:**

- Can any `0`, persisted `false`, unresolved saved ID, or partial saved row be
  hidden incorrectly?
- Can a completeness state or active master incorrectly create a visible card?
- Can a query failure be mistaken for a successfully empty section?
- Can cached content disappear on a background refresh failure?
- Are UOM/Surfaces still usable and are view-only selectors still non-mutating?
- Did any conditional rendering alter CAS, conflict rebasing, cache invalidation,
  permissions, financial formatting, or detailed-tab navigation?
- Did any writer disturb unrelated dirty work?

Confirmed findings return to the owning writer or primary agent before T5.

### T5 — Final verification

**Owner:** `verification_runner` after integrity findings are resolved.

**Depends on:** T4 complete.

**Required commands:**

```sh
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx
cd frontend && npm run typecheck
cd frontend && npm test
cd frontend && npm run build
git diff --check
git status --short
```

Record exact test counts, build warnings, ignored artifacts, dirty paths, and any
unrun checks. No source edit is permitted during this lane.

**Rendered verification:** when the connected browser is available, verify
configured, completely empty, partial-record, loading, failed-source, and
read-only states at 1440, 1024, 768, 390, and 320 pixels. Confirm there is no
orphaned whitespace or horizontal overflow and that empty blocks disappear
without layout jumps after loading. If no browser is available, report this lane
as unrun rather than substituting static inspection.

## 5. Parallel execution boundaries

- T0 is primary-agent read-only setup.
- T1 and T2 may run in parallel only after T0 fixes the shared projection
  property names; they own non-overlapping source/test files.
- T3 waits for T1/T2 and is the only writer for route tests and any required CSS.
- T4 and T5 are sequential read-only final stages after all writers stop.
- No writer may edit `KnowledgeItemWorkspacePage.tsx`, query keys, API helpers,
  backend files, or the task/spec documents without returning the dependency to
  the primary agent.

## 6. Verification matrix

| Approved invariant | Evidence | Check | Expected result | Blind spot |
| --- | --- | --- | --- | --- |
| Empty summaries disappear | All section payloads empty/default-shaped | Projection, component, route tests | No Mode/Shared/Pricing/Recommendation/Quality/cards wrapper | Loading must finish successfully |
| Saved content appears | Asymmetric populated tabs | Component and route tests | Only populated blocks/cards and saved fields render | Browser needed for visual density |
| `0` survives filtering | Zero BPS/paise/range value | Pure projection + DOM formatting | Zero is visible and correctly formatted | Server contract remains unchanged |
| `false` survives filtering | Inactive/optional/no flags | Pure projection + DOM | No/Inactive/Optional is visible | Derived absence booleans are intentionally hidden |
| Modes are configured-only | Two referenced + one unreferenced active master | Projection + radio DOM | Only referenced Modes appear | Requires stable `modeId` |
| Partial row remains visible | Stable row ID plus one field | Projection + DOM | Owning block appears; empty siblings do not | Required validation stays in detailed tab |
| Unresolved saved ID remains visible | Missing label map entry | Projection + DOM | **Unavailable value**, never raw ID | Reference query retry remains separate |
| Failures are not emptiness | Rejected section query | Route test + retry spy | Error and retry visible; empty siblings hidden | Network timing in browser |
| Cached refresh failure | Cached populated data + rejected refetch | Component/route test | Content remains with warning/retry | TanStack timing fixture |
| Editing contract unchanged | Empty and populated UOM/Surfaces + hidden keys | Existing exact mutation tests | Same payload rebase, applicability, CAS, and guard | Backend not changed |
| Responsive/a11y | Empty/populated/partial fixtures | Axe + viewport matrix | No empty landmarks, overflow, or inaccessible controls | Browser availability |

## 7. Compatibility, rollback, and external actions

- Existing stored data is neither deleted nor rewritten; the change affects
  presentation/projection only.
- Old and new frontend code use the same section APIs and payloads.
- Code rollback restores the verbose empty presentation without data conversion.
- No migration, seed, backup, production mutation, external communication,
  deployment, dependency installation, commit, or push is authorized.
- Test/build outputs remain ignored temporary artifacts and are not deliverables.

## 8. Final handoff requirements

Report:

- which blocks/fields now hide when empty and which controls remain available;
- proof that saved `0`, `false`, partial rows, and unresolved IDs remain visible;
- proof that loading/error/cached states are not mistaken for emptiness;
- principal files changed and confirmation that query/mutation/backend contracts
  were untouched;
- exact focused/full test, typecheck, build, hygiene, and viewport results;
- migrations/deployments/commits/pushes/external actions not performed; and
- any remaining reference-pagination or browser-availability risk.
