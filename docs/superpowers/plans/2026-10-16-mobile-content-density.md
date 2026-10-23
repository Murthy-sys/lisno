# Mobile typography and content spacing task plan

Source of truth: [approved specification](../specs/2026-10-16-mobile-content-density-design.md).

Status: approved Mode A implementation and planned local verification are finished. Native-device and release-build validation remain explicitly unperformed; see limitations below.

## Contract and boundaries

Use 20/26 standard page titles, up to 22/28 illustrated titles, 16/22 section headings, 14/20 row headings and body/input text, 13/18 default labels/buttons, and 12/17 metadata. Preserve established smaller Configuration styles. Default fields/buttons become a minimum of 48 units; existing compact controls remain at least 44. Use 12–16 page insets and section gaps, 10–12 panel padding, and 6–8 related-field gaps where appropriate.

Keep existing font families, colors, artwork, content, financial values, permissions, query behavior, save/discard handling, and error recovery. Preserve font scaling and flexible heights. Do not globally change spacing constants or shrink glyphs, avatars, chat message text, navigation targets, document content, or onboarding/splash artwork. No dependencies or lockfile changes are expected.

Initial status at planning contains only the untracked specification. Before execution, capture a fresh status and relevant diffs; preserve any newer changes. Do not stage, commit, deploy, modify production data, or install a release.

## Dependency-ordered tasks

### 1. Capture comparable baselines

Owner: primary. Prerequisite: task-plan approval and execution-mode selection.

- Inspect the concrete screen styles and consumers before assigning files. Confirm no target changes conflict with another task.
- Prepare temporary synthetic fixtures and rendered previews under `/tmp/lisno-mobile-content-density/`. Reuse existing UI-test fixtures and local preview tooling rather than adding dependencies. Render actual application components; label any mocked services or representative shell.
- Before style edits, capture Configuration catalog and Projects at 390×844 with identical fixtures for later comparison. Record header/control-block height and the vertical position of the first content row using stable element bounds. Preserve these baseline images and measurements.
- Include long names, multi-line labels, validation messages, and two unequal amounts with paise. No production credentials, account data, or private screenshots.

Acceptance: baseline evidence is sufficient to compare the same content after implementation. Covers specification criteria 2 and 3.

### 2. Establish shared compact defaults

Owner: primary. Depends on task 1.

Owned production files: `mobile/src/ui/tokens.ts` and `mobile/src/ui/primitives.tsx`.

- Apply the approved shared typography scale and default field/button dimensions. Keep compact variants explicit so they are not reduced twice.
- Add only the small content-spacing vocabulary needed by actual consumers, or reuse existing spacing values. Preserve general `spacing`, safe-area, and navigation constants.
- Tighten shared screen padding and gaps. Maintain wrapping, growing control heights, loading/disabled/error states, and readable form values.
- Inspect sign-in and the recovery fallback as shared-control consumers. Keep auth/onboarding hero typography and splash artwork unchanged.
- Publish the exact exported token names and values to any implementation workers before parallel file edits begin.

Acceptance: shared defaults match the approved scale without global multipliers or behavioral changes. Covers criteria 1, 4 and 5.

### 3. Align local content styles

Depends on task 2. The slices below may run in parallel in Mode A; keep this as the only parent task in progress until all slices are integrated.

| Slice / owner | Exclusive production ownership | Work |
| --- | --- | --- |
| Primary: Configuration and supporting screens | `features/knowledge/KnowledgeCatalogHeader.tsx`, `KnowledgeCatalogWorkspace.tsx`, `knowledgeUi.tsx`; `features/workspace/FeatureWorkspace.tsx`, `RecordDetailScreen.tsx`; `features/settings/MoreScreen.tsx`; `features/profile/ProfileScreen.tsx`; `features/notifications/NotificationsScreen.tsx`; `features/messages/ConversationList.tsx`, all under `mobile/src/` | Reduce catalog/ordinary list title and padding overrides. Keep detail editor fonts and touch areas intact. Tighten supporting list/detail spacing; chat changes are limited to its list heading and surrounding space. |
| Projects/estimates worker | `mobile/src/features/projects/ProjectsWorkspace.tsx`, `ProjectDetailHeader.tsx`, `ProjectCreationModal.tsx`; `mobile/src/features/estimates/ClientEstimateReviewScreen.tsx` | Align illustrated titles, header allocation, repeated spacing and review totals. Preserve artwork, complete values, content order, floating-action clearance, and responsive layouts. |
| Dashboard/procurement worker | `mobile/src/features/dashboard/components/DashboardChrome.tsx`, `mobile/src/features/dashboard/SuperAdminMobileDashboard.tsx`; `mobile/src/features/procurement/ProcurementDashboard.tsx`, `ProcurementHome.tsx`, `ProcurementVendorsWorkspace.tsx`, `procurementNative.tsx`, `VendorKpiStaffScreen.tsx` | Align large titles/metrics and content spacing. Retain financial units, full values, chart layout/data, drawers, and filter/action touch areas. |

All paths in the first ownership column that abbreviate filenames remain within the named directory. Writers must not edit another slice, shared tokens, shared primitives, or source/query/model logic. Files that already meet the scale need no change. Additional local presentation files may be assigned explicitly by the primary only if needed to complete an already-approved surface; material scope changes return to the specification gate.

Workers are not alone in the worktree: preserve others' edits and raise conflicts. Existing tests colocated with owned components may be updated only when an intentionally changed layout contract requires it; do not weaken behavioral assertions or add tests that merely mirror numeric styles. Primary owns shared/recovery/Configuration test integration.

Acceptance: targeted local overrides use the shared hierarchy, compact Configuration content is not made smaller, and no unrelated styling or behavior changes appear. Covers criteria 1, 3 and 4.

### 4. Integrate and inspect rendered behavior

Owner: primary. Depends on all task 3 writers finishing.

- Inspect the combined diff for missed overrides, duplicated tokens, accidental global spacing changes, fixed-height clipping, truncated amounts, and changes outside presentation scope.
- Repeat the 390×844 baseline renders and measure actual saved vertical space on Configuration catalog and Projects. Keep the same data, content, controls, scroll position, and viewport. Record measured differences without inventing percentage gains.
- At 320 and 390-unit widths, inspect Configuration catalog, detail Mode/Design, Projects list/detail, Dashboard, Procurement, and a shared form/list. Check a 768-unit layout for wrapping and artwork alignment. Use existing font families in previews.
- Check representative forms, Configuration tabs, and actions at font scale 1.5 or greater. Validate larger-text wrapping, full values/units, accessible names, selected/disabled states, error messages, and minimum touch areas. Browser text scaling is only a preview approximation; distinguish it from native system-font validation.
- Exercise filters, a tab switch, form input/error presentation, and save/discard navigation with synthetic services. No live mutation is needed. Retain the Configuration crash regression.
- Check an existing Android development session when practical without installing an app or changing production data. Record what actually ran; do not label a web preview as native verification.
- In Mode A, request a bounded `integrity_reviewer` pass after integration, then resolve confirmed issues. In Mode B, perform this review inline. Recheck affected views after corrections.

Acceptance: measured density improves while all reviewed content/actions remain usable and readable. Covers criteria 2–4 and 6.

### 5. Final verification and handoff

Owner: `verification_runner` in Mode A, primary in Mode B. Depends on task 4 review fixes finishing. Run final checks on the integrated tree.

From `mobile/`, run focused Jest suites for each modified surface. Required groups:

- Configuration: `KnowledgeCatalogHeader`, `KnowledgeCatalogWorkspace`, `KnowledgeItemWorkspace`, `KnowledgeModeEditor`, `KnowledgeDesignEditor`, `KnowledgeQualityEditor`, `KnowledgeRecommendationsEditor`, and `KnowledgeConfigurationCrash`.
- Shared consumers: `FeatureErrorBoundary`, `FeatureRoute`, `AdaptiveAppScaffold.ui`, and `SignInScreen`.
- Changed local workspaces: `ProjectsWorkspace`, `ProjectStructure`, `ProjectCreateActions`, `ClientEstimateReviewScreen`, `SuperAdminMobileDashboard`, `DashboardChrome`, `ProcurementDashboard`, `ProcurementHome`, `ProcurementVendorsWorkspace`, and `ProcurementNativeFlows`.
- Supporting `MoreScreen`, `ProfileScreen`, `NotificationsScreen`, `ConversationList`, and `VendorKpiStaffScreen` suites only if their corresponding styles change.

Use `npm test -- --runInBand <exact affected test paths>`. Resolve any relevant baseline failure from evidence; do not hide it by deleting assertions. Tests that validate existing compact sizes should continue to pass unless the approved spec explicitly changes that size.

Then run:

```sh
# mobile/
npm run typecheck
npx expo export --platform android --output-dir /tmp/lisno-mobile-content-density-android

# repository root
git diff --check
git status --short
```

Capture the pre-export tracked-log state. Restore only incidental changes produced by this export; preserve existing dirty logs. No lint script exists. Backend, OCR, web frontend builds, and release Gradle builds are outside this mobile presentation check unless a concrete dependency requires them.

Record exact commands/results, affected files, before/after measurements, rendered checks, evidence paths, and any native verification gap in this plan. State that existing APK/AAB files need rebuilding to include the changes. No dependency, migration, production action, or publication is included.

## Execution mode

- Mode A: primary completes baseline/shared-token work first, then the two independent workers run their local slices while the primary handles Configuration/supporting screens. Integrated integrity review precedes final verification.
- Mode B: primary completes the same dependency order inline, with no implementation sub-agents.

Approval stages are complete; no additional product decision is open.

## Implementation and evidence

The shared hierarchy now uses page titles 20/26, section titles 16/22, card/body text 14/20, button labels 13/18 and metadata 12/17. Illustrated workspace titles use 22/28. Shared screen insets/gaps are 16; default fields/buttons retain a 48-unit minimum and compact variants retain 44. Existing compact Configuration detail overrides, font scaling, font families, colors, artwork, permissions, requests, amounts and save behavior remain intact. General spacing constants were not changed.

All three ownership slices were implemented. `KnowledgeCatalogWorkspace.tsx` required no direct edit because it inherits the updated styles. Two additional local files were explicitly assigned: `ProjectCard.tsx` for its name typography, and `VendorInductionStaffSection.tsx` for the existing shared vendor-panel padding contract. A responsive regression was added in `DashboardChrome.test.tsx` after visual inspection found an amount wrapping poorly in a narrow FactRail. No dependencies or lockfiles changed.

### Comparable density measurements

Actual components were rendered with local fonts, identical synthetic content and a 390×844 viewport. The Configuration comparison uses the actual catalog header with representative rows; the Projects comparison uses the actual workspace/cards.

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Configuration header wrapper height | 261 px | 232 px | 29 px shorter |
| Configuration first representative row top | 269 px | 240 px | 29 px earlier |
| Projects hero height | 170 px | 148 px | 22 px shorter |
| Projects first card top | 359 px | 323 px | 36 px earlier |
| Projects first card height | 213 px | 205 px | 8 px shorter |

Evidence: `/tmp/lisno-mobile-content-density/{configuration,projects}-{before,after}.png`. The immutable baseline bundle is under `baseline/`; only `current/` was rebuilt after edits.

### Rendered and interaction checks

The React Native Web preview exercised Configuration catalog/detail, Projects, Project detail header, Dashboard components, Procurement, shared form primitives and sign-in at 320, 390 and 768 px widths, plus 320 px with 1.5× text: 32 states, no page errors or document horizontal overflow. Local synthetic services were used throughout. The dashboard preview renders `OperationsHeader` and `FactRail`, not the complete Super Admin dashboard; its full screen is covered by renderer tests. Project detail combines the actual header with representative detail content.

Manual visual inspection covered long names, complete unequal financial values, labels, errors and enlarged controls. All six Configuration tabs were switched at 1.5× text. A synthetic PMC rate edit enabled Save and triggered the unsaved-change dialog when opening Design; Discard and continue opened Design, and returning to Mode restored 123.45 with Save disabled. Shared form editing cleared the required-name error and its local save action remained clickable. The Projects Active filter retained only the active synthetic record. Configuration save/conflict/error recovery behavior is additionally covered by the focused tests; preview API mutations are disabled.

Visual inspection caught narrow/enlarged financial headline wrapping in the FactRail component. It now uses measured container width and font scale to stack its sections, with explicit natural child sizing. The final four Dashboard component previews passed the same width/text matrix; inspected 320/1.5 and 390/1 images show separated content and the complete `₹12,34,567.89` headline on one line. The independent integrity review found no remaining source defects. The temporary browser and preview server were closed after verification.

Browser scaling is an approximation of native text scaling. An Android target was connected, but no rebuilt native app or native system-font check was performed. No app was installed or production data accessed. The full native release and device check remain a handoff limitation.

### Integrated verification

Initial integrated verification passed **27 suites / 365 tests**, mobile typecheck, Android JS export and `git diff --check`. The suites are the exact groups listed in task 5, including all five optional supporting-screen suites. Logs are at `/tmp/lisno-mobile-content-density/logs/{focused-tests,typecheck,android-export}.log`; the test log records the full command and matched paths. Export output is `/tmp/lisno-mobile-content-density-android`.

After the final Dashboard correction, the verification runner repeated the following on the unchanged integrated product diff:

| Command (from `mobile/` unless noted) | Result |
| --- | --- |
| `npm test -- --runInBand src/features/dashboard/components/DashboardChrome.test.tsx src/features/dashboard/SuperAdminMobileDashboard.test.tsx` | 2 suites / 25 tests passed, exit 0; no warnings |
| `npm run typecheck` | Exit 0 |
| `npx expo export --platform android --output-dir /tmp/lisno-mobile-content-density-android` | Exit 0; 3,029 modules, 12 MB Hermes bundle |
| `git diff --check` (repository root) | Exit 0 |
| `git status --short` (repository root) | Expected source/test/docs plus existing Expo start log |

Final logs use the `final-` prefix in the same evidence directory. The combined evidence covers **366 distinct passing tests**: the original 365 with the changed Dashboard suites rechecked, plus one new responsive regression. Production changes span 23 files with one colocated test file updated. The final export produced one non-failing color-environment warning.

Warnings: one existing asynchronous `act` warning in `KnowledgeItemWorkspace`, color-environment warnings during export, and React Native Web's expected native-driver warning in the preview. None failed validation. No lint command exists. Full mobile/backend/frontend/OCR suites and Gradle release builds were not run for this presentation-only change.

The tracked Expo start log was already changing from the existing development session and is preserved. Only export-generated tracked-log changes were restored to their pre-check contents. No staging, commit, push, deployment, migration or external mutation was performed. Existing APK/AAB artifacts must be rebuilt to include these changes.
