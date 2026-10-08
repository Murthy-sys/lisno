# Vendor name entry in Request Main Basket

## Goal

Allow Procurement to enter a new vendor's name directly in the Request Main Basket dialog when the containing vendor form has not yet been completed.

## Current behavior and evidence

- `frontend/src/features/procurement/VendorBasketRequestDialog.tsx:64` renders Vendor name with `value={vendorName}` and unconditional `readOnly`. There is no change callback. A blank field therefore cannot accept typing.
- `VendorBasketFields.tsx:192` supplies the vendor name to the dialog, and `ProcurementVendorEditor.tsx:180` supplies it from `draft.name`, the Entity Name field in the containing form.
- The dialog can open with a blank name, but Send request remains disabled. Its hint tells the user to enter the name in the containing form while that form is behind the modal.
- The existing request endpoint already supports a name for an unsaved vendor (`vendorId: null`). Both names are trimmed/normalized and limited to 240 characters by `backend/src/routes/vendor-basket-requests.ts`.
- For saved vendors, `backend/src/services/vendor-basket-request.service.ts:55` verifies the stable vendor ID and current saved name. This is an identity constraint, not a vendor-renaming endpoint.
- Existing request tests in `ProcurementVendorProfile.test.tsx` cover names entered in the outer form, but not entering a name directly into this dialog.

Initial worktree inspection was clean. This is a bounded frontend state/interaction fix.

## Proposed behavior

1. For a new, unsaved vendor, make Vendor name editable and required in this dialog, with the existing 240-character limit.
2. Bind it to the containing vendor draft through the established form change handler. Typing here updates Entity Name; entering Entity Name first still prefills the dialog. Maintain one source of truth instead of a separate request-only vendor name.
3. Focus Vendor name when it is blank; otherwise initially focus New Main Basket name. Replace the instruction to leave the dialog with useful inline guidance.
4. Keep Send request disabled until both trimmed names are nonempty. Associate vendor-name validation with Vendor name, and basket-name validation with New Main Basket name.
5. Sending uses the entered vendor name and `vendorId: null` for unsaved vendors. Preserve duplicate-basket handling, existing permissions, pending controls and retry idempotency. An unchanged retry retains its command key; changing either name must not reuse a key for different request contents.
6. Closing or cancelling the basket request sends no request and leaves the entered vendor name in the unsaved containing form. Successful submission also retains the draft name. Neither operation saves a vendor automatically.
7. Saved vendors retain their existing read-only linked identity and backend validation. This dialog does not rename, detach or create a saved vendor. Existing vendor edits continue through the normal vendor form.

## Scope, constraints and non-goals

Expected affected frontend areas: `VendorBasketRequestDialog.tsx`, `VendorBasketFields.tsx`, `ProcurementVendorEditor.tsx` and focused request cases in `ProcurementVendorProfile.test.tsx`.

Preserve classification selection, Sub Basket creation, approval workflow, vendor-save recovery, draft dirty tracking and focus restoration. No backend/API/schema changes, new dependencies, visual redesign, commits or deployment. The previously reported security remediation remains explicitly deferred.

## Acceptance criteria and verification

1. Starting with an empty new vendor form, the user can open Add Main Basket, type Vendor name and New Main Basket name, and submit the correct existing request payload without saving the vendor first.
2. A prefilled vendor name can be edited for a new vendor; the outer Entity Name matches after cancel, error or successful submission, and unrelated draft fields survive.
3. Blank/whitespace names block submission; vendor validation is attached to the correct field. Pending requests prevent editing and repeat submission. Failed requests preserve inputs and support safe retry.
4. Existing saved-vendor requests, duplicate-basket validation, permissions, focus restoration and containing-form save behavior retain their existing contracts.
5. Focused `ProcurementVendorProfile.test.tsx` interaction tests, frontend typecheck/build and `git diff --check` pass. Verify the dialog with synthetic data at desktop and narrow mobile widths, including keyboard entry/cancellation and accessible labels.

## Risks, assumptions and open decisions

The screenshot is treated as a new vendor with an empty Entity Name, consistent with the displayed hint. Saved-vendor renaming is outside this request. Name changes must pass through existing draft bookkeeping so save retries cannot reuse stale contents. Cancelling closes the basket request rather than reverting the containing vendor draft. No material product decision remains open.

Status: specification and separate task plan approved; implemented in Mode A. All acceptance criteria are verified through focused tests, typecheck/build, desktop/mobile browser interactions and dialog accessibility checks. See the [task-plan delivery record](../plans/2026-10-08-vendor-basket-request-name-entry.md) for exact results and exclusions.
