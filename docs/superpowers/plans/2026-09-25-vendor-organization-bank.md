# Vendor organization type and bank account details: task plan

Date: 2026-09-25
Status: Implemented and verified under the user's explicit instruction to proceed without further approval rounds. T0–T5 complete.
Specification: [Vendor organization and bank details](../specs/2026-09-25-vendor-organization-bank-design.md).

## Contract and ownership

Single parent task: implement and verify organization dropdown plus private bank account fields, preserving the earlier vendor work.

- Primary: durable documents, contract decisions, integration, rendered QA, final reconciliation.
- Backend writer: `backend/src/contracts/procurement-vendor.ts`, `models/AiEstimatorKnowledgeVendor.ts`, `services/procurement-vendor-profile.ts`, narrow create validation in `services/ai-estimator-knowledge-reference.service.ts`, `openapi/procurement-vendor.ts`, and focused vendor/API tests. No routes/authorization expansion, migration or unrelated rewrite.
- Frontend writer: `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`, `procurement/vendorProfileDraft.ts`, `VendorProfileFields.tsx`, `ProcurementVendorEditor.tsx` only if requiredness/error mapping needs it, relevant vendor tests/fixtures, optional focused field component. Reuse existing CSS; scoped bank grid CSS only if necessary.
- Independent reviewer: read-only integrated diff, especially private data, omission-preservation, create requirements, CAS and replay.
- Verification runner: focused integrated unit/integration tests, typechecks/builds and hygiene. Root owns browser QA in a temporary synthetic harness.

Writers share the repository and must preserve others' edits. All assigned dirty files have T0 copies/hashes in `/tmp/lisno-vendor-organization-bank-qa/baseline/`; compare against these, not HEAD alone.

## Dependency order

1. T0 baseline: capture dirty status/diff/hashes, inspect current source of truth, baseline vendor tests. Root. AC4/7.
2. T1 settle contracts: organization enum, nullable banking object, frontend defaults, create requiredness, omitted update retention, private reads. Root with backend audit. AC1/3–6.
3. T2 backend: extend types/schema/normalization/storage/OpenAPI; enforce new profiled create choice, preserve omitted updates, test synthetic roundtrip/clear/legacy/reject/privacy/version/replay. Backend owner. Depends T1.
4. T3 frontend: exact dropdown/options, nested bank draft roundtrip, optional group validation, create-only organization requirement, accessible existing error mapping, disabled state and request body. Frontend owner. Depends T1; parallel with T2 on disjoint files.
5. T4 integrate: inspect diff, finish independent integrity review, fix confirmed issues, verify no unrelated dirty changes. Root/reviewer. Depends T2/T3.
6. T5 final verification: run scoped suites/types/builds and real rendered add/edit/error/readonly/dirty checks at 1440 and 390/320px; account leading zeroes, exact dropdown, both vendor kinds, empty/partial/populated bank group. Root/verification runner. Depends T4.

## Verification

- Backend baseline: `npm test -- tests/procurement-vendor-profile.test.ts`.
- Frontend baseline: `npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx`.
- Backend final: focused profile schema and replica-set profile tests; certificate/save replay tests when their path is affected; OpenAPI and relevant master/authorization tests as determined by final diff. Run `npm run typecheck` and `npm run build`.
- Frontend final: profile, directory, procurement and focused draft tests; `npm run typecheck`, `npm run build`.
- Render actual components with synthetic responses and block real writes; inspect desktop/mobile screenshots, keyboard/labels/error focus, read-only state, retry/conflict preservation, and axe accessibility.
- Check response/audit/catalog caches with distinct synthetic bank values so accidental exposure is detectable.
- Replica-set integration is required because profile create/update occurs inside transactions. Do not bypass this requirement with nontransactional mocks.
- Final `git diff --check`, status and T0 dirty hash comparison.
- No lint script; do not claim lint. No new dependencies, commit, deploy, seed, migration, or real customer-data mutation.

## Completion evidence

Completed on 2026-09-25. T0–T5 passed. Requiredness uses the stated default: organization type is required for new vendor creation; banking is optional, but supplying any bank detail requires the four core fields. Branch Name is optional. No preference override was received.

### Implemented scope

- Exact ordered organization dropdown beside Entity Name, with no preselected organization.
- Compact Bank Account Details section with Account Holder Name, Bank Name, Account Number, IFSC Code, and Branch Name.
- Matching frontend/backend types, strict validation, nullable storage/read normalization, and OpenAPI documentation.
- Create/read/edit/clear round trips preserve leading zeroes and normalize IFSC. Existing vendors can retain missing organization/bank data.
- Omitted new fields from old clients preserve existing values. Explicit null clears them. Legacy committed create receipts remain replayable because new-create requiredness follows receipt lookup and the input schema preserves omitted properties for fingerprinting.
- Existing CAS, frozen retries, address verification, GST/MSME uploads, profile completeness, allocation rules, and private query separation are preserved.
- Bank values remain confined to the private profile detail and are excluded from list/master/procurement-option/suggestion DTOs, save receipts, and audit values.

Changed 17 product/test files, plus this task's two documents. Backend: contract, vendor model, profile service, narrow reference service changes, procurement-vendor OpenAPI, profile fixture/unit/replica tests, API docs tests. Frontend: knowledge types, draft utility and new draft tests, profile fields/editor, one scoped bank-layout selector, profile fixture and profile tests. No dependencies or lockfiles changed.

Independent integrity review found no confirmed defects. It checked alternate consumers, existing sole-active-Super-Admin enforcement, private/no-store detail, cache lifecycle, atomic bank validation, omission/clear semantics, old receipt compatibility, CAS, and cross-layer schema agreement. All initial dirty work outside the assigned 16 existing targets was preserved; the new draft test is the seventeenth file. The reference service's original snapshot was reconstructed from HEAD plus the captured initial diff and matched its initial SHA-256 before comparison.

### Final automated verification

| Check | Result |
| --- | --- |
| Baseline profile tests | Backend 10/10; frontend 36/36 |
| Backend profile/OpenAPI/routes/models | 157/157 passed |
| Backend profile/certificate replica-set integration | 38/38 passed |
| Frontend profile/draft/directory/procurement | 97/97 passed |
| Total final tests | 292 passed across 10 files |
| Backend typecheck and production build | Both exit 0 |
| Frontend typecheck and production build | Both exit 0 |
| `git diff --check` | Passed |

Exact final commands:

```sh
cd backend
npm test -- tests/procurement-vendor-profile.test.ts tests/api-docs.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/ai-estimator-knowledge-models.test.ts
npm test -- tests/procurement-vendor-profile.replica-set.test.ts tests/procurement-vendor-certificate.replica-set.test.ts
npm run typecheck
npm run build
```

```sh
cd frontend
npm test -- src/features/procurement/ProcurementVendorProfile.test.tsx src/features/procurement/vendorProfileDraft.test.ts src/features/procurement/VendorDirectory.test.tsx src/features/procurement/VendorProcurement.test.tsx
npm run typecheck
npm run build
```

All final logs are `/tmp/lisno-vendor-organization-bank-qa/final-*.log`. The first backend attempt hit sandbox local-socket restrictions (97 socket-related failures, 60 passes); the exact command passed after approved socket access. Its original log is retained as `final-backend-tests-sandbox.log`. Replica-set tests also ran with local socket access. No product failure remained.

The existing frontend chunk-size warning (>500 kB) remains. No lint script exists. The verification runner's 19 captured files had identical before/after hashes.

### Rendered verification

Actual editor components ran in a loopback Vite harness with synthetic responses and in-memory simulated saves. No request was sent to a real backend. Browser evidence:

- AC1: exact screenshot labels and order, blank prompt, organization error associated to the dropdown and focused before a request; zero writes while missing.
- AC2: desktop two-column layout and phone one-column layout inspected at 1440, 390, and 320px. Bank controls remain 44px high. Panel/client widths matched (1039, 389, and 319px), with no document or panel horizontal overflow.
- AC2/5: partially completed banking triggers linked errors and focuses Account Holder Name; zero save requests until valid.
- AC3: created a Supplier with Associated Person, saved/reopened account `001234000123` unchanged, IFSC normalized to `TEST0123456`, optional blank branch stored as null; clearing all bank fields stored null without clearing organization.
- AC3/4: created a vendor with no bank details; edited a legacy vendor with both new properties absent; both succeeded.
- AC4/5: nested server IFSC error reached the correct input and focus, cleared on edit, and the dirty-close dialog retained changes when Keep editing was selected.
- AC6/7: organization and all bank fields disabled in read-only mode. Axe WCAG A/AA scans had zero violations at all three widths. No unexpected API paths or browser console warnings/errors were observed.

Evidence in `/tmp/lisno-vendor-organization-bank-qa/`:
`browser-initial.json`, `browser-create-edit-clear.json`, `browser-responsive.json`, `browser-legacy-errors.json`, `final-dirty-comparison.json`, `task-only.diff`; screenshots include `add-organization-desktop.png`, `add-bank-desktop.png`, `organization-full-390.png`, `bank-full-390.png`, `bank-full-320.png`, `partial-bank-validation.png`, and `readonly-bank-mobile.png`.

### Limits and external actions

Browser checks used Chromium with synthetic data, not production end-to-end or physical-device tests. Real persistence, invalid-write atomicity, privacy and transactions were verified separately through replica-set tests. Banking validation checks format only and does not verify account ownership or bank existence. Full frontend/backend suites, broader authorization suites and OCR checks were not run; existing authorization wiring was unchanged and reviewed.

No commit, staging, push, deployment, migration, backfill, seed, customer-data mutation, or external banking call was performed. Existing vendors need no data migration. Any future rollout should deploy backend support before the new frontend. Temporary browser/server and keep-awake process were stopped after verification. QA artifacts remain outside the repository; build outputs are ignored. No known defect remains in this change.
