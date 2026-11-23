# Main Line closure priority

Status: Approved. The user selected parallel implementation of the [approved task plan](../plans/2026-11-23-main-line-closure-priority.md).

## Goal

Under **Configuration → Main Basket → Sub-Basket → Main Line → Basket closure priority**, provide a **Closure priority** radio group with exactly **P1**, **P2**, and **P3**, and let an authorized editor save the selected value and see it after reopening the Main Line.

The user called the tab “Bucket closure priority.” The existing application calls it “Basket closure priority”; retain that navigation label and location.

## Current behavior and evidence

The worktree was clean at the start of this investigation. Relevant target diffs were also empty. Recheck before implementation because the workspace is shared.

| Verified behavior | Source |
| --- | --- |
| Basket closure priority is an existing web workspace tab. | `frontend/src/features/ai-estimator-knowledge/knowledgeWorkspaceSections.ts` |
| The tab renders “No configuration options are available in this section yet,” with no editor, save command, or dirty state. | `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`, `KnowledgeScreens.test.tsx` |
| The workspace selects the saved draft revision when present, otherwise the active revision. Section editing requires an editable draft and existing update authorization. | `KnowledgeItemWorkspacePage.tsx` |
| Existing Main Line priority has four values: Non Negotiable, High, Medium, Low. It is a separate setting and cannot represent this requested three-choice field. | `backend/src/domain/ai-estimator-knowledge-priority.ts` |
| Overview accepts a strict field allowlist. It already stores line-wide settings such as visibility, default display, and mandatory dimensions. | `backend/src/domain/ai-estimator-knowledge-validation.ts` |
| Overview updates rebase only edited fields onto the latest payload. Saves use section and aggregate versions and existing query synchronization. | `shared/knowledge/knowledgeSectionPayload.ts`, `KnowledgeItemWorkspacePage.tsx`, `knowledgeMutationSync.ts` |
| Section persistence validates draft ownership and versions, writes transactionally, and records the established audit event. Revision copying retains section payloads. | `backend/src/services/ai-estimator-knowledge-item.service.ts` |
| Completeness counts four existing workspace groups; Design and closure priority are outside that count. | `shared/knowledge/knowledgeWorkspaceSections.ts`, `backend/src/domain/ai-estimator-knowledge-completeness.ts` |

## Recommended approach and alternatives

**Recommended:** add an optional `closurePriority` field to the revision's existing Overview payload, edited only through the Basket closure priority tab. Navigation tabs need not correspond one-to-one with backend sections, as the existing Mode grouping demonstrates. Reuse the section save/version contract and edited-field rebasing, which preserve history and avoid a new endpoint or collection.

**Alternative:** introduce a dedicated optional closure-priority section. This gives the field its own section version but requires additional section registries, compatibility handling for older revisions, and completeness exclusions for a single scalar. That extra structure is unnecessary for the requested behavior.

Do not overload `priorityId` or store the value solely in browser state. Do not add an independent mutable value to the Main Line document that bypasses revision history.

## Scope and UX requirements

1. Replace the placeholder with one labelled native radio group: **Closure priority**, options **P1**, **P2**, **P3**. Only one can be selected. Include a **Save closure priority** action using existing controls and visual styling.
2. If no value has been saved, show no selected radio and brief text such as **No closure priority selected.** Do not assume P1, P2, or P3. Saving becomes available after selecting a different value. There is no clear/reset action in this request.
3. A successful save persists the chosen value and announces **Closure priority saved.** Changing tabs, reopening the Main Line, or refreshing the browser restores the server value.
4. Changes participate in existing dirty-state, navigation, save/discard/stay, and unload protection. Selecting a different Main Line must not carry the previous line's unsaved value into it.
5. Read-only users, archived lines, and active/history-only revisions can view the saved choice but cannot edit or save. With no revision, show the existing create-draft guidance instead of a writable control.
6. Preserve local selection on a failed save. Show actionable load/save errors and retry controls. A version conflict must offer current-value review before resubmitting; preserve unrelated server fields. Do not claim success for an unconfirmed save response or discard an unresolved write outcome silently.
7. Loading and saving states prevent invalid or duplicate submissions. Successful persistence followed by a failed refresh is reported separately from a failed save. Use existing query synchronization to update the saved Overview envelope and related workspace state.
8. Provide an accessible group name, labelled options, visible keyboard focus, native keyboard selection, and accessible save/error announcements. The radio group and Save action must fit mobile and desktop layouts. No new motion, icons, dependencies, or visual redesign is required.
9. The setting is one value per Main Line revision, independent of mode/tier. Existing temporary items using this same workspace may use the control under the same Overview editing rules.

## Data, API, and state contract

- Store `overview.payload.closurePriority?: "P1" | "P2" | "P3"`. Absence means unselected. Reject null, empty strings, different casing, other strings, numbers, booleans, arrays, and objects on write. Do not introduce a default or backfill.
- Extend Overview runtime validation and its OpenAPI schema. Retain existing section read/update routes, permission operations, envelopes, and storage models.
- Add the field to the shared Overview editable-field contract and the relevant conflict-value presentation. Closure-tab saves change only this field, rebased onto the latest Overview payload. Normal Overview saves preserve it. Preserve the current applicability flag when saving this setting.
- Send both `expectedVersion` and `expectedAggregateVersion`. Keep backend draft validation, transactional persistence, actor identity, stable Main Line/revision IDs, and the existing section-update audit event.
- Read from the selected saved draft, otherwise active revision. An unset value in a draft must not inherit an older active revision's choice.
- New drafts and explicit Main Line duplication carry the source revision's value through existing section copying. Later draft edits do not rewrite active or superseded revisions.
- Selecting or omitting closure priority introduces no new activation blocker and does not add a fifth group to the completeness count. Saving only this field must not make an otherwise empty Overview count as configured; exclude this metadata field from content detection where necessary while preserving existing completeness rules.
- The field does not change the existing priority master, recommendation behavior, prices, margins, estimate rows, or closure execution order. It is saved configuration only in this request.

## Scope exclusions and assumptions

**Included:** web Configuration editor, persistence validation/documentation, shared payload support, save/conflict/cache integration, and focused regression verification.

**Assumptions:** no initial default; explicit Save rather than autosave; editable drafts follow the same lifecycle as other configuration fields; labels are P1/P2/P3 without additional business definitions. These assumptions can be changed during specification approval.

**Non-goals:** automatic basket closing, scheduling/ranking algorithms, project workflow enforcement, finance or Procurement changes, native mobile editor additions, renaming navigation, migrations, seeds, commits, pushes, deployment, or production data changes. Shared payload helpers must remain compatible with native consumers.

## Risks, compatibility, and rollback

- **Shared Overview writes:** both tabs edit the same payload. Edited-field rebasing and version conflicts must prevent either tab from dropping the other's saved values.
- **Unsaved navigation:** the tab currently bypasses save and dirty handling. It must participate fully before the placeholder flag is removed.
- **History/default confusion:** never substitute the existing four-level priority or an older revision when the requested value is absent.
- **Completeness:** adding metadata to an otherwise empty payload can affect content-based status; verify optionality and prevent artificial completion.
- **Compatibility:** old records remain valid with the property absent. Backend validation support must be released before clients send the new field. No release or migration is authorized here.
- **Rollback:** the new UI can be removed while retaining backend acceptance for saved values. Do not revert to validation that rejects already stored payloads without a separate compatibility plan.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required verification |
| --- | --- | --- |
| AC1 | The existing tab displays exactly three mutually exclusive, accessible radios and a Save action; legacy absence shows no selection. | Rendered editor tests, native keyboard interaction, accessible names, and browser inspection at 390 and 1440 px. |
| AC2 | P1, P2, and P3 each save and reload correctly for the intended Main Line; later edits can change the value. | UI save/reopen tests and replica-set-backed section round trips; use two distinct Main Lines with different values to detect leakage. |
| AC3 | Only valid values are accepted, permissions and draft/history rules hold, and no new activation requirement is introduced. | Runtime validation tests, unauthorized/read-only cases, no-revision and archived UI states, existing completeness and lifecycle regressions. |
| AC4 | Closure saves preserve unrelated Overview values; Overview saves preserve closure priority; stale writes do not silently win. | Edited-field rebase tests, conflict display/retry tests, section/aggregate version rejection, and an otherwise empty Overview completeness test. |
| AC5 | Unsaved choices survive failures and are guarded when leaving; save, discard, stay, pending, and retry states work. | Rendered navigation/failure tests, duplicate-submit protection, successful-save/failed-refresh distinction, and unconfirmed-response handling. |
| AC6 | Draft precedence, revision copying, and immutable history retain correct values without a default or migration. | Saved draft versus active tests, duplicate/new-draft persistence checks, absence in a newer draft, and unchanged historical revision assertions. |

Start with focused backend validation/service/OpenAPI and frontend workspace/payload/conflict tests. The existing `backend/tests/ai-estimator-knowledge-item.service.test.ts` uses a Mongo replica set and is suitable for persistence evidence. Broaden to backend and frontend typechecks, test suites, and builds after the focused checks. Check native type compatibility if shared type changes affect it. Run `git diff --check` and inspect the integrated diff and status. There is no repository lint script.

No product tests were run during specification-only investigation. Verification results belong to implementation after the remaining gates.

## Open decisions and approval boundary

No additional question is needed beyond approval of the assumptions and contract above. Per `AGENTS.md`, the next stage after specification approval is a separate task-plan file, then execution-mode selection. This specification does not authorize bypassing those stages.
