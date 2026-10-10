# Lisno chat branding and accessible project listing

Date: 2026-10-10 (Asia/Kolkata)
Status: Implemented and verified locally on 2026-10-10

## Goal

Add the existing Lisno logo to Ask Lisno and the Lisno AI identity in Project messages. Let a Client ask “show all projects” in Ask Lisno, see their accessible projects inside the conversation, and select one to continue asking questions. Make these interactions easy to discover without reinstating a project dropdown or redesigning the chat.

This specification covers only these requested improvements. The previous conversational-tone implementation is the starting point and must be preserved.

## Current behavior and evidence

- `frontend/public/lisno-logo.svg` and `lisno-logo-icon.svg` already exist. `components/ui/BrandLogo.tsx` uses the wordmark. No new logo artwork is needed.
- `AskLisnoPanel.tsx` displays a logo only in its empty welcome state. The header and AI answer identity are text-only. `AskLisnoLauncher.tsx` uses a generic bot icon.
- `ChatTimeline.tsx` identifies service-authored replies with the sender name and “AI assistant,” without a Lisno logo. `ChatParticipants.tsx` renders the Lisno AI participant as text only.
- `backend/src/services/ask-lisno.service.ts` already discovers Client-owned projects using `pageProjectsForUserInModule`, scans beyond the first 100 rows, and resolves individual projects. `readAssistantContext` additionally verifies active Client identity, session version, ownership and current chat membership.
- The private response contract supports account, resolved-project and clarification results. It has no project-directory result. Clarification choices are deliberately capped at five, so that field cannot satisfy an all-projects listing.
- `ask-lisno-project-resolution.ts` chooses one project per answer. Account help tells Clients to supply a project name; it does not return the actual accessible project list.
- The popup retains a reauthorized project hint through social turns and checks cached project access before showing a reopened conversation. A new project-list response must participate in that protection.

These observations come from current code. The repository contains substantial uncommitted work, including the prior chat changes; implementation must preserve it and capture a fresh per-target baseline before writers start.

## Scope and assumptions

- “Users’ projects” means the signed-in Client’s currently accessible projects under existing Ask Lisno permissions. Ask Lisno is currently Client-only. This does not expand it to staff or expose another Client’s projects.
- “All projects” means every currently authorized project, regardless of whether a page/previous-chat project hint exists. Include all statuses permitted by the existing project query; do not silently filter to active projects.
- Improve ease of use with an inline project list, a “Show my projects” suggestion, and a clear way to continue with one project. Broader agent capabilities, cross-project financial comparisons and autonomous business actions are outside this request.
- Project messages remain scoped to their current project. Only private Ask Lisno gains project listing.

## Required behavior

### Lisno identity

1. Use the existing Lisno brand artwork in the Ask Lisno launcher/header and beside AI reply identity in the private chat.
2. Show the same brand mark beside Lisno AI replies and its entry in the Project messages participant list. Render it only for the trusted Lisno AI service identity, never by matching a human sender’s display name.
3. Keep “Lisno AI”/AI identification visible. The logo must not imply that replies are authored by a human.
4. Keep the mark compact, correctly proportioned and legible with the existing palette. Reuse existing assets; a compact view of the existing mark may be used where the wordmark would be too wide. Do not add new generic icons or artwork.
5. Preserve message grouping, timestamps, menus, alignment, responsive layout and composer space. Avoid redundant screen-reader announcements when visible text already names Lisno AI. If the image fails, the visible sender/title still identifies it.

### Ask Lisno project listing

1. Recognize direct requests such as “show all projects,” “show my projects,” “list my projects,” “which projects do I have?” and common polite variants. Route them to a dedicated list response instead of asking for a single project name or answering only for the current page.
2. Return a compact, server-backed list inside the conversation, introduced with a short polite sentence. Rows show the current project name and an existing location qualifier when useful for disambiguation. Stable project IDs drive selection; names are display text.
3. Add “Show my projects” to the existing welcome suggestions. No always-visible dropdown, large cards or new navigation screen.
4. Support the complete authorized list with bounded pages of 20 rows and an inline “Show more” control when needed. Do not reuse the five-choice clarification cap or silently truncate later database pages. Continuation uses the original list request and remains within the same answer rather than submitting unrelated project questions.
5. Each row offers a clear “View progress” action. Selecting it submits a new chat turn for that project using its stable ID and the existing authorized single-project answer flow. Subsequent questions such as “When will it finish?” use that selected context. Duplicate project names remain distinguishable.
6. Requesting a list must not itself replace the previous selected project or mix project-specific history. Listing and paging remain account-level context; only an explicit row selection or an otherwise unambiguous project question selects a project.
7. If there are no accessible projects, say so politely and suggest contacting the Lisno team. Do not fabricate names, status, totals or progress. Loading and retry states stay inside the answer; a failure must not masquerade as an empty list.

## Integration and data contract

Use the existing private Ask Lisno API and authorized discovery query. Return typed list metadata as an optional private-response field rather than asking the model to write project names from memory or overloading clarification choices. The list contains only stable ID, current name and optional existing location qualifier, plus bounded continuation metadata. Keep existing response fields and legacy callers compatible.

Accept an optional validated list-continuation parameter on the existing request. Continuation values are pagination hints, never authorization. List intent takes precedence over page/context hints; selecting a list row uses a separate request and explicit project ID. Synchronize runtime validation, backend/frontend types and OpenAPI. The route and its Client-only authorization operation remain unchanged.

Resolve the straightforward listing directly from current server data, keeping the full project roster out of model context and avoiding unnecessary generation latency. Continue using the existing AI integration for project questions after selection. Recognize equivalent list wording conservatively; a request to compare budgets or change all projects is not permission to perform those operations.

Reauthorize the session and every returned project through the existing source-access rules before delivery and on subsequent pages/selection. Do not return a global total, inaccessible names, private contacts, amounts or hidden project data. Stale/revoked access must fail closed or omit the affected rows without suggesting successful access. Preserve existing usage admission and request bounds; do not fabricate model token usage for a direct list result.

Include project-list IDs in the popup’s cached-access checks. Keep cached content hidden while checking on reopen, and clear affected conversation state on permission/session loss as the existing chat does. Do not persist the private conversation or directory in local storage. A changed project set while paging must trigger a refresh/retry or a deduplicated current list, never claim a stale partial list is complete.

No database schema, repository contract, permission expansion, new public route, migration, dependency, model/key setting or business-data write is expected. Existing two-minute automatic Project-message timing, staff suppression, conversational tone, source grounding, pricing and background alerts are unchanged.

## Risks and controls

- Access leakage: authorize list rows server-side, verify current access on delivery/paging/selection, and include list rows in reopened-history checks.
- Incomplete lists: test more than 100 owned projects, beyond the clarification cap and across all displayed pages.
- Wrong project after selection: use stable IDs, test duplicate names and preserve separate account/project history.
- Stale paging: handle membership/project changes explicitly; never duplicate rows or silently hide available later pages.
- Branding regression: only brand the real AI identity; preserve dimensions, accessibility and compact mobile layout.

Rollback removes the optional listing path and logo placements while retaining existing chat behavior. No stored data needs rewriting.

## Acceptance criteria and verification

1. The Lisno mark is visible in the Ask Lisno launcher/header and AI replies, plus Project messages AI replies/participant identity. Human messages remain unchanged. Verify rendered identity conditions, accessible names and image sizing.
2. All supported list phrasings show current accessible projects even when a different page or prior project hint exists. Normal named-project questions and social replies keep their existing behavior.
3. Zero, one, duplicate-name and more-than-100-project cases work. Every accessible project is reachable through bounded inline paging; no five-item cutoff, duplicates or missing later pages.
4. Row selection opens a new progress turn scoped to its stable ID, and the next contextual question uses it. Listing alone does not change the prior selected project.
5. Two asymmetric Client identities, foreign supplied IDs, revoked membership/session and access changes during paging/reopen cannot leak project names, counts or facts. No project message, notification or business mutation is created by listing.
6. Existing Ask Lisno/provider/resolution/source and Project-message presentation regressions pass. Check request validation/OpenAPI compatibility and any affected authorization inventory tests. Run backend/frontend typechecks and builds plus repository diff checks. Use replica-set integration checks if an actual transactional path changes.
7. Inspect the actual rendered popup, project list/paging/selection and branded Project-message identity at desktop and narrow mobile widths, including loading, empty, error, long names and keyboard operation. No clipping, added horizontal scrolling or obstructed composer.

## Open decisions and boundaries

No blocking product question is needed for this scope. The existing Client-only permissions, brand assets and conversation architecture supply the defaults. Specification approval is followed by a separate task plan and execution-mode choice under the repository workflow. No implementation, deployment, commit, production mutation or customer communication is authorized by this specification stage.
