# Tier description inline editor

Date: 2026-11-16
Status: Implemented and verified in Mode A, including the empty-input clarification

## Goal

Show Description within the selected Signature, Premium or Functional configuration, using one automatically growing textarea with inline Cancel and Save buttons. Preserve the existing screen styling.

## Current behavior and evidence

- `KnowledgeItemWorkspacePage.tsx` renders the configuration mode selector and supplies a tier-scoped data source to `KnowledgeModePanel.tsx`. The common Mode scope is `default`.
- `KnowledgeModeConfigurationBuilder.tsx` places Description above the PMC/Execution settings in every scope.
- `KnowledgeModeDescriptionEditor.tsx` initially displays saved text or “No description added.” with Add/Edit description. Editing opens a four-row textarea, a separate preview, and actions.
- The inline Save currently updates the selected mode's local configuration draft; the existing mode save flow persists it. Pending edits participate in validation and navigation guards.
- These files contain prior description/client-visibility changes. Preserve those changes and the existing empty-text and inclusion/exclusion behavior.

## Requirements and acceptance criteria

1. In the Configuration workspace, show Description immediately below the selected Signature/Premium/Functional controls, before PMC/Execution settings. Hide this editor in the common Mode (`default`) view without deleting its saved description or changing existing fallback rules.
2. Editable tiers show one labelled textarea directly, including when empty. Remove the Add/Edit step and separate description preview from this presentation.
3. The textarea grows and shrinks with multiline text, pasted text, saved text and viewport changes. Use the existing field styles, with no fixed-height clipping or nested text scrollbar.
4. Place compact Cancel and Save controls beside the textarea on wider screens; allow them to wrap directly beneath it on narrow screens. Keep the textarea visible after either action. Unchanged text must not mark the configuration dirty.
5. Cancel and Escape restore the current description before the inline edit. Save validates and applies only this tier's text through the existing draft/save lifecycle. Preserve length limits, error feedback, explicit clearing, pending-edit guards and inclusion/exclusion synchronization. No automatic saving on blur or tier switching.
6. Switching tiers shows that tier's description and never carries another tier's unsaved text. Existing revision and permission restrictions remain authoritative; read-only views provide readable text without enabled editing actions.
7. Preserve fonts, colors, borders, pricing, tier data, client description visibility and existing vendor-proposal behavior. No redesign or new dependencies.

## Scope and impacts

Frontend presentation only: the existing description editor, its configuration placement/props, scoped styles and affected rendered tests. Inspect the workspace and shared vendor-proposal consumer before modifying shared defaults. No backend, API, persistence, migration, financial or approval changes.

## Assumptions, risks and verification

- “Under tier modes” means the three named tier panels, with no description editor in common Mode. Stored common wording and consumer fallback remain intact.
- Inline Save retains its existing draft semantics; this request does not replace the broader configuration save flow.
- Main risks are cross-tier draft leakage, losing pending edits, shared-consumer changes and textarea clipping. Verify tier isolation, Save/Cancel/Escape, empty text, read-only state and existing description synchronization with focused rendered checks.
- Verify real textarea growth and compact actions at desktop and mobile widths, keyboard access and overflow. Run relevant frontend typecheck/build and `git diff --check`; compare changes against the dirty-work baseline before implementation.
- No unresolved product decision is required for this bounded UI approach. The specification and task plan are approved; the user selected Mode A.


## User clarification during implementation

The user explicitly requested an empty text field for entry, including where existing wording had been prefilled. Editable inline tier fields now open blank without changing stored configuration or becoming dirty. Typing and inline Save apply the user’s wording through the existing tier draft/save flow; the field then retains that applied text. Cancel/Escape restore blank before the first inline Save and the applied description afterward. Reopening an editable tier starts a new blank entry. Read-only views and standard shared consumers continue to show saved descriptions. This is a presentation change, not a data reset.
