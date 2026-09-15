# Recommendations & Exclusions and Quality Parameters — reference redesign

Date: 2026-09-15  
Status: Approved by the user; Approach 1 selected and preservation boundaries confirmed.  
Implementation: Not started. Separate task plan awaits approval.

## 1. Goal and request interpretation

Redesign the **Recommendation & Exclusions** and **Quality Parameter** tabs of the AI Estimator Knowledge item workspace to closely reproduce the composition, information hierarchy, tables, grouping, and interaction affordances in the two user-provided references.

Provide a quick explanation of **Modes**, preserving its current interface and behavior.

Reference files inspected:

- `/Users/apple/Downloads/WhatsApp Image 2026-09-13 at 07.45.57.jpeg` — Recommendations & Exclusions.
- `/Users/apple/Downloads/WhatsApp Image 2026-09-13 at 07.53.56.jpeg` — Quality Parameters.

The images are design references. Their example rows, measurements, rates, item codes, confidence percentages, instructions, and success messages are sample content, not authoritative catalog data or permission to perform estimate mutations, uploads, or external AI calls.

**Approved scope:** Approach 1 — redesign using existing behavior. Reproduce the supported reference composition with the explicit adaptations below. Do not add backend workflows or working-looking placeholders for unsupported features.

**User-confirmed preservation boundary:** do not change Overview, Modes, or the number of tabs. The existing tab strip may be restyled to match the reference. Preserve tab labels, order, identities, navigation and the current regular/temporary item visibility rules.

## 2. Current behavior and evidence

The working tree was clean at the start of investigation (`git status --short` returned no paths). The evidence below comes from current source and inspected reference images. The running local frontend was reachable, but the configuration route redirected to login; authenticated visual baseline inspection has not been completed.

| Area | Verified behavior | Source |
| --- | --- | --- |
| Workspace | Four primary tabs: Overview, Mode, Recommendations, Quality. Temporary items omit Recommendations. | `frontend/src/features/ai-estimator-knowledge/knowledgeWorkspaceSections.ts`; `KnowledgeItemWorkspacePage.tsx:508` |
| Recommendations | A vertical Budget Alterations form, with trigger, required/optional add/remove action, catalog/temporary target, Basket/Sub Basket selection, explanation and enabled state. Existing older recommendations/exclusions remain editable when present. | `KnowledgeBudgetAlterationBuilder.tsx:44`; `KnowledgeSectionEditor.tsx:274`; `knowledgeBudgetAlterations.ts` |
| Recommendation contract | Stable-ID rules use `trigger: added/removed`, `action: add/remove`, `requirement: must/can`. They are conditional guidance; they do not automatically mutate estimate rows. | `backend/src/contracts/ai-estimator-knowledge.ts:268`; `docs/ai-estimator-budget-alterations.md` |
| Suggestions | Curated editorial starters for missing related catalog items. No AI generation endpoint or confidence response was found in the inspected knowledge API/service paths. | `knowledgeRelatedItemSuggestions.ts`; `knowledgeApi.ts`; backend knowledge contracts/services |
| Quality ownership | Quality edits save a shared **Main Basket** checklist, used by every regular and temporary item in that Basket. Basket version checks and immutable checklist revisions protect concurrent saves. | `KnowledgeBasketQualityPanel.tsx:49`; `backend/src/services/ai-estimator-knowledge-basket-quality.ts` |
| Quality UI | Repeated question forms: question, answer type, choices when applicable, acceptance criteria and photo count. All shared checks are required and active. | `KnowledgeSectionEditor.tsx:583`; `KnowledgeQualityInspectionFields.tsx`; `knowledgeQuality.ts:26` |
| Rich quality fields | Stage, instructions, check method, severity, failure action, sampling, and document/video evidence are already representable, but hidden by the simplified editor. | `backend/src/contracts/ai-estimator-knowledge.ts:291`; `knowledgeQuality.ts:12` |
| Missing quality fields | No dedicated hold-point field, checklist settings object, or named-template identity in the current quality contract. | `KnowledgeBasketQuality` in `knowledgeTypes.ts`; backend quality contract and validation |
| Excel | Blank template download, saved checklist download, validated preview/import, preservation of legacy detailed settings. No named-template library. | `KnowledgeBasketQualityPanel.tsx`; `knowledgeQualityWorkbook.ts`; `docs/ai-estimator-quality-checklists.md` |
| Workspace context | Existing right rail contains revision history and a saved configuration summary including Modes. | `KnowledgeItemWorkspacePage.tsx:588`; `knowledgeSavedSummaryTypes.ts` |
| Images and quick info | Item contracts expose identity, hierarchy, description and UOM. They do not expose reference-thumbnail fields or one universal default rate/PMC margin for the pictured sidebar. | `knowledgeTypes.ts:215`; `KnowledgeModePanel.tsx` |

Frontend source names without a directory above refer to `frontend/src/features/ai-estimator-knowledge/`.

## 3. Design reasoning and constraints

### Recommended visual direction

Use a compact configuration workspace: white surfaces, fine separators, restrained corner radii, dark readable text, muted descriptions, and semantic color accents. The references themselves establish the direction; no unrelated cinematic effects, new typography system, or decorative imagery are needed.

- Tables make it possible to compare relationship rules and checks across rows.
- Group headers explain intent before exposing individual rule details.
- Add/edit forms belong in a focused side panel or dialog. The default view stays scannable.
- The right rail provides context relevant to the selected tab.
- Saving remains explicit. A row added to a local draft must not appear as a saved configuration.

### Fidelity boundaries

- Match the reference section order, column order, color roles, alignment, and relative density at desktop widths.
- Keep the existing global application shell and current tabs: four for regular items, three for temporary items. Preserve their labels and order. The seven sample navigation tabs in Image 1 are outside the requested changes.
- Restyle only the tab strip with a clean background, fine baseline, compact spacing, dark selected text and a thin active underline, following Image 1. Preserve keyboard selection, focus visibility, disabled states, the unsaved-changes guard and the existing narrow-screen selector.
- Use real item names and hierarchy, not the pictured gypsum catalog as production content.
- Preserve readable application typography. Do not reproduce the tiny text produced by shrinking a complete desktop interface into the supplied JPEGs.
- Preserve Overview and Modes content, controls, layout, calculations, save behavior and their existing context rail/summary. Scope table, toolbar and context-rail redesign styles to Recommendations and Quality. The tab-strip styling is the only visual exception affecting all tab selections.

## 4. Recommendations & Exclusions — target design

### 4.1 Main area

1. A slim informational banner explaining that the page defines related scope configuration.
2. **Non-Negotiable Additions** with a pale red header, icon, brief explanation and **Add Mandatory Item** action.
3. **Probable Additions** with an amber header and **Add Probable Item** action.
4. **Exclusions** with a blue header and **Add Exclusion** action. Omit “Incompatible” because the saved rules do not encode that relationship.
5. Preserve the existing curated related-item starters in the item-selection flow, styled with the reference's purple suggestion accent where appropriate. Do not add a global AI suggestions panel, generation button or confidence percentages.

Addition table columns, refined by the user's follow-up: number, related item, relationship, action, applicability, status, row actions. Remove Trigger and Removal guidance from every table, including Other scope rules. Keep trigger and scope-action controls in the focused side panel; stored rule data and behavior are unchanged.

Exclusion table columns follow its simpler reference structure: number, related item, relationship, effect, condition, status, row actions.

Each group retains its heading and add action when empty. Use short, specific empty-state copy. A row menu exposes edit, enabled state where supported, and removal from the draft. Do not place a large edit form inside every table row.

### 4.2 Existing-rule mapping and preservation

| Existing rule | Natural display grouping |
| --- | --- |
| Source added; related item must be added | Non-Negotiable Additions; Mandatory |
| Source added; related item can be added | Probable Additions; Probable |
| Source added; related item must/can be removed | Exclusions; retain required/optional meaning |
| Source removed; related item must/can be removed | Removal rules retained under Other scope rules; inspect and edit their trigger in the side panel |
| Source removed; related item must/can be added | Removal-triggered alternative additions; preserve their actual trigger |
| Older text recommendations/exclusions | Clearly identified existing notes; no invented related-item IDs |

The current system supports more combinations than the example screenshot. Every saved rule must remain visible and editable. Rules that cannot be represented faithfully in the three example groups need a compact **Other scope rules** disclosure immediately after them. Do not drop, merge, or reinterpret these rules to fit the illustration.

Stable rule identities must survive edits and grouping. A paired add/remove presentation cannot silently replace two rules with one. Preserve target availability, all catalog pages, temporary-item creation, required explanations, disabled rules, duplicate checks, self-target rejection and conflict handling.

### 4.3 Reference functionality gaps

The existing contract does **not** provide executable conditions, replacement relationship semantics, automatic-add policy or a first-class removal-behaviour field. Consequently:

- `must add` alone is insufficient evidence for the label **Auto add**.
- `removed → must remove` is authored removal guidance; it is not evidence of an automatic cascading estimate mutation.
- A required removal is not automatically an incompatibility relation, and optional removal is not automatically replacement.
- `reason` explains a rule; it must not be reused as a hidden condition program.

For the approved Approach 1, retain the table composition with truthful labels such as **Required addition** and **Required removal**. Condition text may describe only the existing target-present/target-missing rule applicability; there is no condition editor. The user's follow-up removes the Trigger and Removal guidance table columns while preserving the existing editor and stored rules. Never infer a removal dependency from an addition alone. Omit unsupported feature actions. These are the accepted adaptations for existing behavior; no automatic estimate workflow is in scope.

### 4.4 Context rail

The reference rail contains Item Preview, Quick Info and Tips. Reorganize context only for this tab:

- Quick Info reads actual item identity, Main Basket, Sub Basket and saved UOM. Do not show the sample item code, ₹80 rate or 16% margin.
- Omit the reference's Default Rate and PMC Margin rows. They have no single authoritative value in the current item contract, and Modes is outside the change scope.
- **View Full Details** opens existing saved details or navigates through the unsaved-changes guard.
- Omit the image-only preview card and thumbnail cells because the current item contract has no asset source. Lead the rail with actual item identity and description, followed by Quick Info and Tips. Do not invent item imagery or add an upload feature.
- Tips explain supported authoring behavior. Keep revision history and complete saved details reachable through a compact disclosure.
- Omit **Watch Guide** and external **Learn more** links; provide concise supported authoring tips in the rail.

## 5. Quality Parameters — target design

### 5.1 Header and table

Use **Quality Parameters** as the content heading, a short description, and an always-visible scope note: **Shared with all items in [Main Basket]**. Keep the existing tab label unchanged. Use the reference toolbar placement for **Add Parameter**, **Download Excel template**, **Import Excel**, and the conditional **Download Excel** action. Omit AI actions and named-template selection.

Stage filters: **All Stages**, **Material**, **Pre-Installation**, **During Installation**, **Pre-Closure**, **Final Finish**, each with a derived count. Stage already exists as a free-text field. Preserve unknown legacy stages; make them discoverable through additional filters or an explicit Other/Unassigned group, rather than silently assigning them to a canonical stage. Filtering never deletes hidden rows from a save payload.

Table columns: number, parameter, stage, type, acceptance criteria, evidence required, status, actions. Omit the unsupported Hold Point column and image thumbnails.

- Parameter shows the question/title with optional existing instructions underneath.
- Stage uses soft colored badges matching the reference families.
- **Type** distinguishes the response format from inspection method: Yes/No is an answer type; Measurement and Visual Check are methods. A row can carry both. Preserve all supported answer types.
- Evidence summarizes actual required photo count, documents/video when present, and relevant instructions. Preserve hidden legacy settings when another field changes.
- Hold Point is out of scope. Existing `required`, `severity` and free-text `failureAction` must not be used as substitutes.
- Active status reflects the existing shared-checklist policy. Do not introduce an inactive toggle without an explicit change to that policy.
- Row actions provide focused editing, reorder and removal from the draft; preserve current limits and validation.

### 5.2 Parameter editor

A side panel or dialog supports question, instructions, stage, response type, choice options, check method, acceptance criteria, and evidence. Keep photo counts from 1 to 100 when photos are required. Changing answer type must retain the current cleanup of incompatible bounds, options and defaults.

Expose only fields already supported by the quality contract. Preserve existing severity, failure action, sampling, bounds and defaults without adding new checklist-level policy controls.

The table displays saved rows and draft edits accurately. Closing a parameter editor does not silently persist the checklist. Keep **Save shared checklist**, the unsaved navigation guard, accessible validation and saved-version information.

### 5.3 Right rail

Adapt the reference's compact right rail to existing behavior:

1. **Shared checklist** — actual Main Basket, saved checklist version and saved parameter count. Distinguish the saved count from the table's draft/filter counts.
2. **Checklist information** — read-only facts about the current required/active policy, Basket ownership and existing Excel workflow. Keep Excel actions in the toolbar, without duplicate controls.
3. **Configuration status** — saved/unsaved/loading/unavailable states based on actual data. Any green message refers only to saved configuration and defined validation; it does not claim site inspection or approval.
4. Existing history and complete saved details remain accessible in a compact disclosure on this tab only.

Omit AI suggested parameters, named-template identity/selection, policy switches, Block Next Activity, execution-mode applicability controls, checklist-wide Criticality and Inspection Frequency. A blank Excel template is not a selected named quality template. No new template library or settings persistence is in scope.

### 5.4 Shared ownership and compatibility

Keep Main Basket ownership. A user who can update configuration may edit this shared resource from an active item; editing it does not modify that item's immutable active revision. Archived items/baskets remain read-only. Existing item-specific quality history stays accessible.

A saved empty shared checklist remains authoritative. Do not silently fall back to older item parameters. Preserve cross-item query refresh, immutable revision digests, audit events, version conflict protection, Excel import review, and existing populated detailed fields.

## 6. Modes — quick summary, no changes

- **PMC** provides its existing configuration and margin/calculation behavior.
- **Execution** supports **Sub-Vendor** and **In-house**, with independent settings. In-house includes separate labor and material calculations plus its existing total.
- The tab also contains the shared description and specifications. Its primary editable data lives in the `advanced` and `pricing` sections; `mode` itself is a frontend grouping, not a new backend section.
- The workspace already includes a saved Modes summary. Preserve it and its source data.

Confirmed boundary: explain existing Modes and retain its existing summary, interface and calculations. Overview is also unchanged. No `KnowledgeMode*` or `KnowledgeOverview*` implementation changes are proposed. Styling the shared tab strip is explicitly allowed.

## 7. Responsive and accessible behavior

- Wide desktop: tables plus a compact context rail. Avoid nesting a second rail inside the current workspace rail.
- Narrow desktop/tablet: stack the context rail when actual content width becomes insufficient; keep top actions reachable and prevent page-level horizontal overflow.
- Mobile: compact labeled rows with expandable details; keep related item/question, relationship/stage and primary actions visible. If a table scroll region remains, label it and preserve keyboard access.
- Check 1440, 1280, 1024, 768 and 390 CSS-pixel widths, long item names, empty/populated data and 200% text zoom.
- Use semantic tables with proper headers; accessible filter state and count labels; keyboard-operable menus; named icon buttons; dialog focus containment and return; visible focus; status announcements.
- Do not rely on badge color alone. Reuse existing tokens and controls, with scoped styles to prevent changes to Overview or Modes.
- No new animation library, image generation, 3D dependency or font package is justified by these references.

## 8. Data, permission and side-effect constraints

| Capability | Existing boundary to preserve |
| --- | --- |
| Read configuration/history | Backend operation authorization remains authoritative |
| Edit recommendation rules | Configuration update permission, editable draft, allowed item action, current section/aggregate version |
| Create a related catalog/temporary item | Separate configuration-create capability; creation persists independently of the rule draft |
| Edit shared quality | Configuration update permission, non-archived item/Basket, expected Basket version |
| Activate/archive/duplicate revisions | Existing distinct lifecycle/create operations; no implicit action from the new tables |
| Modes/finance | Preserve formulas, units, configuration, version lineage and UI |

For the approved redesign, no schema migration, new endpoint, dependency or lockfile change is expected. Rendering adapters must preserve complete original rows and stable IDs, including legacy values. Use existing service contracts and query keys; do not create alternate persisted sources of truth in browser state.

No production mutation, seed, backfill, migration execution, deployment, commit, push, external message or external AI transmission is authorized by this specification.

## 9. Resolved decisions

The user approved the specification, then explicitly selected **Approach 1** and confirmed: do not touch Overview, Modes or the number of tabs; tab styling may follow the reference.

- Build the requested tab redesign using existing behavior and the adaptations recorded in §§4–5.
- Preserve Overview and Modes content, layout, controls, save behavior, summary and calculations.
- Preserve tab number, labels, order, IDs and regular/temporary visibility; restyle the tab strip only.
- Quality remains shared per Main Basket.
- Do not seed reference catalog content or engineering acceptance values.
- Do not build AI, asset uploads, named-template management, new policy settings, hold points or automatic estimate changes.

No material product or architecture decision remains open for task planning. The separate task-plan and execution-choice gates still apply. Recording this selected option and the explicit preservation boundaries does not reopen the approved specification gate.

## 10. Acceptance criteria

1. **AC1 — Resolved scope:** the selected option and every accepted deviation from the screenshots are recorded before task planning; no ambiguous working-looking controls remain.
2. **AC2 — Recommendation composition:** the three main groups, compact comparison tables, contextual add/edit actions and appropriate rail reproduce the reference hierarchy with real data.
3. **AC3 — Rule integrity:** all existing rule combinations, older notes, temporary targets, disabled rules, IDs and explanations survive display/edit/save/reload. Grouping does not alter rule meaning or create automatic estimate side effects.
4. **AC4 — Quality composition:** the table, stage filters/counts, focused editor and selected rail features reproduce the agreed reference design. Unknown/unassigned stages remain visible and saveable.
5. **AC5 — Quality integrity:** shared ownership, all existing answer types, photo counts, hidden settings, Excel workflows, immutable history, empty-checklist authority and concurrent-save protection remain correct across at least two distinct Baskets.
6. **AC6 — Honest data:** no invented thumbnails, item codes, rates, margins, template identities, AI confidence, hold-point state or completion claims.
7. **AC7 — States and access:** loading, empty, failed refresh, unavailable target, read-only, archived, unsaved, saving, validation and conflict states remain usable with the existing permissions.
8. **AC8 — Protected tabs preserved:** Overview and Modes content, controls, layout, save behavior and existing summaries remain unchanged. Preserve all tab labels, order, identities and regular/temporary counts. Only the shared tab strip receives the approved reference styling. Provide the Modes quick summary in the handoff.
9. **AC9 — Rendered validation:** the agreed desktop composition is checked against both images; mobile/tablet, keyboard operation, focus return, text wrapping and overflow are verified on representative populated and empty data.
10. **AC10 — Verification:** relevant regression tests, frontend typecheck/build and repository hygiene pass. Backend/replica-set checks are required if shared contracts or transactional persistence change. Record exact commands and limits of any unrun checks.

## 11. Risks and verification approach

Principal risks are misrepresenting guidance as automatic behavior, losing removal-triggered rules during grouping, changing a shared Basket checklist as though it were item-local, conflating answer types with inspection methods, fabricating missing reference data, and leaking scoped layout changes into Modes.

Verification should cover row creation/edit/removal, existing mixed-trigger fixtures, duplicate/self-target constraints, catalog pagination and unavailable targets; stage filtering without payload loss; answer-type changes and photo count boundaries; shared-Basket isolation/concurrent saves; Excel preservation; read-only access; and existing Mode behavior. Use current focused tests as the baseline, including `KnowledgeBudgetAlterationBuilder.test.tsx`, `KnowledgeScreens.test.tsx`, `KnowledgeBasketQualityPanel.test.tsx`, `KnowledgeSectionEditor.quality.test.tsx`, `knowledgeQualityWorkbook.test.ts`, and Mode/layout tests. Add meaningful interaction regressions for the agreed new UI.

An authenticated browser baseline and final rendered comparison remain necessary. Investigation reached the local login screen only; no UI correctness, test suite, typecheck or build result is claimed at this specification stage.

This file is the specification only. Dependency-ordered tasks, ownership and parallelism belong in the separate task plan after approval and scope resolution, as required by `AGENTS.md`.
