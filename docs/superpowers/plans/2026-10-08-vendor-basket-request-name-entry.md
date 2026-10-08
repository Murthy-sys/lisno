# Vendor name entry in Request Main Basket: task plan

## Authority and scope

Source of truth: [approved specification](../specs/2026-10-08-vendor-basket-request-name-entry-design.md), approved on 2026-10-08.

Enable editing Vendor name for an unsaved vendor inside Request Main Basket and synchronize it with the containing Entity Name draft. Preserve saved-vendor identity, approval permissions, request retry behavior and the normal vendor-save workflow. Security remediation remains deferred. No backend, API, schema, dependency or deployment work is included.

At plan creation the only dirty path is the untracked approved specification. No product files are modified. Recheck status and relevant diffs before implementation.

## Ownership

Paths below are relative to `frontend/src/features/procurement/`.

- **UI owner:** `VendorBasketRequestDialog.tsx`, `VendorBasketFields.tsx`, `ProcurementVendorEditor.tsx`.
- **Regression owner:** focused additions/necessary assertion updates in `ProcurementVendorProfile.test.tsx` only.
- **Primary agent:** interface agreement, integration, documents, final review and verification. Any newly discovered shared-contract change returns to the primary agent before editing.

Do not modify backend identity checks or shared form/dialog primitives. Preserve other work and assign no dirty target until its existing diff is understood.

## Dependency-ordered tasks

### 1. Set the bounded component contract

Owner: primary agent. Begin only after plan approval and execution-mode selection.

- Reconcile the approved specification and current product code; capture status and relevant target diffs.
- Pass a typed vendor-name change callback from `ProcurementVendorEditor` through `VendorBasketFields` into `VendorBasketRequestDialog`.
- Route edits through the editor's existing `change("name", value)` handler, preserving dirty state, validation clearing and save-command invalidation. Keep `draft.name` as the single value source.
- Decide editability from the unsaved-vendor state, with existing blocked/read-only controls respected. Saved vendor IDs and names retain the existing request contract.

Acceptance: spec AC 1, 2 and 4 have an agreed interface before writers start.

### 2. Implement name entry and dialog behavior

Owner: UI owner. Depends on task 1; can proceed alongside task 3 after the interface is agreed.

- Make Vendor name editable and required for unsaved vendors, capped at 240 characters. Keep saved-vendor identity read-only.
- Synchronize changes through the new callback and replace the instruction to leave the dialog with appropriate inline guidance.
- Initially focus Vendor name when blank, otherwise the basket-name field. Do not redirect focus on every keystroke as the shared draft updates.
- Keep both trimmed names required before submission. Surface local and server `vendorName` validation on Vendor name, and `proposedName` validation on New Main Basket name.
- Freeze editing and submission while pending. Preserve one request command for an unchanged retry; editing either name clears stale errors and prevents reusing a key with changed contents.
- Keep name edits in the outer draft after cancellation, failure and successful request submission. Preserve unrelated fields and restore focus on close. Do not save the vendor or associate/create a basket automatically.

Acceptance: spec AC 1–4; no new API requests beyond the existing classification-request operation.

### 3. Cover the reported failure and adjacent state transitions

Owner: regression owner. Depends on task 1; owns only the test file.

- Open Add Main Basket from an empty new vendor form, type both names in the dialog and assert the existing endpoint receives the entered name with `vendorId: null`.
- Assert initial focus, required labels, blank/whitespace blocking and correct field-level server errors.
- Edit a prefilled unsaved vendor name; verify the outer Entity Name and unrelated draft fields after cancellation and success. Verify the normal later vendor save uses the updated draft name.
- Hold a request pending and verify fields/actions cannot send a second request or alter its contents.
- Fail and retry unchanged inputs: same payload/key. Edit the vendor name after failure: updated payload with a different key, preserved basket name and synchronized outer draft.
- Preserve and exercise saved-vendor read-only requests, duplicate-basket validation, permission restrictions, keyboard dismissal and focus restoration.

Acceptance: spec AC 1–4 covered by observable interaction/payload assertions. Reuse existing fixtures and API mocks; do not mirror implementation details or rewrite unrelated cases.

### 4. Integrate, review and verify

Owner: primary agent; use proportionate independent review/verification in Mode A. Depends on tasks 2 and 3 finishing.

- Review the integrated diff for single-source draft state, saved-vendor identity preservation, callback guards, idempotency, pending behavior and field-level accessibility.
- From `frontend/`, run:

  ```sh
  npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx
  npm run typecheck
  npm run build
  ```

- Render with synthetic data at desktop and narrow mobile widths, including 320px: type the previously blocked name, cancel/reopen, submit through a mocked endpoint, check focus and accessible labels, and inspect overflow/console errors. Keep browser fixtures and screenshots in ignored output or `/tmp`.
- Run `git diff --check` and `git status --short`. Report exact results and any pre-existing failures or unavailable checks. No lint script exists; backend tests are unnecessary unless that boundary changes.

Acceptance: spec AC 5, with checks traced to AC 1–4. Do not claim unrun checks passed.

## Execution and delivery

- **Mode A:** primary agent settles task 1; UI and regression owners may then work concurrently on non-overlapping files. Tell both they share a worktree and must preserve others' edits. Review and final verification follow integration. Do not delegate for ceremony.
- **Mode B:** perform all tasks sequentially in the primary thread.
- Keep one parent implementation task in progress. No implementation or subagents begin at this plan gate.
- Final handoff reports editable new-vendor name entry, draft synchronization, preserved saved-vendor behavior, affected files and verification limits. No live request, vendor mutation, security remediation, commit, push, migration or deployment is included.

Status: specification and task plan approved; the user selected Mode A. Tasks 1–4 are implemented, reviewed and verified on the integrated worktree.

## Delivery record: 2026-10-08

### Implementation

- `ProcurementVendorEditor.tsx` passes name edits through the guarded existing `change("name", value)` handler for an unsaved vendor.
- `VendorBasketFields.tsx` forwards the typed callback and existing disabled/read-only/request-permission state to the dialog.
- `VendorBasketRequestDialog.tsx` accepts required name entry for unsaved vendors, uses stable initial focus, displays field-specific errors and preserves saved-vendor identity. A synchronous submission guard prevents duplicate requests before the pending render; retries retain the same command when unchanged and use a new key after editing.
- `ProcurementVendorProfile.test.tsx` adds five focused interaction cases and updates the intended saved-vendor/hint assertions. Coverage includes initial blank entry, whitespace blocking, cancel/success/later vendor-save synchronization, field errors, retry keys, pending duplicate prevention and separate request permissions.

No backend, API, schema, style, dependency or lockfile changes. Independent integrity review found no confirmed defects in the scoped change.

### Exact checks and results

All commands ran on the integrated worktree after both writers finished:

- `cd frontend && npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx`: exit 0, **61/61 tests passed** in one file.
- `cd frontend && npm run typecheck`: exit 0.
- `cd frontend && npm run build`: exit 0, 3,085 modules. Existing >500 kB chunk warning remains; main bundle approximately 2,459.33 kB.
- `git diff --check`: exit 0.
- `git status --short`: expected three product files, one test file and the two task documents only.

Real-browser checks used the actual vendor editor and shared dialog with exclusively synthetic, intercepted API responses. At 1440px, blank-name initial focus, uninterrupted typing, Escape cancellation, focus restoration, zero requests on cancellation and retained Entity Name passed. Reopening with a populated name focused New Main Basket name.

At 390px and 320px, name editing, failed-request preservation, successful retry and outer-draft synchronization passed. The two synthetic attempts used identical payloads and idempotency keys, with `vendorId: null`. No unexpected API request was made. Document widths matched viewport widths (1440/390/320); no horizontal overflow. Automated axe checks on the dialog reported **zero violations at all three widths**, including contrast. Desktop and narrow-mobile screenshots were visually inspected. Console logs contained only React DevTools informational messages, with no application errors.

These checks trace to all five specification acceptance criteria. The frontend full suite, backend/replica-set tests and OCR suite were not run because the changed boundary is limited to the vendor form's frontend state/interaction. There is no lint script.

Synthetic preview files, browser logs and screenshots are under `/tmp/lisno-vendor-name-qa/`. Build output in `frontend/dist/` and TypeScript caches in `frontend/node_modules/.tmp/` remain ignored. No live vendor/request mutation, security remediation, migration, seed, commit, push or deployment was performed.
