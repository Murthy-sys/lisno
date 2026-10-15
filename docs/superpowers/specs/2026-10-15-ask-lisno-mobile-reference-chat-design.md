# Ask Lisno mobile conversation reference design

## Goal and authority
Match the mobile conversation screen to the image attached by the user on 2026-10-15: a warm ivory chat canvas, compact branded header, avatar-led assistant bubbles, pale green user bubbles, a compact inline error card, quick-action chips and a bottom composer with a round green send button.

The user explicitly selected disabled file/photo controls with a clear “Not available yet” hint. This is a native mobile conversation redesign. The previously completed floating Projects/home launcher remains the entry point. Specification and separate task plan were approved, followed by Mode A selection. Implementation and verification evidence is recorded in the [task plan](../plans/2026-10-15-ask-lisno-mobile-reference-chat.md).

## Baseline behavior and evidence
- `mobile/src/features/ask-lisno/AskLisnoWorkspace.tsx` places the assistant heading inside the scrolling conversation, renders an unframed welcome block and user questions, and separates red error text from a wide “Retry answer” button.
- `askLisnoStyles.ts` uses the shared olive/Poppins palette, 4px conversation corners and a form-style input with a text send button. The reference uses a lighter canvas, larger rounded bubbles, compact line icons and native-looking sans-serif typography.
- `AskLisnoAnswer.tsx` renders verified narrative, facts, project choices, paged project lists, source labels and approximate selling amounts. These behaviors must survive the visual redesign.
- `useAskLisno.ts` stores temporary turns, preserves failed questions for retry, prevents concurrent requests and clears/revalidates on session, access and visibility transitions. It currently has no per-turn display timestamp or read/delivery receipt.
- `mobile/src/app/feature/[featureId].tsx` wraps Ask Lisno in the ordinary scaffold, which includes the global top bar, a separate Back row and dock/rail. The reference shows a dedicated chat header and composer instead.
- Private `AskLisnoInput` and the backend request schema accept text and project context only. Human Project Messages attachments are a separate, shared conversation flow and cannot be reused to upload private AI files silently.
- The repository already has the gold botanical brand artwork, handwritten SVG icon infrastructure, native safe-area support and keyboard handling. No new dependency is expected.
- Existing Ask Lisno files are untracked work; the route, scaffold and navigation files already contain unrelated changes. Capture their baseline and inspect per-target diffs before implementation.
- A prior live diagnostic confirmed daily Gemini free-tier quota exhaustion. Styling the error state does not restore provider allowance. Keep this redesign independent of billing, model and quota-policy changes.

## Reference interpretation and visual requirements
The attached 780 × 1296 image is the visual source of truth. Use approximately 390 × 648 logical pixels as the primary comparison frame, then adapt to real safe areas and available height. Its explicit shapes, colors and single greeting wave supersede the general styling defaults for this screen only. Do not hardcode the pictured name, message, timestamps or failure.

### Dedicated screen and header
- Fill the safe viewport with warm ivory, approximately `#FAF9F3`, using a flat surface. No added gradients, glass, decorative shadows, floating effects or animation.
- Show one fixed header containing an icon-only Back control, the existing gold botanical Lisno mark, “Ask Lisno” in bold dark green and “Your AI assistant” in muted grey.
- At phone size, target a roughly 56px header, a 28–32px visible brand mark, a 21–22px title and a 12–13px subtitle. Provide at least a 44px Back touch target.
- Hide the ordinary app top bar, duplicate Back row, bottom dock and navigation rail on the Ask Lisno route. Preserve the scaffold/session/navigation guard infrastructure and the established Back policy. Other routes retain their current chrome.
- Reuse native system sans-serif typography within this screen to approach the reference, without replacing the global type system. Keep typography and colors in scoped presentation tokens.

### Conversation
- Use a flexible scrolling transcript between the fixed header and bottom controls. Short exchanges retain the large quiet space shown in the reference; long exchanges scroll naturally without fixed-height message boxes.
- Render the greeting as a left assistant row: roughly 40px circular pale-gold avatar containing the botanical mark, an approximately 8px gap, and a lightly bordered near-ivory bubble with a subtle top-left speech shape.
- Greeting: “Hi {first name}” with the reference's single waving-hand glyph, followed by “Ask about your projects, estimates, materials or timelines. This conversation stays private and is not posted in Project messages.” Derive the name from the active session and allow wrapping.
- Target 15–16px body text with 20–22px line height, 13–14px bubble padding and approximately 14px bubble corners at the reference frame. Adapt rather than clipping at narrow widths or larger text settings.
- Display user messages in right-aligned pale sage bubbles, sized to their content with a bounded maximum width. Use dark text and place time/status together beneath the body inside the bubble.
- Display subsequent assistant results using the same avatar/bubble treatment. Preserve selectable project choices, list paging, source information, all server-provided financial values and the distinction between approximate additions and approved estimates. Complex answers may expand vertically and use the available bubble width.
- Display truthful local timestamps: record the welcome/turn creation time once for the temporary conversation, retain the original question time during retries, and use the response's existing `checkedAt` for verified answer information. Never hardcode sample times.
- The API has no human delivery/read receipts. A success indicator may appear only after a verified response, with semantics such as “Answered.” Pending/failed questions must not show false successful or read confirmations, even though the reference includes double ticks beside its sample question.
- Preserve user scroll position while reviewing older content. Follow new messages when near the bottom or when the user sends; do not force-scroll on every unrelated layout change.

### Error and loading states
- Replace the separate error text and full-width retry button with the reference's single compact pale-red outlined card: circular red exclamation mark, concise title/helper copy and a small trailing “Retry” button.
- Show this card only for real failures; keep it associated with its failed turn. Use existing sanitized failure classification. Keep busy, usage-limit, timeout, verification and access failures distinguishable.
- For quota exhaustion, use truthful “usage limit”/“try again later” wording instead of promising a short recovery. Error layout matches the reference; error content reflects actual state. Do not invent a reset time or silently add automatic retries.
- Retry operates on the same failed turn and preserves the question. Retain current cancellation, access-loss cleanup and in-flight guards.
- Indicate a pending answer within the assistant conversation area with restrained, accessible status text or the existing lightweight indicator. No placeholder answer, fake typing response, or new continuous decorative animation.
- Keep denied, initial access-check, access-check retry, empty conversation and project-list paging failures functional in the new presentation.

### Quick actions and composer
- Pin a horizontal quick-action row immediately above the composer. The first three chips match the reference: “My projects” with a folder, “Project progress” with a bar chart, and “Expected costs” with a calculator. Use existing/custom SVG line icons, dark green ink, light sage surfaces and fine borders.
- Map these to real supported text requests: the existing project-list intent, a project-progress question, and a question about the current project's estimate/costs. Let the backend resolve project ambiguity; never calculate or invent a price in the UI.
- Preserve the existing “Message your team” action as a subsequent horizontally reachable chip when authorized, after the three reference chips. It keeps the existing contextual destination and permission checks. No automatic posting to team chat.
- Use a unified rounded near-ivory composer, approximately 80px minimum height at the reference frame, with a fine neutral border and placeholder “Ask Lisno anything...”. Allow multiline growth to a bounded height.
- Place paperclip and photo controls at the lower left with a thin separator, matching the reference. Both remain visibly disabled, have accessible unavailable labels/state, and expose the user-approved “Not available yet” hint through an accessible explanatory note. No picker, file access, upload or network action occurs.
- Place the paper-plane send icon in a dark green circle at the lower right. Match the approximately 38px visible circle while maintaining a minimum 44px interactive area. Accessible name remains “Send question”; disable for empty, blocked or unavailable states and while a request is active.
- Account for keyboard and safe-area insets so the composer and newest message stay reachable. Keep header and composer stable while the transcript scrolls. The keyboard can dismiss without losing the draft.

## Architecture and options
Recommended: keep the existing native workspace and hook, split visual header/message/error/composer pieces where needed, and apply a route-specific full-screen scaffold presentation. This keeps the authorized private conversation and Back lifecycle intact while matching the image.

Alternative: introduce a separate navigator/modal for the assistant. This would add route and lifecycle complexity without improving the reference match, so it is outside this scope. Attachment support would require a separate private upload/AI contract and is explicitly excluded by the user's chosen option.

Use existing botanical geometry/assets and icon infrastructure. Any shared scaffold change must be opt-in for Ask Lisno and preserve existing default props and unrelated role shells. Do not couple the native screen to frontend browser components or CSS.

## Invariants and compatibility
- Client role and `POST /client/ask-lisno` capability remain mandatory; backend authorization stays authoritative.
- Preserve stable project IDs, project verification, session/environment isolation, late-response rejection, visibility cancellation and temporary private history.
- Maintain one request at a time, retained failed questions, manual retry and project-list version/pagination rules.
- Keep all financial amounts and source facts server-derived. Existing paise conversion and approved-baseline presentation remain unchanged.
- Preserve public API contracts and backend behavior. Display timestamps/status are local presentation state only; no persistence migration is needed.
- Keep the Projects/home floating launcher and More destination. Back from the dedicated chat returns through the established navigation policy, including direct-entry fallback.

## Scope and non-goals
In scope: native Ask Lisno visual components/styles, local presentation metadata, focused route/scaffold integration, accessibility, interaction regressions and rendered reference comparison.

Out of scope: web-chat redesign, Projects-page redesign, backend/provider fixes, billing changes, quota increases, model switching, new attachments, voice input, persistent private conversations, read receipts, human Project Messages redesign, migrations, dependency additions, deployment or production writes.

## Risks and mitigations
- Hidden app chrome can remove Back or safe-area handling: retain the navigation provider/guards and verify header Back, Android system Back and direct entry.
- Keyboard resizing and short landscape screens can crowd the transcript: use flex layout, bounded composer growth and insets rather than screenshot-sized fixed positions.
- Reference metadata can imply unsupported state: use actual times and confirmed result status, with explicit disabled upload controls.
- Rich answers can exceed simple sample bubbles: test long narrative, repeated project names, paginated lists and detailed financial responses.
- Existing dirty shared files carry unrelated work: use narrowly owned edits and compare against captured baselines before final verification.
- Provider quota remains an external limitation: use synthetic responses for deterministic visual QA and report live-provider availability separately.

## Acceptance criteria and verification
- AC1: At the primary reference size, the header, gold logo, avatar/bubbles, warm canvas, error card, first three quick chips and composer closely match the supplied image in hierarchy, spacing, colors and proportions. No global dock/top bar or duplicate Back appears on this route.
- AC2: Welcome, sending, successful answer, failure/retry, access-check failure, denied state, long conversation, project clarification and list paging render correctly without losing current behavior.
- AC3: The active user's first name and real timestamps appear; no fake receipt, price or answer is shown. Retrying keeps the failed question in its existing turn.
- AC4: Send, quick prompts, Retry and Message your team remain functional and correctly gated. File/photo controls are disabled with “Not available yet” hints and perform no external action.
- AC5: Header/system Back, safe areas, keyboard open/closed, draft retention, identity changes, background cancellation and late-response protection work. The floating Projects launcher and unrelated app navigation remain unchanged.
- AC6: Check narrow phone (320px), reference phone (390px), taller phone, landscape and tablet layouts, including larger font scale. All controls have accessible names and at least 44px touch targets; content is readable and status announcements are useful.
- AC7: Focused Ask Lisno API/workspace and affected scaffold/back-policy regressions pass, followed by mobile typecheck and Android export. Run final `git diff --check`. Visually compare synthetic reference-like content and real interactions in the native renderer where available, supplemented by an isolated web-renderer harness if needed. No real client content is retained in screenshots or logs.

## Open decisions
None blocking. File/photo behavior is explicitly settled: disabled with “Not available yet” hints. Reference-specific corners and the greeting glyph are intentional exceptions to general style preferences. Remaining measurements are implementation tuning within the approved visual direction.
