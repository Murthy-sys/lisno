# Vendor organization type and bank account details

Date: 2026-09-25
Status: Implemented and verified under the user's request and earlier instruction to proceed without further approval rounds. Final evidence is recorded in the [task plan](../plans/2026-09-25-vendor-organization-bank.md).
Classification: Substantial cross-stack vendor profile change with private banking data.

## Goal and current evidence

Add Vendor Organization Type to the vendor editor as a dropdown with the exact supplied options: Individual, Company, Firm, Associated Person, HUF, Trust, GOVT. Add a clearly grouped Bank Account Details section.

The real Add/Edit panel is `ProcurementVendorEditor.tsx`; `VendorProfileFields.tsx` renders shared fields, and `vendorProfileDraft.ts` owns draft conversion and validation. No organization or banking fields currently exist. Backend `procurement-vendor-profile.ts` uses strict Zod parsing and legacy normalization, `AiEstimatorKnowledgeVendor.ts` persists the embedded profile, and the reference service returns the private detail through the existing authorized route. The worktree contains earlier vendor/GST/MSME changes that must be preserved.

The user was offered optional clarification on requiredness. Default if no response: organization type required for new profiles in Add Vendor; bank information optional but complete when supplied. Existing profiles without organization type remain readable/editable. Branch name is optional.

## Scope and UX

- Place Vendor Organization Type next to Entity Name in Vendor Information. First option is an unselected prompt; never silently select a legal entity type.
- Use exactly the seven screenshot labels, in screenshot order. Stable stored values: `individual`, `company`, `firm`, `associated_person`, `huf`, `trust`, `govt`.
- Add Bank Account Details after Vendor Information using the existing compact two-column panel form, stacked on mobile.
- Fields: Account Holder Name, Bank Name, Account Number, IFSC Code, Branch Name.
- Bank section may be left completely blank. If any bank field is provided, require Account Holder Name, Bank Name, Account Number, IFSC Code. Branch Name remains optional.
- Account number is a string, preserving leading zeroes; accept digits only, up to 34. Do not use numeric inputs or coerce it into a number.
- Trim outer whitespace, uppercase IFSC; require the 11-character pattern of four letters, zero, six alphanumeric characters. Validate format only; no claim of bank verification.
- Account Holder Name and Bank Name: trimmed nonempty, maximum 240 characters when a bank account exists. Branch Name: trimmed maximum 240 or null.
- Reuse labels, error association, invalid-field focus, disabled/read-only handling, dirty-close confirmation, retries, conflict reload, and query invalidation.
- No changes to the existing Vendor Type/Execution choices, contact placement, GST/MSME pairing, certificate uploads, reference removal, turnover, procurement classification, address checks, or Configuration background.

## Contract and privacy

Extend both profile contracts with `organizationType: VendorOrganizationType | null` and `bankAccount: VendorBankAccount | null`. Nested bank shape: `accountHolderName`, `bankName`, `accountNumber`, `ifscCode`, `branchName: string | null`.

Input properties are optional for backwards compatibility. Omission on update preserves the current value; explicit null clears the value. Legacy rows missing either field normalize to null. New profiled creates require organization type at the backend boundary; generic legacy catalog-only vendor creation remains unchanged. Existing profiled edits may retain null organization type until chosen, including completing old unprofiled vendors, to avoid blocking unrelated corrections. Bank object is atomic: reject partial data, unsupported properties, non-string account numbers, invalid enum/IFSC or oversized fields.

Use the existing transactional save, stable vendor ID, CAS version, idempotency key, and frozen retry body. Include new fields in semantic request identity automatically without logging values. Preserve omitted additions before validation so old clients cannot erase bank details.

Bank data lives only in the private profile, returned by the existing restricted detail endpoint. Do not add it to summaries, list rows, standard master responses, notification/audit payloads, errors, or shared catalog caches. Existing sole-active-Super-Admin profile read/write permissions remain authoritative. No new permission or endpoint.

No transfer initiation, bank API integration, account verification, credential/PIN collection, bank-document upload, multiple accounts, organization-dependent tax logic, or changes to financial allocations are in scope.

## Compatibility and risks

- No backfill or live migration. Nullable additive fields support existing rows; omission-preserving writes protect previous clients.
- Strict read normalization must not hide a whole legacy profile merely because new fields are absent.
- Organization type is metadata and does not change prior profile-completeness or allocation policy. Bank details are not a prerequisite for allocating work.
- Backend should deploy before the new UI in any later rollout; deployment is not authorized by this implementation request.
- Existing sensitive-data route and cache separation must remain intact. Tests must use synthetic values.
- Preserve all initial dirty work; snapshots and hashes are captured in `/tmp/lisno-vendor-organization-bank-qa/`.

## Acceptance criteria

1. Add/Edit shows the exact ordered organization dropdown with no automatic selection; new vendor saves require a choice.
2. Bank fields render compactly on desktop/mobile, support optional empty data and required core fields when started, with linked errors and keyboard access.
3. Create, detail read, edit, clear, and reload preserve organization and bank values, including leading zeroes and normalized IFSC.
4. Legacy rows and omitted update fields preserve old data and existing editor behavior.
5. Invalid enum/bank payloads fail without mutation; optimistic concurrency and replay behavior remain correct.
6. Bank values never appear in public/shared list, mutation summaries, audit data, or shared query caches; existing authorization remains unchanged.
7. Prior GST/MSME/supplier/contact behaviors pass regressions; typecheck/build, focused unit/integration tests, rendered checks, and diff hygiene pass with results recorded.

## Verification and open decisions

Task execution/verification is in the separate plan. No requiredness override was received, so the stated default was implemented: organization required on new vendor creation, bank details optional but complete when supplied, Branch Name optional. No other architecture choice is required: extending the existing private profile is the established approach.
