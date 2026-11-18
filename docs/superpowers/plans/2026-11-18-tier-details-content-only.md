# Tier details: content-only implementation plan

Date: 2026-11-18
Status: Approved and implemented in Mode A. Tasks 1–4 complete; independent review, integrated tests, browser checks, typecheck, build, and hygiene passed. Application changes remain limited to the tier-details component and stylesheet.
Source of truth: [Approved specification](../specs/2026-11-18-tier-details-content-only-design.md).

## Result and boundaries

The per-item detail area displays exactly one audience's content:

- Client/default: the selected tier's saved Description, preserving authored text and line breaks.
- Authorized internal team: the selected tier's specification item names and known Brand names, shown directly.

Remove the visible disclosure heading, internal description paragraph, unavailable/not-configured sentences, and substitute Brand text. Empty content renders nothing. Keep nonvisible accessible associations, plain-text escaping, and responsive wrapping. Preserve the current explicit internal capability flag; do not infer internal access from editability.

Surrounding item controls, actionable feedback outside the detail area, pricing/GST, save commands, backend projection/fallback rules, and stored descriptions remain outside this presentation change. No backend, API, shared contract, dependency, schema, migration, service restart, deployment, commit, or push is required.

## Ownership and execution

Execution begins only after this plan is approved and the user selects A or B. Keep one parent task in progress.

| Owner | Allowed files/responsibility |
| --- | --- |
| Primary | Approved interpretation, initial baselines, integration, these documents, browser evidence, final handoff. Own any unexpected shared-file dependency. |
| Renderer owner | `frontend/src/features/estimates/EstimateLineTierDetails.tsx`, `estimate-line-tier-details.css`, and `EstimateLineTierDetails.test.tsx`. |
| Consumer-test owner | `frontend/src/features/leads/ConfiguredEstimateBuilder.test.tsx`; client tests `ClientQuotationLine.description.test.tsx` and `ClientEstimateTiers.test.tsx`; Configuration tests `KnowledgeMainLineClientPreview.test.tsx` and `KnowledgeItemWorkspace.clientPreview.test.tsx`, only as needed for exact-content coverage. No product-source edits. |
| Integrity reviewer | Read-only audience separation, stale/empty content, scope, and accessibility review. |
| Verification owner | Final commands/evidence after writers and review fixes finish. No product edits. |

In Mode A, renderer and consumer-test work can run in parallel after task 1 establishes the contract and file baselines. Each writer must preserve others' changes and stay within assigned paths. Review and final verification follow sequentially. In Mode B, the primary performs the same work inline. Do not spawn agents before this change's execution-mode selection.

## Tasks

### 1. Capture the baseline and reproduce extra content

Dependency: plan approval and execution choice.

- Recapture `git status --short` and per-target diffs immediately before edits; read any pre-existing changes. The planning check found only the new specification untracked, so do not assume earlier conversation changes are still dirty.
- Retain existing GST, selected-tier projection, Brand-prefill, and copy-previous behavior.
- Establish failing internal exact-content assertions: the current renderer includes the client description, **Internal specifications**, and unavailable/empty-Brand text. Preserve the passing client-only exact-text checks.
- Use distinct Signature/Premium/Functional descriptions, specification/Brand names, and private-field sentinels. Specify content expectations independently of DOM structure so tests catch an extra visible line.

Acceptance: AC1–AC3 have concrete regression cases and writer boundaries are settled.

### 2. Implement exclusive audience presentation and update consumer checks

Dependency: task 1. Two non-overlapping slices may progress concurrently.

**Renderer slice:**

- Keep client/default rendering limited to the nonempty selected Description; return null otherwise. Preserve authored text and escaping.
- For explicit internal access, render only nonempty specification entries directly in a semantic list. Use known, nonblank Brand names; omit unknown/blank names and empty parentheses. Do not show the description or a substitute for absent details.
- Remove the `details`/`summary` disclosure and its unused CSS. Keep compact spacing and text wrapping without leaving an empty header or focus stop.
- Keep accessible item/tier association nonvisible. Verify exact text, no headings/placeholders, empty states, markup-looking text, unequal rows, long text, and tier/source/access changes.

**Consumer-test slice:**

- Update internal builder tests to inspect the directly rendered details and require absence of client descriptions and explanatory copy. Preserve existing tier switching, rates/amounts, quantity/inclusion, no-write, and source-unavailability assertions.
- Update the existing row-action keyboard test: after its action trigger, focus should move to the next real row control, with no removed disclosure stop.
- Strengthen client quotation, tier choice, and Configuration preview tests where needed so the detail region's text equals the selected Description, across unequal tiers and unavailable sources. Internal/private sentinels must remain absent even if present in supplied metadata.
- Retain operational controls and feedback outside the detail region. Do not broaden these changes into rewriting client screens or removing validation.

Acceptance: AC1–AC5.

### 3. Integrate and review

Dependency: both task 2 slices complete.

- Inspect the integrated diff against the baseline. Confirm production changes remain confined to the shared presentation/CSS unless an evidenced dependency is returned to the primary.
- Review client-safe defaults, explicit internal capability, role/tier changes, no fallback to the other audience's content, and no mutation/financial changes.
- Check that the omitted Brand placeholder is a presentation choice only; source data and Configuration recovery remain unchanged.
- In Mode A, use an independent integrity reviewer. Resolve findings before final verification.

Acceptance: AC1–AC4 and preservation of existing functionality.

### 4. Verify the integrated result and hand off

Dependency: task 3 and all fixes complete.

Run:

```sh
cd frontend
npm test -- src/features/estimates/EstimateLineTierDetails.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/client/ClientQuotationLine.description.test.tsx src/features/client/ClientEstimateTiers.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx
npm run typecheck
npm run build
```

Then run `git diff --check` and `git status --short` from the repository root and compare with the initial baseline.

Use synthetic local data for desktop/mobile browser inspection of both audience states. Verify visible text exactly, no empty gap/header/disclosure, readable long text, no horizontal overflow, accessible associations, and correct keyboard order. Do not restart application services or alter saved user records. Remove only newly generated temporary harnesses/screenshots and report evidence paths.

| Criteria | Verification |
| --- | --- |
| AC1 | Client/default exact-text tests plus quotation, tier-choice, and preview consumers; browser client state. |
| AC2 | Internal exact-list/text tests, no description/headings/placeholders/IDs, missing Brand cases, browser internal state. |
| AC3 | Missing/empty metadata and tier/source/access transitions in shared component and builder tests. |
| AC4 | Existing capability defaults, unequal-source sentinels, no-write/financial assertions, selling-price regressions. |
| AC5 | Rendered accessibility and keyboard checks, desktop/mobile visual checks, typecheck/build, hygiene. |

Backend/OCR and full repository suites are not required for this frontend-only change unless new evidence reveals a cross-boundary defect. There is no lint script. Record exact commands, results, unrun checks, generated outputs, and remaining limitations; do not report unavailable checks as passed.

Mark the task complete only when the approved behavior and checks pass. The final handoff must distinguish local implementation from deployment and confirm no stored-data rewrite was performed.

## Delivery and verification record

### Scope delivered

Only two application files changed:

- `frontend/src/features/estimates/EstimateLineTierDetails.tsx`: exclusive audience branches. Client/default displays exactly the selected description; explicit internal access displays only item names and known nonblank Brand names. Empty content renders nothing. Removed internal description duplication, disclosure headings, substitute Brand text, and empty-state copy. Accessible associations and plain-text escaping remain.
- `frontend/src/features/estimates/estimate-line-tier-details.css`: removed disclosure/header styling and retained a compact wrapping list with no extra header or focus stop.

Six test files were updated: the shared renderer test, `ConfiguredEstimateBuilder.test.tsx`, `ClientQuotationLine.description.test.tsx`, `ClientEstimateTiers.test.tsx`, `KnowledgeMainLineClientPreview.test.tsx`, and `KnowledgeItemWorkspace.clientPreview.test.tsx`. Assertions cover exact text, unequal selected tiers, private-content exclusion, empty/source/access transitions, known/unknown Brands, markup-looking text, keyboard order, and unchanged rates/quantities/mutation calls. The two accompanying documents record the approved scope and evidence.

The user reiterated that nothing outside tier-details presentation should change. No pricing, GST, save logic, APIs, permissions, backend projection/fallback, or other application behavior was modified. Earlier Brand and copy-previous features remain intact.

### Evidence

The initial renderer regression failed on the old extra description, Internal specifications heading, and Brand unavailable placeholder. The independent integrity review found no defect in the integrated result. Existing parent CSS already hides empty detail containers.

| Check | Result |
| --- | --- |
| Exact seven-suite command in task 4 | **134 tests passed across 7 files**, exit 0 |
| `cd frontend && npm run typecheck` | Passed, exit 0 |
| `cd frontend && npm run build` | Passed, exit 0; existing Vite warning for chunks over 500 kB |
| `git diff --check` | Passed |
| `git status --short` | Only expected 8 frontend files (2 application, 6 tests) and 2 documents |
| Frontend diff compared with tested snapshot | Identical before and after final build; passing suites were not rerun unnecessarily |
| Chrome at 1440×1000 and 390×844 | All **12 audience/tier/width combinations passed** exact-text, keyboard, and wrapping checks |
| Empty browser states | No text, child detail element, or reserved height |
| Browser accessibility/errors | Zero axe violations, horizontal overflow, console/page errors, or API requests |

Browser inspection used synthetic local data with the actual renderer and API calls blocked. Client text retained authored line breaks; internal content showed only actual item/Brand text. Screenshots for both audiences and widths were visually inspected. AC1–AC5 are covered by the focused suites and browser matrix; financial/no-write assertions remained passing.

Logs and snapshots: `/private/tmp/lisno-tier-content-initial-{status.txt,targets.diff}`, `renderer-{red,green,typecheck}.log`, `integrated-tests.log`, `tested-frontend.diff`, `browser.{json,log}`, and `final-{typecheck,build,status}.log` under the same `lisno-tier-content-` prefix. The earlier `consumers-red.log` contains a passing focused run because the renderer had already changed; it is not red-regression evidence.

Temporary QA HTML/TSX/browser script and the four generated screenshots in `frontend/output/playwright/` were removed. Builds updated ignored `frontend/dist/` and TypeScript caches under `frontend/node_modules/.tmp/`.

Backend/OCR/full-repository suites and live persistence checks were not run for this presentation-only change. No lint script exists. No application service was started, stopped, or restarted, and no saved data, dependency, migration, seed, commit, push, or deployment was changed/performed.
