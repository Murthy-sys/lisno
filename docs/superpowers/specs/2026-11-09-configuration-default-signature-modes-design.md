# Separate default Mode and tier Mode configuration

Date: 2026-11-09
Status: specification and task plan approved; Mode A implementation and verification complete against AC1–AC6. Existing unrelated test failures are documented in the task plan.

## Goal and confirmed requirement

Restore a distinct Signature Mode in Main Line Configuration and provide an independent default Mode alongside the selected Signature, Premium, and Functional modes. The user explicitly confirmed that default Mode and Signature Mode must have **separate saved settings**.

Keep the requested work limited to Configuration mode navigation, independent saved configuration, and the integration needed to preserve existing behavior and data.

## Current behavior and evidence

- The worktree was clean at the start of this request.
- `frontend/src/features/ai-estimator-knowledge/knowledgeWorkspaceSections.ts` defines only `mode`, `premium-mode`, and `functional-mode`. `knowledgeWorkspaceModeTier("mode")` returns `signature`. The navigation therefore has no separate Signature Mode entry, regardless of the Signature checkbox.
- `knowledgeWorkspaceSectionsForTiers` always includes `mode`, while Premium and Functional are conditional on applicable tiers. `KnowledgeFoundation.test.tsx` currently asserts this behavior.
- `KnowledgeItemWorkspacePage.tsx` derives visible tier tabs from **saved Overview**, rather than unsaved checkbox edits. `KnowledgeOverviewPanel.tsx` explains this with “Save Overview to update the Mode tabs.”
- Both the backend domain module `ai-estimator-knowledge-mode-tiers.ts` and frontend `knowledgeModeTierDataSource.ts` treat existing root Advanced/Pricing values as Signature. Premium and Functional have retained namespaces and separate frontend caches. Omitted API scope also means Signature.
- Configuration runtime request validation and public types currently accept only Signature, Premium, and Functional. Adding a second tab pointing to the same data would not meet the confirmed requirement for separate settings.
- The section model uses a validated mixed payload; independent scoped values can be added without moving existing saved fields or adding a database collection.

Read-only baseline checks passed:

- Frontend: `npm test -- src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts --maxWorkers=1` — 16 tests across 2 files.
- Backend: `npm test -- tests/ai-estimator-knowledge-mode-tiers.test.ts` — 6 tests.

These verify the current behavior; they do not verify the proposed change.

## Required UX

1. Keep the default tab labelled **Mode** and always available in Main Line Configuration, including when no applicable tiers are selected.
2. Show **Signature Mode**, **Premium Mode**, and **Functional Mode** as separate tabs for the tiers selected in saved Overview. With all three selected, navigation order is Overview, Mode, Signature Mode, Premium Mode, Functional Mode, followed by the existing remaining sections.
3. Preserve the existing Save Overview boundary. Successful saves update desktop tabs and the mobile Configuration section selector. Failed saves do not change saved tab availability. Unsaved checkbox changes remain local to Overview.
4. The Applicable tiers control retains its three existing tier checkboxes. Default Mode is always available and does not need another applicability checkbox. Clarify its availability in the existing helper text.
5. The newly separated default Mode starts **not configured**. Existing saved root settings remain Signature settings; do not move, clear, or silently copy them into another scope.
6. Each of the four modes owns its Advanced/Pricing editor values, saved configuration summary, margins/defaults display, save feedback, dirty state, and cache scope. Saving one cannot change another's values or show another's settings as a fallback.
7. Preserve existing unsaved-change, validation, version-conflict, retry, permission, and read-only behavior for tab changes and saves. Hiding a selected tier preserves its saved data; re-enabling it restores access to those settings. A hidden clean active tier returns to Overview; unsaved/in-flight work retains the existing guard behavior.
8. Keep desktop and mobile navigation, keyboard order, accessible panel names, save-command labels, and summary headings consistent with the four distinct mode labels.

## Data and API approach

Recommended: retain Signature's existing root storage and compatibility behavior, and add a Configuration-only `default` scope for independently saved default Mode Advanced/Pricing payloads using the established retained-namespace approach, such as `tierConfigurations.default`.

- Define a Configuration scope that includes `default` plus the three existing tiers. Keep the estimation tier enum and Overview `applicableTiers` limited to Signature, Premium, and Functional.
- Use explicit `modeTier=default` on supported Configuration reads/writes and margin/default operations. Omitted scope continues to mean Signature for existing API clients and consumers.
- Extend Configuration contracts, runtime validation, OpenAPI descriptions, projections, namespace-preserving merges, response verification, query keys, and audit/context labels consistently. Other sections must continue to reject unsupported scoped access.
- A default save retains Signature/Premium/Functional payloads and applicability; a Signature or other tier save retains default. Reject nested namespace injection and writes that attempt to replace multiple scopes at once.
- Keep section and aggregate CAS/version checks, actor identity, authorization, transaction semantics, and immutable active/approved history. Four independent value scopes still participate in the existing shared section/aggregate version checks; concurrent stale edits must conflict safely.
- Inspect retained default references for the same validation/reference protections as other saved namespaces. Duplication and revision-copy paths preserve the new values. Do not accidentally include default in loops that enumerate the three estimation tiers.
- Margin reads and any existing apply-default operations invoked within default Mode must use only that scope; use “Not configured” or the existing unavailable state when no default values exist. Do not silently read Signature margins.
- Default is optional for existing records. Merely adding an empty default scope must not introduce a new activation prerequisite or alter historical completeness. Valid configured default values receive the same applicable validation/reference checks as other configuration values.
- Preserve existing legacy-budget restrictions and price-entry behavior in Signature; the new scope uses the supported scoped editor behavior and cannot gain access to Signature-only legacy writes.

Alternative considered: repurpose existing root fields as default and move Signature into a new namespace. This requires migration and reinterpretation of existing API/financial consumers. Retaining existing Signature ownership avoids that unnecessary scope and data risk.

## Scope, constraints, and non-goals

- Applies to normal and temporary Main Lines wherever the current Configuration Mode editor is supported, with existing permissions and draft/read-only rules.
- Existing Signature/Premium/Functional prices, calculations, references, and saved history remain with their existing owners. The latest saved draft, otherwise active revision, remains the source of truth.
- Default Mode is a separate **Configuration** editing scope. This request does not add a fourth tier selector to Sales, Client estimates, Procurement, or PDFs and does not reinterpret their existing tier values.
- Preserve the completed estimation work: hidden default Mode controls in estimation, Main Line tier selection, tier information/comparison, Sales refresh-warning removal, and recommendation-popup completion.
- No unrelated redesign, dependency/lockfile change, seed, backfill, live migration, commit, push, deployment, or customer communication.

## Risks, compatibility, and rollback

Principal risks are cross-scope overwrites/cache leakage, reassigning existing Signature data, stale-save races, default leaking into estimation tier enumeration, incorrect margin ownership, and active/history records becoming editable. Verification must use deliberately unequal values in all four scopes and at least two Main Lines.

No data migration or automatic copying is proposed. Existing records remain valid with a missing default namespace. New default values are written only through an explicit permitted save. Rollback must retain any saved default namespace and a compatible reader/validator; reverting to code that rejects that namespace after values have been saved would not be a safe rollback. No rollback or deployment action is authorized by this specification.

## Acceptance criteria and verification

- **AC1 — Four distinct tabs:** all tiers saved as applicable show Mode, Signature Mode, Premium Mode, and Functional Mode in desktop/mobile navigation. Signature-only and no-tier cases show the correct subset, with Mode always available. Save failures and unsaved Overview edits preserve saved availability.
- **AC2 — Existing data preserved:** existing Signature root settings reopen under Signature Mode unchanged. Newly separated default Mode is empty/not configured, and missing default values never fall back to another tier.
- **AC3 — Independent persistence:** save different Advanced/Pricing settings in all four scopes, reload, and verify exact ownership. Repeat with two unequal Main Lines; update one scope and prove every other scope/line is preserved. Cover retained hidden tiers, revision copies, summaries, and margins/defaults.
- **AC4 — Contract and safety:** runtime/API responses, query identity, mutation envelopes, preserved-namespace validation, authorization, read-only history, CAS conflicts, reference validation, and failure/retry behavior remain correct. Use replica-set integration tests for changed transactional Mongo paths.
- **AC5 — Existing consumers:** omitted scope remains Signature, the financial tier list stays at three, and catalogue/estimate/comparison/Procurement behavior does not change because an independent default Configuration value was saved.
- **AC6 — Interaction and quality:** rendered desktop/mobile, keyboard, panel/save labels, unsaved guards, loading/error states, and cache switching work without overflow or cross-mode content. Run focused frontend/backend regressions, typechecks/builds, and repository hygiene checks; broaden only as warranted by shared-contract impact.

## Open decisions and assumptions

Separate saved settings is confirmed. The remaining assumptions are included for approval: default Mode is always available rather than an optional fourth checkbox; a new default configuration starts empty; tier tab visibility continues to update after Save Overview; estimation tier choices and saved pricing semantics remain unchanged. No additional user information is required to prepare the task plan after specification approval.
