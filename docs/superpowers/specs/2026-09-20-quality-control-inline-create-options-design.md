# Inline creation options for quality controls

## Goal

Place the Super Admin actions for creating a Frequency or Performed-by value inside their corresponding dropdowns, removing the separate buttons beneath the fields.

## Current behavior and evidence

- Frequency and Performed by use native selects.
- Authorized Super Admin users currently see a separate compact add button beneath each select.
- Both buttons already open the correct reusable-value dialog and select a successfully created value.

## Required behavior

- Add `＋ Add frequency…` as the final Frequency dropdown option.
- Add `＋ Add performed by…` as the final Performed by dropdown option.
- Show these options only when the user has catalog-create permission and the form is enabled.
- Selecting an add option opens the existing creation dialog for the correct catalog type.
- The add option is an action, not a saved field value: the previously selected value remains unchanged while the dialog is open or when creation is cancelled.
- A successfully created value remains immediately selected through the existing workflow.
- Remove the separate add buttons and their dedicated pill styling.
- Preserve legacy/unavailable-value handling, validation, focus return, keyboard operation, and native mobile select behavior.

## Scope and non-goals

- Frontend quality-parameter select behavior, scoped styles, and focused tests only.
- No changes to permissions, APIs, persistence, dialog content, catalog rules, or backend behavior.
- No replacement of the native select with a custom dropdown component.

## Assumptions and constraints

- Native select options have limited visual styling; clarity comes from concise labels, a leading plus glyph, and the trailing ellipsis indicating that another dialog opens.
- Existing uncommitted quality-feature work must be preserved.
- Sentinel action values must never enter the checklist payload or validation state.

## Risks

- A sentinel value could accidentally be persisted if change handling is not intercepted before normal field updates.
- Reopening or cancelling the dialog could visually reset the select unless the controlled value continues to use the existing selection.

## Acceptance criteria

1. Authorized Super Admin users see the two add actions as the final options in their respective dropdowns and see no separate add buttons.
2. Selecting either action opens the correct existing dialog without changing or clearing the current field value.
3. Cancelling creation preserves the original selection and returns focus to the related select.
4. Successful creation immediately selects the new reusable value.
5. Users without create permission and disabled forms do not receive either add option.
6. Add-action sentinel values cannot be stored in local form state or submitted payloads.
7. Desktop, mobile, keyboard, and text-zoom layouts have no added overflow or duplicated controls.

## Data, API, and accessibility impact

- Data/API: none.
- Accessibility: retain native select semantics, descriptive option labels, logical focus return, and keyboard activation.

## Open decisions

None. The existing native selects and creation dialog provide a clear implementation path.
