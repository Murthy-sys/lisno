# Ask Lisno reference redesign

Date: 2026-10-11
Status: Approved by the user; implemented and locally verified in Mode A. See the [task plan and verification record](../plans/2026-10-11-ask-lisno-reference-redesign.md).

## Goal

Redesign the private Ask Lisno chat window to closely follow the image supplied in this conversation: a pale sage header, Lisno identity, comfortable rounded conversation bubbles, a compact project answer card, horizontal quick prompts, and an integrated message composer. Preserve the working project-resolution, permission, retry, and conversation behavior.

The supplied image is the visual source of truth for this screen. Its rounded chat surfaces and sage accents are intentional exceptions to the general repository styling preferences. The image's example person, project, dates, and numbers are illustrative content, not application defaults.

## Current behavior and evidence

- `frontend/src/features/estimates/AskLisnoLauncher.tsx` exposes Ask Lisno only to authenticated Clients with `ask_lisno.request`. It mounts one session-scoped panel and supplies an optional route project hint.
- `frontend/src/features/ask-lisno/AskLisnoPanel.tsx` implements a non-modal dialog, in-memory conversation and draft, project disambiguation, project-directory pagination, retries, access revalidation on reopening, cancellation, focus restoration, and mobile visual-viewport handling.
- `askLisno.css` currently uses a 400 × 600 px maximum panel, small square corners, a centered welcome view, stacked suggestions, plain answer content, and a separate composer action row.
- Answers reuse `AssistantAnswerContent` from Project Messages. That renderer preserves narrative, sources, clarification, catalogue matches, missing inputs, and customer-facing price explanations.
- `askLisnoApi.ts` supplies resolved project identity, narrative, typed fact IDs with display strings, and paginated project names/details. It has no upload or feedback operation, project photograph, aggregate progress percentage, item count, or team count.
- Backend verified status facts include `project-status` and `project-stage`. Execution facts can contain vendor-reported progress with an explicit qualification that it is not Client acceptance. This must not become an unqualified overall completion percentage.
- Authenticated user data includes the user's display name. Existing interface typography uses Poppins.
- The worktree was clean at the start of this request. Earlier database-sync work is outside this redesign and remains stopped.

## Scope and recommended approach

Use the existing private chat implementation and APIs, with new presentation components where that keeps the main panel readable. Scope styles to Ask Lisno so Project Messages and the application shell retain their current behavior.

Two real approaches were considered:

1. **Recommended: visual redesign with existing verified data.** Delivers the reference composition without changing backend contracts. Show a project summary card using the returned name, stage, and status. Keep unavailable image/metric slots out of the rendered card.
2. **Expand chat capabilities to reproduce every illustrated detail.** Attachments, recorded ratings, project images, and additional project metrics need separate API, storage, authorization, and data-source decisions. This materially expands a screen redesign and is not included in this specification.

## Visual and interaction requirements

### Window and header

- Desktop: a floating window approximately 460–500 px wide and up to 680–720 px tall, capped by the visible viewport. Retain its lower-right placement and non-modal interaction with the page.
- Use a warm off-white conversation surface, pale sage header, dark ink text, muted blue-grey metadata, pale neutral assistant bubbles, and lightly tinted sage user bubbles. Suggested local token starting points: surface `#fbfcf9`, header `#edf2eb`, assistant bubble `#f1f2f6`, user bubble `#e6efe7`, ink `#14182c`, muted text `#636d82`, action green `#506b53`. Verify contrast during implementation.
- Use approximately 22–26 px outer corners and 18–22 px bubble corners, restrained borders, and no heavy shadow, blur, or animated decoration.
- Reuse `/lisno-chat-mark.svg` in the header and assistant avatars. Add a small decorative botanical motif in the header using a lightweight, locally authored SVG, hidden from assistive technology.
- Title: “Ask Lisno”; subtitle: “Your AI assistant”. A small identity dot may be decorative, but must not claim live provider availability without evidence. Do not label it “Online”.
- Provide accessible minimize, expand/restore, and close controls using simple inline SVG strokes rather than introducing an icon dependency.
- Minimize and close dismiss to the existing launcher while retaining the in-memory conversation/draft, preserving existing cancellation and access-check behavior. Neither clears history. Expand enlarges the same dialog within the viewport; restore returns it to its normal size. Expansion must not open a second session or browser window.

### Conversation

- Replace the centered welcome screen with an assistant welcome bubble and circular Lisno avatar at the start of the conversation. Use “Hi <first name>!” from the current authenticated user, with “Hi there!” when the name is unavailable. Never hardcode Murthy.
- Welcome text introduces supported project, estimate, material, vendor, and timeline questions. Retain it as the initial visible message when conversation begins, without adding it to request history or sending an extra AI request.
- Right-align user bubbles; left-align assistant bubbles with a small avatar gutter. Preserve long content, line breaks, wrapping, and readable spacing.
- Record local submission and response-received times as presentation state. Render semantic time labels in the user's locale. Preserve a user message's original submission time on retry. Existing server `checkedAt` remains the source-check timestamp in details, not a fabricated message-delivery timestamp.
- Pending messages show a compact textual thinking state. Errors remain visible next to the affected turn with a working retry action. A 503 must show failure/retry and retain the user's text.
- Do not add double-read ticks: the API has no read-receipt contract. Do not render inactive thumbs-up/down buttons: feedback persistence is outside this scope.
- Preserve narrative and all existing source disclosures, clarification choices, missing-input explanations, catalogue and pricing output. Styling must not hide financial qualifications or permission-related messages.

### Project response card

- For a resolved project status answer, show a compact inset card in the assistant bubble, with the server-resolved project name and the available `project-stage`/`project-status` facts.
- Use the returned stable project ID for associations and existing authorized navigation. Never join by project label or parse the narrative to invent structured fields.
- Use a restrained Lisno/project graphic where useful. Do not present a stock house photograph as the user's actual project.
- The screenshot's “60%”, “24 items”, date, manager, and “3 team members” are not supported together by this response contract. Do not hardcode them, infer progress from stage names, or convert vendor-reported progress into overall project completion. Show only supported facts, retain original qualifications, and let the card adapt to fewer fields.
- Keep the existing project-directory list, stable-ID “View progress” actions, duplicate-name disambiguation, pagination, changed-list refresh, and empty state. Restyle them to fit the new conversation composition.

### Quick prompts and composer

- Place quick prompts in a single horizontal strip immediately above the composer, visible in empty and active conversation states: “Show my projects”, “Project progress”, “Timeline”, and the existing estimate-addition prompt.
- Use the existing send path and server project resolution. Disable prompts while a request is pending or access is unverified. Do not trigger requests automatically on mount.
- Allow horizontal touch scrolling where prompts do not fit, with a clearly named next-prompts control when there is hidden content. Keep keyboard focus and tab order usable; show no arrow when all prompts fit.
- Use a rounded, integrated composer with a multiline textarea and a circular sage send button with an accessible “Send” name. Preserve Enter-to-send, Shift+Enter newline, IME composition, the 2,000-character limit, draft recovery, and duplicate-send protection.
- Omit the reference paperclip because the private assistant currently accepts text only. Preserve the real “Message your team” link as a quiet secondary action near the composer.

## Responsive behavior and accessibility

- On narrow screens, fit the window within 8–12 px side gutters, safe areas, and the visual viewport. Adapt card metadata and prompt overflow; do not shrink text to fit the desktop arrangement.
- Keep header and composer visible while the conversation scrolls. Respect the virtual keyboard and short landscape viewports. Preserve a minimum 16 px textarea font on mobile.
- Keep the dialog non-modal (`aria-modal=false`), without a backdrop, page scroll lock, or new focus trap. Preserve Escape close, focus return, interaction with underlying page controls, and overlay inert checks.
- Every icon-only button requires an accessible name and visible keyboard focus; target approximately 44 px touch controls. Announce meaningful thinking/error states without repeatedly announcing the entire conversation.
- Use semantic progress only if a future verified numeric contract is separately approved. Decorative graphics stay aria-hidden. Respect reduced motion; no new motion library is needed.
- Verify default and alternate app themes without allowing inherited shell styles to overwrite the intended panel palette or reduce readability.

## Data, API, authorization, and state impacts

- No backend API, provider, schema, database, authentication, or authorization changes are planned. Existing request payloads and history lineage remain compatible.
- Additional frontend-only state is limited to window size, per-turn display timestamps, and prompt-strip affordances. Auth/session changes must clear all user-specific state as today.
- Reopening must revalidate the same project IDs before revealing retained answers. Denied access clears restricted history; temporary verification errors keep it hidden with a retry option.
- Cancellation, stale-response suppression, paginated-list validation, and resolved project identity remain authoritative. Never expose a prior user's greeting, history, card, or draft after an identity change.
- No chat contents are persisted to local storage by this redesign.

## Non-goals and constraints

- No Gemini/provider 503 fix, model change, attachment upload, saved feedback, AI history persistence, backend metrics, or expanded role access.
- No database synchronization, recovery, scheduler change, production mutation, deployment, commit, or push.
- No new dependencies, global theme replacement, replacement logo, or redesign of shared Project Messages.
- Existing limitations remain explicit. The redesign does not imply provider reliability or additional data availability.

## Risks and handling

- The reference is a static mockup with capabilities/data beyond the current contract. Match its composition while using functional controls and verified content as defined above.
- Shared answer CSS and shell selector specificity can affect the result. Scope additions and test both private Ask Lisno and shared answer rendering.
- Expanded sizing, keyboard resizing, and long commercial answers can cause overflow or hide controls. Verify them in rendered browser states.
- Name personalization introduces identity-dependent UI. Derive it from the current auth session and include identity-switch regression coverage.

## Acceptance criteria

1. At desktop and mobile widths the implemented screen visibly follows the supplied reference's header, brand treatment, avatar/bubble layout, sage user messages, prompt strip, and rounded composer.
2. Minimize, expand/restore, close/reopen, keyboard submission, quick prompts, retries, and team navigation work without losing the existing conversation semantics or creating duplicate requests.
3. Project summary cards show only correctly associated, returned project facts. No sample percentages, counts, names, dates, photographs, read receipts, or provider-online claims enter production UI.
4. Existing clarification, catalogue, pricing, directory pagination/refresh, access revalidation, denied-access clearing, cancellation, focus restoration, and identity isolation tests continue to pass.
5. Empty, pending, success, 503/error, verification-error, denied-access, long-answer, long-project-name, and missing-data states remain operable and legible.
6. Browser checks at approximately 375/390, 768, and 1440 px widths, a short landscape viewport, and a keyboard-height viewport show no horizontal page overflow or obscured composer. Include normal and expanded layouts plus keyboard/focus checks.
7. Focused frontend tests, typecheck, production build, relevant shared-renderer regressions, and repository whitespace checks pass. Report exact commands and any unrun checks; no lint claim because no lint script exists.

## Open decisions and approval boundary

No additional question is required before reviewing this specification. The proposed scope is the reference-led visual redesign using current APIs, with unsupported controls and sample-only metrics omitted as specified. Additional chat capabilities require a scoped specification change.

Repository `AGENTS.md` requires specification approval before creating the separate task plan. Implementation follows task-plan approval and a fresh execution-mode choice for this redesign.
