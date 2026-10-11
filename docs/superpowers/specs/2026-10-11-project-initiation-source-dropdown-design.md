# Project initiation Source dropdown

Date: 2026-10-11
Status: Approved by the user; implemented and locally verified in Mode A. See the [task plan and verification record](../plans/2026-10-11-project-initiation-source-dropdown.md).
Classification: Small, localized frontend change.

## Goal

Replace the Source text box in the Initiate project side panel with a dropdown of common acquisition channels, making project entry faster and more consistent.

## Current behavior and evidence

- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx` renders an optional Source text input with a 200-character limit and the hint “How did the client hear about Lisno?”.
- The shared panel supports both Sales and Sales Manager assignment. It already uses the shared native `Select` for Property type.
- Submission trims Source and omits it when blank. `InitiateAdminProjectInput` accepts `source?: string`; `backend/src/routes/admin-projects.ts` validates an optional trimmed string of 1–200 characters.
- Existing dialog tests cover source submission in both assignment flows, validation/server errors, omitted blank values, and unsaved-change protection.
- The worktree was clean at discovery. No existing reusable source-options list was found in the relevant frontend features.

## Requirements and UX

1. Keep the label **Source** and existing explanatory hint. Replace the input with the established native `Select`, matching Property type styling and keyboard/mobile behavior.
2. Initial value is blank, displayed as **Select source**. Source remains optional; the blank option remains selectable to clear it. Do not choose a channel automatically.
3. Provide this curated list, in this order:
   - Instagram
   - Facebook
   - YouTube
   - Google Search
   - Google Maps
   - Website
   - Existing customer
   - Customer referral
   - Architect / designer referral
   - Builder / broker referral
   - Walk-in
   - Exhibition / event
   - Other
4. Selecting **Other** reveals a labelled **Other source** text field. Require a nonblank custom value only while Other is selected; trim it and retain the 200-character limit. Save that custom text as `source`, rather than a UI sentinel or an additional API field.
5. Choosing a listed channel saves its displayed label as `source`. Clearing Source omits it. Switching away from Other excludes its custom draft from submission; the draft may remain in form memory so switching back does not lose typing.
6. Disable both controls during submission. Preserve accessible descriptions/errors, first-invalid-field focus, pending state, server-error recovery, and unsaved-change protection, including when only a source/custom source was entered.
7. Apply identical behavior in both existing assignment modes. Preserve all other initiation fields, permissions, submission guards, feedback, and query invalidation.

## Scope, compatibility, and constraints

- Frontend scope: initiation dialog and its focused regression tests. Prefer a local constant for this short list; do not build configuration management or a new dropdown component.
- API and persistence remain the existing optional string contract. Existing source values remain valid and are not rewritten. No schema change, migration, seed, database synchronization, or production data access is required.
- No changes to lead editing, reporting, source analytics, other project screens, global styles, dependencies, or authorization.
- No deployment, commit, push, or production mutation is included.

## Assumptions and risks

- “Most common” means a practical curated starter list, not a ranking computed from private production records. The options can be revised during approval.
- Other preserves entry for channels outside the list. Its conditional field adds a validation/focus branch that needs regression coverage.
- Existing stored source strings can contain spelling variations; normalizing historical data is outside this change.

## Acceptance criteria and verification

1. Source opens a labelled dropdown containing the proposed options in both Sales and Sales Manager initiation flows.
2. A selected preset reaches the existing request unchanged; a blank source is omitted; Other saves trimmed custom text and blocks blank/overlong custom input.
3. Switching preset/Other/blank never sends stale custom text. Server source errors focus the active source control, retain the entered value, and clear on correction.
4. Source-only changes still trigger the existing discard confirmation. Pending submission disables the source controls.
5. Focused dialog and relevant initiation-page regressions pass, along with frontend typecheck/build and `git diff --check`.
6. A rendered desktop/mobile check confirms keyboard selection, conditional-field layout, error association, and no side-panel overflow. Use synthetic fixtures; do not create live projects for verification.

## Open decisions and approval boundary

No blocking ambiguity: the proposed list and Other behavior above are the recommended defaults. Repository `AGENTS.md` requires specification approval before a separate task plan, followed by execution-mode selection before implementation. This stage creates only this specification.
