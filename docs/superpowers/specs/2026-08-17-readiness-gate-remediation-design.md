# Readiness Gate Remediation Design

**Date:** 2026-08-17
**Status:** Approved design; written-spec review pending

## Goal

Remove the two blockers identified by the Prompt 0 audit before Prompt 1 begins:

1. Make project access explicit, consistent, and deny-by-default across the production Mongo repository and the in-memory test repository.
2. Restore a deterministic green frontend baseline while preserving the approved requirement that every owned saved estimate remains exportable.

This is a pre-Prompt-1 readiness pass. It does not implement Prompt 1 or any later phase.

## Scope

### Included

- A shared backend project-access scope policy used by both repository adapters.
- Preservation tests for all five current roles.
- Removal of accidental generic project access for estimator_sales.
- Deterministic Vitest API-base configuration independent of local environment files or shell variables.
- Restoration of an estimate-driven saved-estimate export surface on the Estimator/Sales dashboard.
- Focused regression tests plus complete backend/frontend verification.
- Implementation-state documentation after verification.

### Excluded

- New roles, permissions, Admin screens, or user-management APIs.
- Project schema changes or migrations.
- The future Admin project-initiation workflow.
- The future estimator assignment field and dropdown.
- Client email verification or invitation redesign.
- Procurement, finance, execution, worker, dashboard, or later-phase work.
- Changes to estimation calculations, PDF generation, OCR, or outbound notification behavior.

## Confirmed root causes

### Project access

The Mongo repository initializes its project filter as unrestricted and narrows it only for client, designer, and design_manager. Both design_head and estimator_sales therefore query all projects. The in-memory repository separately treats every role not explicitly handled as a manager, so its behavior differs and tests do not reproduce the production exposure.

Generic project detail and design-artifact services rely on the same repository visibility rule. The defect therefore affects more than the project list.

### Frontend environment

Vite loads the ignored frontend .env value VITE_API_URL=http://localhost:3000/api/v1 during tests. Many tests intentionally use relative /api/v1 request handlers. The same suite consequently behaves differently across machines and shell environments.

### Estimate export

The August dashboard change moved estimate actions into visible lead rows but left the PDF tests with zero visible leads. More importantly, the lead query is filtered and limited while the saved-estimate query returns all owned estimates. An estimate whose lead is filtered out or outside the current page no longer has an export surface, contradicting the approved PDF and dashboard specifications.

## Approaches considered

### 1. Shared access policy plus behavior-preserving frontend repair — selected

Use one typed role-to-project-scope policy in both repositories, isolate the test environment in Vitest configuration, and restore a dedicated saved-estimate surface driven by the complete estimate query.

This closes the production exposure, prevents repository drift, preserves every estimate export, and establishes a safe boundary for later RBAC work.

### 2. Minimal adapter and test-fixture patches

Add one estimator condition separately to Mongo and memory, set the environment in an npm script, and populate lead fixtures in the two failing PDF tests.

This is a smaller diff, but it leaves duplicated access policy, environment-sensitive IDE/direct Vitest runs, and saved estimates hidden by lead filtering or pagination.

### 3. Route-level blocking

Add role allow-lists to generic project routes and keep repository behavior unchanged.

This blocks some HTTP paths but leaves unsafe repository semantics for other services and future callers. It also duplicates authorization decisions at multiple layers and does not solve frontend issues.

## Backend design

### Shared project access scope

Add a focused domain policy that converts an authenticated user into one of these scopes:

- all
- linked-client
- initiated-or-assigned-designer
- accountable-manager
- none

The role mapping is exhaustive at compile time and has a runtime deny fallback:

| Current role | Scope |
|---|---|
| design_head | all |
| designer | initiated-or-assigned-designer |
| design_manager | accountable-manager |
| client | linked-client |
| estimator_sales | none |

Only the explicit all scope may become an empty Mongo filter. The none scope short-circuits without calling ProjectModel.find or countDocuments.

### Repository behavior

The Mongo and memory repositories consume the same scope:

- listProjectsForUser returns an empty array for none.
- pageProjectsForUser returns zero items and total zero for none.
- Existing sorting and pagination remain unchanged for visible records.
- Project detail and dependent artifact access continue to return not found when the project is outside the user’s list.

No API response shape or HTTP status changes are introduced. A generic project list remains a successful empty page for estimator_sales; a specific inaccessible project remains 404.

### Future estimator assignment rule

The temporary none scope does not mean estimator_sales can never access projects. It prevents accidental access until the approved assignment relationship exists.

In the future Admin project-initiation phase:

1. The Admin form displays a dropdown of active users whose role is estimator_sales.
2. Admin selects one named estimator.
3. The backend independently validates that the selected user exists, is active, and has the estimator_sales role.
4. The project stores that user’s identifier in a dedicated estimator assignment field.
5. Only the assigned estimator may access that project.
6. Assignment and reassignment are recorded in audit history.
7. Existing projects remain inaccessible to estimators until explicitly assigned or migrated.

That schema, API, dropdown, and migration are deliberately deferred to their authorized phase.

## Frontend design

### Deterministic test API base

Vitest configuration sets VITE_API_URL to /api/v1 inside the test environment. This test-only value overrides Vite-loaded local environment values and shell values for npm, direct Vitest, and IDE runs.

Production and development API resolution remain unchanged. No test deletes or depends on a developer’s local .env file.

### Saved-estimate export surface

Restore a Saved estimates dashboard section driven by getSavedEstimates rather than the visible lead page.

Each saved-estimate item displays:

- Workflow status.
- Project and client identity.
- Total and property type.
- Export as PDF control with independent loading/error state.
- Continue estimate or View estimate navigation.

The current lead list retains its inline estimate summary and actions so the newer row workflow remains available. The dedicated section is the complete, estimate-driven surface and remains available even when:

- No leads are visible.
- Search or stage filters hide the associated lead.
- The associated lead is outside the first lead page.

Tests query headings, articles, and accessible controls rather than CSS implementation classes.

### Loading and errors

- The lead query remains the primary dashboard gate.
- Pending saved estimates show the existing neutral loading treatment.
- A saved-estimate query failure shows a retryable section error without blocking visible leads.
- One PDF failure is scoped to that estimate and does not disable other exports.
- No API, route destination, or download behavior changes.

## Testing strategy

Implementation follows red-green-refactor.

### Backend RED cases

- A memory-repository project whose managerId equals the sales user must still be invisible to that user.
- Mongo estimator list and page reads must return empty results without querying ProjectModel.
- Preservation assertions cover design_head all-project visibility and existing designer, manager, and client scopes.
- A workflow-level estimator request must receive an empty project page and 404 for an inaccessible project/artifact.

### Frontend RED cases

- Run the API-client suite with a hostile shell VITE_API_URL and verify the current absolute URL mismatch.
- Require the Saved estimates section when estimates exist but the visible lead page is empty.
- Verify each estimate exports independently without navigation.
- Verify one failed export produces an error only within the affected estimate.
- Preserve the existing lead dashboard, creation-dialog, metric, filtering, and navigation assertions.

### Verification

- Backend focused repository/workflow tests.
- Complete backend test suite.
- Backend typecheck and production build.
- Frontend focused API-client and LeadDashboard suites under a hostile VITE_API_URL.
- Complete frontend test suite with no API-base override.
- Frontend typecheck and production build.
- Git diff and whitespace checks.

The OCR worker is unchanged; its suite does not need to be rerun for this isolated pass.

## Data, migration, and compatibility

- No database schema or migration change.
- No stored role value changes.
- No JWT format change.
- No API contract change.
- No estimation, PDF, OCR, file-storage, or calculation change.
- design_head, designer, design_manager, and client visibility remain compatible.
- estimator_sales loses only accidental generic project/document visibility.
- The future explicit estimator assignment rule is recorded but not implemented.

## Acceptance criteria

1. Mongo and memory implement the same explicit role-to-project-scope policy.
2. estimator_sales cannot list, read, or derive artifact access from an unassigned project.
3. design_head still sees all projects; existing designer, manager, and client scopes remain unchanged.
4. Frontend tests use /api/v1 regardless of local or hostile environment values.
5. Every saved estimate has an export surface independent of lead pagination and filters.
6. Focused and complete backend/frontend test suites are green.
7. Both typechecks and production builds pass.
8. Prompt 1 and later phases remain NOT STARTED.

## Completion boundary

After acceptance:

- Update CODEX_IMPLEMENTATION_PLAN.md with the readiness-gate result.
- Update PROMPT_0_AUDIT_REPORT.md with verification evidence and the new readiness verdict.
- Stop and report whether Prompt 1 is ready.
- Do not begin Prompt 1 without a new explicit instruction.
