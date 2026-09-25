# Mobile visual alignment plan

Specification: ../specs/2026-09-23-mobile-web-style-sync-design.md. Approval gates waived by the user's standing instruction; parallel mode retained.

Parent task: implementation, integrity review and scoped Android verification complete. Full suite retains one pre-existing contract inventory failure.

1. Evidence and shared contract (primary, completed): capture dirty baseline; read current web and native sources. Set shared semantic olive/sage palette, warm surfaces, Poppins hierarchy, radii12/8, minimum48dp controls; Fraunces500 auth title.
2. Shared UI (primary): own mobile/src/ui/*, root font loading, dependency and lockfile, generic workspace styles if necessary. Preserve prior Back implementation. Verify button busy/disabled/error treatment.
3. Navigation slice (independent implementer): own AdaptiveAppScaffold.tsx, its UI tests, and a navigation icon module. Implement icon-only phone tabs, labeled tablet rail, sage shell and notification icon without changing route or Back policy. Acceptance3/5.
4. Auth/onboarding slice (independent implementer): own AuthFrame.tsx and onboarding presentation files/tests. Match sage/cream auth, Fraunces display title, restrained card/buttons and shared palette. Preserve auth/Back and onboarding motion/state. Acceptance1/2/4/5.
5. Dashboard consistency (independent implementer, completed after shared contract): align dashboard custom surfaces/geometry/type with shared tokens, preserving data charts and interactions. Acceptance1/4/5.
6. Integration review (read-only integrity reviewer, after writers): compare incremental diff against baseline, accessible icon tabs, color contrast and behavior invariants. Resolve confirmed findings.
7. Verification (verification runner after review): focused rendering/navigation/auth/dashboard tests, typecheck, Android export, diff check; bounded visual phone/tablet QA by primary. No unrelated contract-drift repairs. Record exact results and limitations.

Parallel boundaries: tasks2,3,4,5 have disjoint ownership; primary integrates them. Final review and verification occur after all writers finish. No commits/deployment/data changes.

Integration: one status-bar mounting-order issue identified and fixed by placing the root default before Stack, allowing screen overrides to win on cold auth entry. Native Android login, home, Projects, Back and icon-tab selection are working. Phone (about411dp), tablet (864dp) and 1.3x text screenshots were inspected. Temporary display settings were restored. iOS device QA was not run. External workspace activity advanced HEAD to 7067970 during execution; this task did not create that commit or revert it.

Final evidence: 60/60 focused tests; full mobile suite 629 passed / 1 unchanged contract-drift failure (224 expected / 227 backend operations); typecheck and Android export passed with bundled Fraunces 500 verified. Native phone, tablet and 1.3x text inspected; cold reset direct-link dark status bar verified. `git diff --check` passed. Report: /tmp/lisno-mobile-web-style-sync-20260923/final-verification/verification-report.md. No iOS or production release validation. No deployment, migration, seed or commit performed by this task.
