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

- No backend changes were required: existing project, design-version, and
  download services enforce client membership and approved/client-visible
  filtering.
