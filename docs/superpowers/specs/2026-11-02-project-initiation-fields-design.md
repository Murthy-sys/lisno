# Project initiation: additional client and project fields

Date: 2026-11-02
Status: Approved; implemented with verification results recorded in the task plan
Classification: Substantial, because the change spans form, API, and persistence contracts.

## Goal

Extend Project Initiation with Native, Tentative Budget, Closure Tentative Date, Category, Languages Known, and Most Preferred Language. Prefill Next action with `Estimation` and disable that control. Save the added information durably through the existing project-and-lead creation flow.

## Current behavior and evidence

- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx` is the shared initiation form used by `AdminProjectsPage.tsx` and `features/leads/LeadDashboard.tsx`. It supports assigning Sales or a Sales Manager according to the existing entry point.
- Its form currently contains client/contact information, project name and city, property type, source, a blank editable Next action, and a required Next action date. None of the requested new metadata fields or language selectors exists.
- The form posts to `POST /api/v1/admin/projects` through `frontend/src/features/admin/adminProjectsApi.ts`. `backend/src/routes/admin-projects.ts` validates a strict request schema, so frontend-only additions would be rejected.
- `backend/src/services/admin-project.service.ts` creates the Project, access grant, linked Lead, audit entries, and initiation receipt in a transaction. Client invitation delivery occurs after project creation. The service already supports optional numeric minimum/maximum budget bounds, while the current initiation form does not display them.
- The linked Lead stores property type, budget bounds, source, next action, and next action date in `backend/src/models/Lead.ts`. `repositories/mongo.ts` explicitly maps Lead fields. `repositories/admin-project-summary.ts` derives project metadata from the linked Lead by project ID.
- Initiation requests support idempotency using an actor-scoped key and request fingerprint. New fields must participate in that fingerprint.
- The form's current dirty check treats any nonempty form value as an edit. Adding a default Next action requires adjusting that check so an untouched form remains clean.
- `NextActionDateTime.tsx` provides the existing calendar picker, but its calendar dialog label explicitly says “Choose next action date.” Any reuse for closure dates must provide a correct, distinct accessible name.
- The worktree already contains substantial unrelated quotation/design-workflow changes, including the initiation service, shared types, repository adapters, summary projection, and tests. The initial dirty-path set was inspected. Existing changes must be preserved; relevant diffs must be recaptured and understood before implementation writers start.

## Scope and requirements

Apply the same fields and behavior to every entry point using the shared Project Initiation form. Preserve its existing visual language, responsive layout, assignment controls, validation feedback, and submission behavior.

| Visible label | Control | API/storage field | Behavior |
| --- | --- | --- | --- |
| Native | Text field | `nativePlace` | Optional hometown/native-place text, trimmed, maximum 120 characters. |
| Tentative Budget | Text field | `tentativeBudget` | Optional descriptive text, trimmed, maximum 200 characters. Accept values such as `₹15–20 lakh`; do not coerce to a number. |
| Closure Tentative Date | Date picker | `closureTentativeDate` | Optional real calendar date stored as `YYYY-MM-DD`, without timezone conversion. Supports clearing. |
| Category | Single-select dropdown | `category` | Optional; choices `Self use` (`self_use`) and `Rental` (`rental`). Initially unselected. |
| Languages Known | Multi-select dropdown | `languagesKnown` | Optional; zero or more unique supported language values. Supports selection and removal using pointer and keyboard. |
| Most Preferred Language | Single-select dropdown | `preferredLanguage` | Optional; one supported language or no selection. Initially unselected. |
| Next action | Disabled text field | Existing `nextAction` | Always displays and submits `Estimation` from this screen. No user-editable override in the initiation form. |

Use the same language catalog for both selectors: Assamese, Bengali, Bodo, Dogri, English, Gujarati, Hindi, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Manipuri, Marathi, Nepali, Odia, Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, and Urdu. Display readable labels and use stable canonical values shared by validation and UI. The preferred-language selector is independent; do not silently add or remove known languages when preference changes.

Group Native and language controls with client details. Group budget, closure date, and category with project details. Keep the current Next action date editable and required. It remains separate from Closure Tentative Date.

## Assumptions and open decisions

- “Native” means the client's hometown/native place, distinct from Project city and project location.
- “Most preferred languages” means one most preferred language; Languages Known supports multiple selections.
- New fields are optional because the request does not make them mandatory. Existing required fields retain their rules.
- Tentative Budget is free text, as requested, and is descriptive intake information. It neither replaces existing numeric budget bounds nor becomes a financial source of truth.
- Closure Tentative Date is a tentative sales-closure date. It does not alter project deadlines, planned completion, handover dates, or workflow timers. No past-date restriction or dependency on Next action date is introduced.
- No blocking open decision remains under these assumptions. Material changes to them should be incorporated into this specification before implementation.

## Data and API design

Use the linked Lead as the single source for the added intake metadata, consistent with its existing ownership of property type and budget information. Do not duplicate it into Project or User documents.

- Extend the initiation request schema, service input, frontend API types, Lead record/model, memory behavior, Mongo mapping, and relevant OpenAPI schemas.
- Return the saved metadata through authorized Lead reads and the existing Admin project summary projection. Use additive optional types for legacy compatibility; newly produced responses normalize absent scalar metadata to `null` and absent known languages to `[]`.
- Validate text length, enum/language membership, unique language selections, and actual calendar dates on the backend. Empty optional text becomes `null`; blank UI selections map to absent/null values consistently. Invalid supplied values produce field-specific validation errors before writes.
- Keep the closure date as a date-only string throughout storage and responses. Do not route it through the existing timestamp conversion for Next action date.
- The form explicitly submits `nextAction: "Estimation"`. The initiation API defaults an omitted next action to `Estimation` while continuing to accept valid explicit next actions from existing API consumers. This is a screen default, not a new global lock on future lead actions.
- Normalize initiation defaults before deriving the request fingerprint so equivalent omitted/explicit defaults can retry consistently. Include every new field in the effective request fingerprint; a different effective payload under the same key must retain the existing conflict behavior.
- Preserve project/lead/access-grant/audit/receipt atomicity, stable ID joins, assignment rules, client invitation behavior, query invalidation, and all current authorization boundaries.
- Added personal metadata must not be copied into logs, audit payloads, invitation content, or estimate artifacts merely because it is available.

## UX, accessibility, and failure behavior

- Reuse existing field, dropdown, panel, and calendar patterns without new dependencies or a visual redesign. A small reusable multi-select is appropriate only if no existing control meets the requirement.
- Both language dropdowns have distinct labels and accessible names. Multi-select state is announced, supports keyboard operation, and remains usable on touch devices.
- The closure calendar has its own label and focus return behavior; opening or dismissing it must not affect the Next action calendar or close the initiation panel unexpectedly.
- Next action is visibly populated on first render, disabled, and included in the request even though disabled HTML controls are excluded from native form serialization.
- Opening and immediately closing the form does not trigger an unsaved-changes prompt. Edits to any new field do trigger the existing dirty-state protection; returning all values to defaults clears it.
- Submission disables editable controls consistently and preserves selections and text after validation, network, or server failures. Field errors focus an appropriate enabled control.
- Maintain readable dropdowns and calendars, scrolling, and reachable submit/cancel controls at narrow mobile widths and desktop widths. No new animation or icon library is needed.

## Compatibility, migration, and non-goals

No migration or backfill is required. Historical leads with missing metadata remain readable and are not assigned inferred values. Existing saved next actions are not rewritten. An application rollback may leave additive metadata in Mongo without affecting existing fields; no destructive cleanup is required.

Out of scope: new editing screens, dashboard filters, new detail-screen sections, budget calculations, estimate pricing, approval or design-workflow changes, permission changes, automatic tasks/reminders from the closure date, new invitation behavior, dependencies, commits, deployment, production writes, and migration execution.

## Risks and constraints

- Strict validation and explicit Mongo projections can otherwise reject or silently lose new fields. Verify creation and later reads, including the real Mongo transaction path.
- Calendar timestamps can shift dates across time zones. Use and test date-only strings for closure dates.
- A nonempty disabled default can accidentally make every form dirty. Compare against baseline values rather than truthiness.
- New request defaults can change idempotency fingerprints. Verify retry, conflict, and legacy-payload behavior explicitly.
- Existing unrelated changes share several target files. Restrict later edits to the approved field contract and preserve workflow-version and quotation behavior.

## Acceptance criteria and verification

1. Both initiation entry points expose all six added fields with the specified controls, labels, language options, and optional behavior. Rendered interaction tests cover selecting multiple known languages, choosing one preference, changing category, choosing/clearing a closure date, and submitting.
2. Next action displays `Estimation`, is disabled from first render, and submits that exact value. Next action date retains existing behavior. An untouched form closes without a dirty warning; editing and reverting new fields behaves correctly.
3. A completed initiation persists each supplied value and returns it on subsequent authorized Lead/Admin project reads. Test memory and Mongo adapters with different values on two projects to detect lost or mixed metadata.
4. Empty optional fields and historical records remain supported. Existing numeric budgets and saved next actions remain unchanged. Invalid categories/languages, duplicate languages, overlong text, and impossible closure dates are rejected without partial creation.
5. Closure dates round-trip unchanged across time zones and leap-day boundaries. Both calendars retain correct labels, independent state, and keyboard focus behavior.
6. Repeating a successful initiation with the same effective payload creates no duplicate project/lead/receipt; changing new metadata under the same key produces the established conflict. Assignment and invitation failure behavior remains unchanged.
7. Focused frontend/backend regression suites, relevant Mongo replica-set integration tests, both workspace typechecks and builds, responsive browser checks, and `git diff --check` pass on the integrated change. Relevant suites include initiation dialog, admin-project and lead dashboard flows, accessibility, admin-project service/routes, Mongo repository, invitation/idempotency integration, and API documentation tests. Broaden checks only when affected contracts or findings warrant it; no lint result is claimed because the repository has no lint script.

This stage creates only the specification. A separate task plan and execution-mode choice follow the repository's approval gates.
