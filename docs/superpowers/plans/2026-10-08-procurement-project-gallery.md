# Procurement project gallery: implementation plan

Approved specification: [Procurement project gallery](../specs/2026-10-08-procurement-project-gallery-design.md).

## Authority and status

The user approved the specification and task plan on 2026-10-08 and selected Mode A. All tasks are complete and verified. Backend, frontend product and frontend test writers are frozen. Independent integrity review found no confirmed defects. User feedback to shrink cards to four per desktop row and shrink the summary panels is incorporated. The primary owns imagery/resolver, browser evidence and integration. Baseline status, complete prior diff and 12 target snapshots are under `/tmp/lisno-procurement-project-gallery-qa/`.

The previous mode-group implementation remains uncommitted and must be preserved. Current status contains those 29 paths plus this request's specification. The primary agent must capture the new baseline immediately before implementation, including the exact overlapping-file diffs. Keep only one parent task in progress.

## Settled implementation contract

- Reuse `ProcurementWorkspace` at `/procurement` and the Procurement `/home` view. The existing project-detail route and route builder remain unchanged.
- Backend adds `clientName: string | null` to `ProcurementProjectDto`, read from the same resolved Project document. Add the field to that document's existing select projection and normalize absent/blank historical names to null. No new lookup, schema, persisted value, write, authorization operation or client-identity inference.
- Update the explicit `ProcurementProject` schema in `backend/src/openapi.ts` (currently near line 3406). Backend emits the field consistently; frontend types accept `clientName?: string | null` so older responses remain readable.
- Keep the approved-estimate and posted-spend helpers, source integrity gate, query key, server ordering and financial meanings unchanged. Aggregate the full authorized selected value with safe integer-paise arithmetic. If the portfolio sum cannot be represented safely, show an explicit unavailable summary; do not fabricate zero or hide otherwise individually valid project cards.
- Search is trimmed, case-insensitive project-name matching. Status filters use only the existing task states: All status, Open, In progress and Completed. The cards/results are filtered; the two summary panels always describe all authorized loaded projects.
- Counts on images represent displayed positive-value approved line occurrences, with a real item-count label. They are not photos or unique Main Lines. Retain the existing selected-section information in accessible or concise supporting text.
- Date means `openedAt` / Procurement opened. Person means the saved project's client. Omit unavailable names; do not substitute another user, manager or project. Invalid dates receive an explicit unavailable treatment or omission.
- Cover pictures are local representative interiors, assigned stably by project ID. No gallery controls, uploaded-photo implication or item/business joins by image or name. Reserve space and support static skeleton fallback.
- Use four/three/two/one project-card columns, two summary panels and scoped neutral/green styling. The user's 2026-10-08 implementation feedback requests smaller cards and four per desktop row. Existing basket groups and all commercial detail components are outside the styling boundary.

## 1. Capture the baseline and settle implementation boundaries

Owner: primary agent. Depends on task-plan approval and execution-mode selection. Acceptance: AC2, AC4–AC6, AC8.

- Save `git status --short` and diffs for intended targets under `/tmp/lisno-procurement-project-gallery-qa/`. Capture overlapping files in full before writers begin. Do not stash, reset, revert, stage or reformat prior work.
- Confirm the current route/component chain and take a synthetic browser screenshot of the existing list and its link into the completed basket overview.
- Inspect current cover assets at their real sizes/crops. Choose reusable living-room imagery and determine whether suitable bedroom/kitchen images already exist. Freeze the cover resolver's file/API with the frontend owner before concurrent edits.
- Reconfirm the exact metadata projection, OpenAPI schema, permissions and lack of commercial-hash dependency. The shared backend service already contains the prior approved-mode parser changes, which must remain byte-for-byte outside the assigned gallery slice.
- Establish a scoped styling approach. Prefer a dedicated `procurementProjectGallery.css` and unique selectors under this workspace over edits to the large global stylesheet. If a global rule cannot be neutralized locally, the primary owns only the specific existing project-list rule and coordinates that edit sequentially.
- Freeze the test/browser fixture contract: at least three unequal projects spanning all statuses, two distinct client names, one missing client name, different estimate versions, positive/zero/negative remaining values, long metadata and large amounts. All values must reconcile with posted expense fixtures.

## 2. Implement the independent packages

Depends on task 1. In Mode A, packages 2A, 2B and 2C can proceed concurrently after the contract is shared; the primary handles 2D. In Mode B, the primary implements the same packages sequentially. Tell every writer they are not alone and must preserve the prior changes and other owners' work.

### 2A. Read-only client metadata

Owner in Mode A: `backend_implementer`. Acceptance: AC2, AC4, AC6, AC8.

Exclusive paths:

- `backend/src/services/procurement.service.ts`: only the project DTO type, its return object and existing Project select projection.
- `backend/src/openapi.ts`: only the ProcurementProject schema.
- `backend/tests/procurement-routes.test.ts`, `backend/tests/procurement-mongo.replica-set.test.ts`, and the relevant schema assertion in `backend/tests/api-docs.test.ts` if needed.

Work and verification:

- Emit the current saved `Project.clientName` for the exact resolved project; normalize absent/empty/whitespace-only names to null. Do not change snapshot, transaction, expense, selection or workflow logic.
- Preserve public route authorization, response caching and denial behavior. No new queries, writes or per-card calls.
- Test at least two unequal projects with different clients and IDs, missing/blank legacy names, a changed saved client name, denied actors and existing approved-snapshot/financial reconciliation.
- Confirm the extra display field cannot enter preparation or basket digests. Retain the existing exact hash and mode-group regressions; no fixture weakening to bypass financial or source checks.
- Share the final shape with the frontend owner immediately, then freeze this package.

### 2B. Gallery, filters and safe summaries

Owner in Mode A: `frontend_implementer`. Acceptance: AC1–AC5, AC7, AC8.

Exclusive paths:

- `frontend/src/features/procurement/ProcurementWorkspace.tsx`.
- New focused gallery/card component and stylesheet in the same directory if extraction improves clarity, for example `ProcurementProjectCard.tsx` and `procurementProjectGallery.css`.
- `frontend/src/features/procurement/procurementPresentation.ts`: add only a focused safe portfolio-summary helper if needed; preserve current shared helpers and integrity behavior.
- `frontend/src/api/types.ts`: only the additive optional client-name field.

Work:

- Build the reference's heading/control row, compact project count, unequal-width summary panels and image-led cards. Use existing typography and tokens with local styles; remove the existing Lucide dependency from this changed component's rendering by using small inline SVGs.
- Keep native semantic links, list/article structure, readable financial labels and exact existing project routes. Do not add nested links/buttons or attach navigation to decorative elements alone.
- Use the approved field meanings: estimate version, opened date, client name, selected line and section counts, selected/spent/remaining values. Render negative remaining values honestly and preserve paise precision through `formatPaise`.
- Implement local search/status filters, clear/reset and filtered counts. Compute summary values before filters from the same validated source. Add an aggregate overflow guard without replacing the existing per-project calculations.
- Preserve loading, error/retry, invalid-lineage and authorization states. Cached projects, client names and summary values must disappear when an access/query/integrity error makes them unavailable. Background fetching may retain currently authorized valid content with its existing busy indication.
- Consume the primary-owned cover resolver, preserve dimensions during image loading/failure, and use empty alt text with a representative-interiors indication.
- Make long names and currency reflow without truncation. Keep cover ratio around 3:1 with compact text, padding and gaps, and use content-driven card heights. No motion, shadows, gradient accents, global shell redesign or commercial component edits.
- Run an initial typecheck and focused tests, then freeze product files for integrated review. Request fixture corrections from the test owner rather than editing their paths.

### 2C. Rendered regressions and browser fixtures

Owner in Mode A: frontend test worker. Acceptance: AC2–AC8.

Exclusive paths:

- `frontend/src/features/procurement/ProcurementWorkspace.test.tsx`; preserve the prior `qaEmptyModeGroups()` addition.
- A new focused `ProcurementProjectGallery.test.tsx` if needed to keep layout/control scenarios separate, plus a focused summary-helper test only if behavior cannot be covered clearly through rendered tests.
- `frontend/src/test/fixtures/enterpriseProcurementGalleryData.ts` for opt-in gallery data, if extraction avoids expanding the prior fixture unnecessarily.
- `frontend/src/test/fixtures/enterpriseRoutes.ts` and `enterpriseTransport.test.tsx`, limited to the new opt-in gallery scenario. Modify `enterpriseProcurementData.ts` only for backward-compatible client metadata or shared types, preserving every existing group fixture.

Work:

- Keep every existing authorization, project identity, expense reconciliation, source mismatch and project-navigation assertion. Adapt row-specific presentation assertions only as required by the new structure.
- Assert exact project and portfolio amounts for unequal projects, retained negative balances and safe overflow handling. Include zero-value line filtering and separate occurrences of the same Main Line in different rooms.
- Test trimmed/case-insensitive search, each status, combined filters, clear/reset, filtered result count and unchanged full-list summaries. Verify these interactions cause zero mutations or extra API reads.
- Cover actual/missing/blank client names, invalid dates, long metadata, stable covers after filtering/reordering, failed photos and native keyboard navigation.
- Cover initial loading, empty data, no results, retry, malformed financial lineage and access revoked during refresh. Ensure cached names/counts/amounts do not leak through error states.
- Assert a card still opens the correct project by ID and renders the existing mode-group overview with its canonical basket links.
- Add a synthetic opt-in browser route such as `/procurement?qaProcurementGallery=ready`, with a matching `/home` variant if needed. Existing fixture scenarios must retain their behavior; use no real client data or production APIs.
- Do not mirror the production aggregation function when constructing expected amounts. Use explicit expected values and real expense lineage.

### 2D. Representative covers

Owner: primary agent. Acceptance: AC1, AC7, AC8.

Exclusive paths: a focused resolver such as `frontend/src/features/procurement/procurementProjectImages.ts` and new assets under `frontend/src/assets/procurement-projects/`. Existing basket photos/resolver remain untouched.

- Inspect and reuse the suitable existing living-room cover. Generate generic bedroom and kitchen interiors only if no suitable local assets exist, using the image-generation skill and tool. No customer uploads, remote scraping or image-gallery API.
- Keep cover lighting/materials consistent with the reference: warm residential interiors, no text, branding or people. Optimize for landscape display using available encoders, aiming for roughly 960 px usable width and modest per-image size without visible artifacts. Record actual dimensions, sizes and provenance.
- Export a stable project-ID-based resolver. Image selection must not change with sorting, filtering, title edits or refetch; it must not influence business identity.
- Provide finalized paths to the frontend owner before their final build. Keep generation intermediates outside the repository and retain only the intended optimized assets.

## 3. Integrate and review

Owner: primary agent, then `integrity_reviewer` in Mode A. Depends on all packages in task 2. Acceptance: AC1–AC8.

- Inspect the complete diff against the captured dirty baseline, separating this request's additions from the preserved mode-group work.
- Review API/type/OpenAPI alignment, same-project client mapping, unchanged query/authorization/source contracts and hash invariants.
- Reconcile card and full-list totals, filtering scope, overflow handling, negative balances and actual selected-item counts. Ensure error states hide retained private/financial data.
- Verify the current project link and mode-group drill-down remain intact and no commercial mutation component was changed.
- Review photos as decoration, deterministic cover selection, fallback, semantic controls and scoped style effects at content breakpoints.
- Resolve findings within explicit file ownership. Freeze all product/test/asset writes before final verification. In Mode B, the primary performs this review inline.

## 4. Verify the integrated worktree

Owner: `verification_runner` for final commands and primary for rendered browser checks in Mode A; primary sequentially in Mode B. Depends on task 3. Acceptance: AC8 and regression evidence for AC1–AC7.

Backend focused, from `backend/`:

```sh
npm test -- tests/procurement-routes.test.ts tests/estimator-configured-procurement.test.ts tests/procurement-basket-mode-groups.test.ts
npm test -- tests/procurement-mongo.replica-set.test.ts tests/procurement-basket-mode-groups.replica-set.test.ts tests/project-purchase-order-preparation-mode.replica-set.test.ts
npm test -- tests/api-docs.test.ts tests/route-operation-registry.test.ts tests/authorization-policy.test.ts
npm run typecheck
npm run build
```

Use the repository's actual Mongo replica-set helper. Do not substitute a standalone database, production URI, seed or migration. If sandbox binding/network restrictions prevent required checks, rerun with scoped execution permission rather than weakening the tests.

Frontend focused, from `frontend/`:

```sh
npm test -- src/features/procurement/ProcurementWorkspace.test.tsx src/features/procurement/ProcurementProjectGallery.test.tsx src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketModeGroups.test.tsx src/features/procurement/ProcurementBasketModeEditor.test.tsx src/test/fixtures/enterpriseTransport.test.tsx
npm run typecheck
npm run build
```

If all gallery cases are kept in the existing workspace suite, omit the nonexistent gallery test path and record the actual command. Include any introduced summary-helper test. Run typecheck/build sequentially within each workspace. Independent backend/frontend lanes may run concurrently once all writers freeze. Broaden checks for a demonstrated risk/failure, not to inflate counts. No lint script exists.

Browser checks:

- Capture and inspect `/procurement` and the reused Procurement `/home` view using the synthetic gallery data, followed by one View project action into the existing mixed-mode basket overview.
- Inspect wide desktop 2048/1440 px, intermediate 1024/768 px and mobile 390/320 px, including a short-height viewport. Confirm four/three/two/one columns at suitable content widths, image crops, compact height and no page overflow.
- Check all statuses, unequal values, long names, missing names, large money, negative/zero balances, loading, empty/no-results, error/retry, denied/revoked access and image failure.
- Exercise pointer and keyboard search/filter/reset/navigation, visible focus and result announcements. Confirm full-list summaries remain stable while filtering and that project identity survives same-name cards.
- Check fresh console and API activity, zero writes for display interactions and no per-card requests. Run an automated accessibility scan on the changed region and distinguish existing shell findings from new regressions.
- Inspect screenshots as images; iterate on confirmed layout/contrast issues and rerun the affected checks. Record native zoom/device/browser/screen-reader limitations honestly.

Root hygiene:

```sh
git diff --check
git status --short
```

## 5. Record results and hand off

Owner: primary agent. Depends on task 4. Acceptance: AC8.

- Record actual changed files, asset provenance/sizes, test commands/counts, build results, browser matrix, accessibility findings, warnings and unrun checks in this plan.
- Link representative synthetic screenshots/report output under `/tmp/lisno-procurement-project-gallery-qa/`. Move only this task's runtime screenshots/logs out of the worktree, preserving unrelated outputs.
- Stop only browser/server sessions started for this task. Leave approved source and optimized image assets reviewable in the worktree. Do not stage, commit, deploy or modify production.
- Update completion status only after final review and verification pass. Report that the redesign changes project-list presentation and adds client-name display while preserving the existing financial and procurement workflows.

## Execution choice and ownership rules

After task-plan approval, ask the repository's execution-choice question once. Mode A permits the bounded parallel packages above; Mode B keeps implementation, integration, review and verification in the primary thread. No subagents start before the new request's execution choice.

The primary owns product interpretation, this plan, the integration contract, cover assets/resolver and final reconciliation. Backend and frontend writers must not edit one another's paths. The test owner owns shared synthetic-fixture edits. No agent may repurpose prior mode-group files or change commercial behavior to make this redesign easier.

## Final verification and outcome (2026-10-08)

All five tasks are complete. Final user feedback is applied: four compact cards per desktop row, smaller photo/text/spacing, and summary panels approximately 62px high (59px on narrow mobile). Ordinary selected/spent/remaining amounts fit one row at 279px card width; larger amounts wrap intrinsically without clipping. No dependencies, schema migration, commercial mutation, commit, deployment or production action was introduced.

### Changed files

- Backend: additive client metadata in `src/services/procurement.service.ts` and `src/openapi.ts`; regression assertions in `tests/procurement-routes.test.ts`, `tests/procurement-mongo.replica-set.test.ts`, and `tests/api-docs.test.ts`.
- Frontend: `src/features/procurement/ProcurementWorkspace.tsx`, new `ProcurementProjectCard.tsx`, `procurementProjectGallery.css`, `procurementProjectImages.ts`, additive portfolio helper in `procurementPresentation.ts`, and optional client field in `src/api/types.ts`.
- Frontend coverage: `ProcurementProjectGallery.test.tsx`, `ProcurementWorkspace.test.tsx`, new `enterpriseProcurementGalleryData.ts`, `enterpriseRoutes.ts`, and `enterpriseTransport.test.tsx`.
- Three local covers under `frontend/src/assets/procurement-projects/`. Prior mode-group changes are preserved against the captured baseline.

### Automated checks

The exact commands listed in task 4 were executed on the integrated worktree. Backend groups passed **34 + 50 + 149 = 233 tests**; final frontend rerun passed **148 tests across six files**, for **381 tests** total. Both workspace typechecks and builds passed. Root `git diff --check` passed and final status was inspected.

The initial sandboxed backend listener attempt hit EPERM; the scoped rerun passed. Vite reports its existing warning for chunks above 500 kB. There is no lint script. Full suites, OCR, native screen-reader/zoom checks and other browser engines were not run; no migration applies. Logs are at `/tmp/lisno-procurement-project-gallery-qa/verification/`; frontend final logs carry `-final.log`.

Independent integrity review found no confirmed defects in the additive client mapping, authorization and cached-content display gates, financial reconciliation, source/hash preservation, route identity, fixture lineage or scoped styling. The endpoint has no explicit HTTP Cache-Control policy in the baseline; this work does not claim or add one.

### Browser evidence

Real Chromium, synthetic data only:

| Viewport | Columns | Page/amount overflow |
| --- | --- | --- |
| 2048×1100 | 4 | None |
| 1440×1000 | 4 | None |
| 1024×900 | 3 | None |
| 768×900 | 2 | None |
| 390×844 | 1 | None |
| 320×568 | 1 | None |
| 1440×600 | 4 | None |

Large-value cases at 1440 and 320px also passed without clipping. Final screenshots were inspected as images, including desktop, mobile and large-value mobile. Desktop normal cards measured about 318px high at 1440px; long metadata increased one card to about 361px without truncation.

Search (trimmed/case-insensitive), every status, clear/reset, no results, stable full-list ₹87,050.00 totals, and keyboard focus/navigation passed. Filter interactions caused **zero extra reads and zero writes**. Image failure retained exactly the same card dimensions. Both /procurement and /home render the gallery; keyboard View project navigation reached the canonical project, and opening its PMC basket still displayed all four mixed-mode lines. Loading, empty and error/retry states were rendered in Chromium; invalid lineage, denied/revoked access and cached 403/503 failure are additionally covered by rendered regression tests.

The changed gallery has no automated accessibility findings. Whole-page desktop axe reports one pre-existing Vendors sidebar contrast issue (4.43:1); mobile reports zero violations. No application render errors or unexpected API failures occurred in populated interaction checks. The synthetic shell has a known stylesheet preload warning.

Browser artifacts are moved to `/tmp/lisno-procurement-project-gallery-qa/browser/`, including `procurement-gallery-final-1440x1000.png`, `procurement-gallery-final-390x844.png`, `procurement-gallery-final-large-320x568.png`, and state/fallback captures. Only the browser/server started for this task were stopped.

### Cover assets and generation provenance

All covers are decorative, assigned by stable project ID, with no relation to uploaded project files. Existing living-room imagery was reused; bedroom and kitchen were generated with the built-in image tool, inspected, and encoded using available cwebp at quality 82 and 1200px width. Total payload: **193,296 bytes**.

| Final asset | Dimensions | Bytes | Source |
| --- | --- | --- | --- |
| living-room.webp | 1200×400 | 69,164 | Existing projects-living-room.webp |
| bedroom.webp | 1200×513 | 68,024 | Built-in imagegen |
| kitchen.webp | 1200×500 | 56,108 | Built-in imagegen |

Generated originals remain under `/Users/apple/.codex/generated_images/01a11707-707e-7ea1-b15b-1c50b91d2042/`: bedroom `exec-b8897d3b-5ea6-43b8-8ee8-9b30b05dd847.png`, kitchen `exec-17045f0f-78b4-4f1b-aeb9-6b3948989dc2.png`.

Final bedroom prompt:

> Use case: photorealistic-natural. Asset type: local decorative landscape cover photo for an interior-design project card. Create a realistic architectural photograph of an elegant contemporary Indian apartment bedroom, warm oak wall panels, cream upholstered double bed with oatmeal linen, two understated bedside lamps, a large window with sheer curtains, subtle recessed ceiling lighting. Wide landscape composition about 2.4:1, whole bedroom visible, eye-level natural perspective, straight verticals, bed central and generous room context. Soft daylight balanced with warm evening lamps, warm beige stone and natural wood palette. Polished but believable, matching a refined neutral living-room interior photograph. Keep the important room details within the central wide crop. No people, no logos, no watermarks, no text, no UI, no borders. One single photograph, not a collage.

Final kitchen prompt:

> Use case: photorealistic-natural. Asset type: local decorative landscape cover photo for an interior-design project card. Create a realistic architectural photograph of an elegant contemporary Indian apartment kitchen, warm oak lower cabinetry, cream stone counters and backsplash, integrated appliances, understated black tap, a small island, subtle recessed ceiling lighting and warm under-cabinet lighting. Wide landscape composition about 2.4:1, whole kitchen visible from the open living area, eye-level natural perspective and straight verticals. Soft daylight, warm beige and natural wood palette, refined but believable residential interior matching a neutral luxury living-room photograph. Minimal accessories. Keep essential room detail in the central wide crop. No people, no logos, no watermarks, no text, no UI, no borders. One single photograph, not a collage.
