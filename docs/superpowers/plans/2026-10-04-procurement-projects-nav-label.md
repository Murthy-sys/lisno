# Procurement Projects navigation label task plan

Date: 2026-10-04
Status: Approved 2026-10-04; Mode A implemented
Approved specification: [Procurement Projects navigation label](../specs/2026-10-04-procurement-projects-nav-label-design.md)

## Ownership and dependency order

One frontend owner handles the bounded change. No parallel implementation tasks are useful because both edits share one navigation contract. Preserve all pre-existing dirty paths.

1. **Update the route label.** In `frontend/src/app/routeRegistry.ts`, change only the Procurement-role `/procurement` group child from `Dashboard` to `Projects`. Keep the Super Admin child, route, permission, icon, and group metadata intact. Satisfies acceptance criteria 1 and 3.
2. **Update rendered navigation assertions.** In `frontend/src/components/layout/navigation.test.tsx`, expect role-specific labels and assert `Projects` remains the current link on `/procurement/projects/:projectId`. Retain the existing keyboard and Vendors checks. Satisfies criteria 1–3.
3. **Verify the integrated result.** Run the focused navigation test, frontend typecheck, `git diff --check`, and a rendered desktop/mobile navigation check or equivalent component render at both widths. Confirm no other changed paths were introduced by this task. Satisfies criterion 4.

## Verification boundary

This is a presentation-only rename. Backend tests, API changes, migrations, dependency installation, and deployment are outside scope. Report any pre-existing failures separately from this focused check.
