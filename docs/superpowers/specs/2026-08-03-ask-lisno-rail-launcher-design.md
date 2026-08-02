# Ask Lisno Right-Rail Launcher Design

## Goal

Move the Ask Lisno placeholder out of the Full Design card and present it as an independent AI-chat launcher at the bottom of the client page's right rail.

## Layout

- The Full Design card contains only its heading, total page count, and ordered design-page controls.
- Ask Lisno is a sibling of the Full Design card in a right-rail container, not a child of the card or its page drawer.
- On desktop, the right rail remains sticky and uses the available viewport height. The design card occupies the upper portion; the Ask Lisno launcher is aligned to the rail's bottom edge.
- The page list must remain fully reachable when it is taller than the available viewport. Scrolling the document must not conceal later uploaded pages behind the launcher.
- On narrow screens, the rail returns to normal document flow. The launcher remains a separate compact element after the Full Design drawer.

## Launcher

- Use the project's existing icon library for a bot/chat icon.
- Show the visible label `Ask Lisno` and a small `Coming soon` status.
- Render it as a button-shaped launcher with an accessible name of `Ask Lisno`.
- Keep it disabled until the chat agent is implemented; it must not expose a non-functional input field.

## Component Boundary

- `ClientFullPlanNav` continues to own only Full Design navigation.
- A small `AskLisnoLauncher` component owns the placeholder launcher.
- The parent estimate review layout renders both components inside a dedicated right-rail wrapper.
- No API, persistence, or chat behavior changes are included.

## Verification

- A component test proves Ask Lisno is no longer inside `ClientFullPlanNav`.
- A layout test proves the parent right rail renders the launcher as a sibling of the Full Design card.
- CSS regression assertions cover desktop bottom alignment and narrow-screen normal flow.
- Run the complete frontend test, typecheck, and production-build suites.
- Visual QA must confirm that all plan pages remain reachable and the launcher does not overlap page cards.
