# Projects full-width layout plan

Specification: [Projects full-width layout](../specs/2026-09-25-projects-full-width-design.md).

Single parent task: remove excess Projects side margins. Proceed under the user's approval waiver and previously selected Mode A.

1. Root: capture dirty-file hashes and the existing target CSS under `/tmp/lisno-projects-width-qa`; inspect width source. Complete.
2. Root owns the single page-scoped CSS declaration in `frontend/src/features/admin/admin-project-grid.css`; preserve all existing dirty changes.
3. After the edit, independent read-only verification may run in parallel with root's browser checks. Review scope and run existing focused page tests/typecheck/build. No new tests that merely mirror CSS.
4. Root: render actual shell/page with synthetic data at wide desktop, laptop, tablet and phone widths; measure content gutters, image rendering and overflow. Check controls and accessibility, inspect screenshots, reconcile dirty hashes and record evidence here.

No dependency, backend, shared shell, staging, commit, push, deployment or customer-data writes.

## Completed verification

The sole product change is `inline-size: 100%` on the Projects root. Independent review confirmed the selector overrides the workspace cap without altering any other page. All 107 initially dirty files were preserved, with only the owned CSS changed.

Rendered actual shell and page with synthetic data in Chromium at 2560, 1920, 1440, 1024, 768, 390 and 320px. The root and hero match the inner workspace width at every size. Desktop gutters are 24px, smaller-screen gutters 16px. At 1920px the content grows from 1440px to 1632px; at 2560px it spans 2272px. No horizontal overflow, photo aspect ratio remains 2:1 and zero axe WCAG A/AA violations at all seven widths. Desktop single-project/full-grid and phone screenshots were inspected. List switching and submitted search work; search returned the expected one project. No unexpected requests, writes, browser errors or warnings.

Automated checks passed: `npm test -- src/features/admin/AdminProjectsPage.test.tsx` (18/18), `npm run typecheck`, `npm run build` (2940 modules; existing >500kB chunk warning), and `git diff --check`. No lint script exists. CSS hash stayed unchanged during verification.

Evidence: `/tmp/lisno-projects-width-qa/browser-results.log`, `filter-results.log`, `width-1920.png`, `full-grid-1920.png`, the other six viewport screenshots, and `final-{page-tests,typecheck,build}.log`. Temporary preview browser/server stopped and browser artifacts moved outside the repository. No new dependencies or runtime artifacts retained in tracked source. Backend/full-suite/OCR checks were not run for this CSS-only change. No known unresolved issue; changes are local and not deployed.
