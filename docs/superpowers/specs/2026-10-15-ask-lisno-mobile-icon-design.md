# Ask Lisno mobile chatbot launcher

## Goal
Replace the wide Ask Lisno entry card in the native mobile app with a compact floating chatbot icon that opens the existing private assistant.

## Current behavior and evidence
- `mobile/src/features/ask-lisno/AskLisnoWorkspace.tsx` renders `AskLisnoEntry` as a horizontal button with a brand image, title and description. `askLisnoStyles.ts` gives it a bordered, full-width card appearance.
- `mobile/src/features/projects/ProjectsWorkspace.tsx` mounts that entry inside the project list header, so it occupies page space and scrolls away. Projects is the Client home destination.
- The entry already checks Client role and `POST /client/ask-lisno` capability, respects navigation blocking, and supports an optional encoded project ID when opening `/feature/ask-lisno`.
- The web launcher already collapses to an icon at widths of 560px or less in `frontend/src/styles/role-themes.css`.
- Existing mobile Ask Lisno files are untracked work, and ProjectsWorkspace already has uncommitted entry integration. Preserve that implementation and all unrelated changes.

## Scope and assumptions
This is a small native mobile presentation change. “Mobile” is interpreted as the native app because its current entry matches the described wide block. Replace the existing Projects/home entry; do not add a global launcher to unrelated screens. Retain optional project-context support wherever the entry is reused. Keep the More destination and the current conversation screen.

## Requirements and UX
1. Use a single icon-only, circular 56 × 56 logical-pixel button with a recognizable chatbot/speech-bubble glyph. Use existing SVG support and the established olive/cream palette; no dependency, gradient, glass, shadow or looping animation is needed.
2. Anchor the launcher to the lower-right of the Projects viewport, outside the scrolling list, with 16px clearance from the content edges. Respect safe areas and the existing bottom dock. It must stay visible when the list scrolls and must not create a full-width row or an invisible overlay that intercepts list gestures.
3. Remove the inline title/description card. Reserve enough list-end space for the last item and pagination controls to be scrolled clear of the launcher.
4. Tapping opens the existing Ask Lisno route. Preserve the optional stable project ID, current authorization checks, navigation guard, private conversation behavior and Back navigation.
5. Expose one accessible button named “Ask Lisno” with its existing explanatory hint and disabled state. Treat its graphic as decorative. Use a static icon and a simple pressed state.

## Non-goals and data/API impacts
No chat-screen redesign, new modal conversation, backend/API/data changes, permission changes, navigation-dock redesign, desktop-web styling changes, or new dependencies. Existing assistant loading, errors, retries and session isolation remain intact. No migration or external action is required.

## Constraints and risks
- Mounting inside the list would make the icon scroll away; place it as a viewport sibling.
- Avoid dock, safe-area and final-row collisions on narrow screens and landscape layouts.
- Preserve current dirty files and recheck their contents before implementation. Do not refactor unrelated mobile parity work.

## Acceptance and verification
- AC1: Authorized Clients see one floating chatbot icon on Projects/home, with no wide Ask Lisno card or caption.
- AC2: It stays anchored during scrolling; the dock and list actions remain reachable at narrow phone, standard phone and landscape/tablet sizes.
- AC3: Tap opens Ask Lisno; Back returns normally; optional project context remains encoded correctly. Blocked navigation cannot activate it, and unauthorized accounts see no launcher.
- AC4: Assistive technology exposes one correctly named button with an adequate touch target and disabled semantics.
- AC5: Focused Ask Lisno/Projects regressions and mobile typecheck pass. Verify actual rendered placement and tap/Back interaction with synthetic data; run the mobile Android export to catch bundling errors. Report unavailable device checks honestly.

## Open decisions
None required for this bounded change. The native-app assumption and icon placement are explicit above for spec review.
