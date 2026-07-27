# Task 10 Report: Client Portal

## Delivered

- Replaced the client placeholder with a calm, project-focused dashboard at
  `/client`, including every client-associated project, expected completion,
  and its latest approved, client-visible update.
- Added `/client/projects/:projectId` with floor-level progress and approved
  plans grouped beneath their floor. The UI renders no task data, internal
  notes, drafts, KPI, or evaluation controls.
- Added authenticated preview and download controls for supported image/PDF
  files. They use the existing protected blob-download endpoint; the backend
  remains the authorization boundary and already returns client-visible,
  approved versions only.
- Added distinct empty states for no shared projects and for work in progress
  before an approved plan is available.

## TDD Evidence

- RED: new dashboard/project tests failed against the prior client-role
  placeholder before the portal and routes existed.
- GREEN: focused client dashboard/project tests pass after implementation,
  covering multiple projects, approved-only plan content, floor progress,
  preview/download, and both empty states.

## Verification

- Frontend: `npm test` passes all 12 files and 56 tests.
- Frontend: `npm run typecheck` and `npm run build` pass.
- `git diff --check` passes.

## Notes

- Existing project-detail and download services continue to enforce client
  membership and approved/client-visible filtering; the review round adds a
  bounded latest-approved summary endpoint for the dashboard.

## Review Round 1

- Replaced the dashboard's project-by-project full version histories with one
  client-scoped `GET /client/latest-approved-versions` endpoint. It returns at
  most one approved, client-visible, redacted version per accessible project.
- Project cards now show a clear retryable update-fetch failure instead of
  presenting an unavailable update as an empty approved-plan state.
- Added a narrow client design-version type, defensive frontend filtering for
  malformed responses, delayed object-URL cleanup after download, and tests
  covering hidden draft/internal fixtures plus the authenticated download
  request.
- The new backend endpoint is covered for client isolation, newest-visible
  selection, and staff-metadata redaction.
- Final verification: backend typecheck, build, and all 11 test files (119
  tests) pass; frontend typecheck, production build, and all 12 test files
  (57 tests) pass.

## Review Round 2

- Mongo now uses a bounded aggregation (`$match`, deterministic `$sort`,
  `$group`, and root replacement) to return at most one approved,
  client-visible version per requested project without materializing version
  history in the application process.
- Added a compound index covering project, visibility filters, and the
  approved/uploaded/stable-ID ordering. The memory repository uses the exact
  same approved-at, uploaded-at, and ID-descending selection rules.
- Regression coverage proves one result per project, ordering ties, the
  aggregation contract (rather than `find`), and the compound index.
- Final verification: backend typecheck, build, and all 11 test files (122
  tests) pass; frontend typecheck, production build, and all 12 test files
  (57 tests) pass.
