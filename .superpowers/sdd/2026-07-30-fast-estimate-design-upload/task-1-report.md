# Task 1 report: progress-aware multipart uploads

## Changes

- Added `apiClient.postMultipartWithProgress`, an authenticated XHR multipart POST helper that:
  - returns the existing API `{ data }` envelope's `data` value;
  - sends `Authorization: Bearer …` and `Accept: application/json` without overriding the browser-generated multipart `Content-Type` boundary;
  - maps computable upload progress to a rounded, clamped integer percentage;
  - normalizes non-success, error, and abort outcomes to `ApiError`;
  - retains the current-token-only `401` clear-and-`lisno:unauthorized` event behavior.
- Updated `uploadEstimateDesign` to call the new helper and accept an optional progress callback while preserving existing two-argument call sites.
- Extended the API client test suite with a controllable XHR double that covers progress conversion, headers/body/response unwrapping, `401` behavior, HTTP errors, and transport error/abort cases.

## TDD evidence

1. Added the focused client tests before production implementation.
2. Ran `npm test -- --run src/api/client.test.ts` from `frontend`; it failed as expected with three `apiClient.postMultipartWithProgress is not a function` failures.
3. Implemented the helper and adapter.
4. Re-ran the focused suite and TypeScript check after the implementation and final test tightening.

## Verification

- `git diff --check` — passed.
- `npm test -- --run src/api/client.test.ts` (from `frontend`) — passed: 1 test file, 13 tests.
- `npm run typecheck` (from `frontend`) — passed.

## Concern

The plan's literal focused-test command uses `frontend/src/api/client.test.ts`; from the `frontend` package directory Vitest expects `src/api/client.test.ts`, while the literal path reports no test files. The equivalent package-relative command above was used for all verification.
