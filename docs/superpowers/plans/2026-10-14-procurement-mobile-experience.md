# Procurement mobile experience plan

Specification: [design](../specs/2026-10-14-procurement-mobile-experience-design.md).
Authority: standing autonomous Mode A plus explicit mobile redesign request.

## Parent task: implemented and verified within the limits below
1. Read-only web/mobile audits and capture baseline under `/tmp/lisno-procurement-mobile-ui`. Completed before writers.
2. Dashboard worker owns ProcurementDashboard, dashboard model/tests, new dashboard/assigned helper components and bundled project covers. AC2–3. Preserve existing reconciliation logic; independent assigned read pagination and no fabricated approval status.
3. Navigation worker owns new Procurement navigation model/menu/tests, ProcurementSubnavigation/tests only. AC1. Root owns scaffold integration, registry, More and shared icon sources. Explicit data-only menu contract, callback navigation and disabled props avoid cycles.
4. Root owns AdaptiveAppScaffold integration/tests, procurement Home compact KPI/read adapter, FeatureWorkspace dispatch, project tab presentation, any My requests subnavigation integration and docs. AC1, AC4. Preserve prior dirty changes.
5. Integrate all writers, focused tests and typecheck; independent integrity review for scoped authorization, source reconciliation and navigation guards. Resolve confirmed findings.
6. Final verification after freeze: focused native interaction tests, relevant shared navigation/route tests, typecheck, Android export, rendered phone/wider/large-font checks available and final diff preservation. AC5. Report limitations explicitly.

Tasks2 and3 can run in parallel after root settles interface. Root step4 has disjoint files. No concurrent writers of common targets.

## Baseline and preservation
Initial status, binary tracked diff and 210 untracked hashes captured. Most mobile/backend/web changes predate this request. No writer may revert, reformat or overwrite unrelated changes; new work only extends scoped files after reading their current content. No dependencies or lockfile changes planned.

## Verification status
Implementation integrated and writers frozen. Independent integrity review found one drawer rotation accessibility issue, fixed with regression coverage; no remaining confirmed blocker. Focused integrated verification: 10 suites / 203 tests passed; TypeScript passed. Before the bottom-navigation correction, all 175 mobile suites / 1,627 tests, TypeScript, 3 contract checks and Android export passed. After the correction, 7 focused suites / 67 tests, TypeScript and a fresh Android export passed. The full suite was not repeated for the bounded dock restoration. Native Android preview used only synthetic loopback fixtures. Visually confirmed Home overview, authoritative KPI and portfolio totals, original floating dock, Profile menu and More destination. Native tablet/font-scale/TalkBack, iOS and live API certification were not performed. Exact artifacts/limits are in `/tmp/lisno-procurement-mobile-ui/visual-handoff.md`. Task Metro, fixture API and isolated emulator stopped; temporary environment removed and generated start/export logs restored to their initially clean baseline. Native drawer opening is not certified; automated menu and responsive-transition checks passed. No lint script exists. No commit/push/deployment/production mutation authorized.

## User correction
Restore the existing compact floating bottom dock, icon-only tabs, Profile initials/menu, More route and selected-tab treatment. Keep the web-aligned drawer accessible from the header and preserve dashboard improvements. Root owns the scoped scaffold/test restoration; verify existing native navigation and guarded interactions, then inspect the running phone.

Final correction: restored the original dock and confirmed it visually on Android. No dependencies, lockfiles, backend contracts, approval rules or unrelated role navigation changed. Independent review found no remaining confirmed blocker after the drawer rotation fix. No deployment or migration performed.
