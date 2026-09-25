# Mobile project initiation modal

## Goal and authority

Tapping Initiate project opens a modal over a blurred Projects screen. The user's standing instruction to proceed autonomously and prior Mode A selection apply to this bounded follow-up.

## Evidence and scope

`ProjectCreateActions.tsx` currently replaces the action with an inline form in the list header. Both admin initiation and Designer creation retain draft fields in their owner component, use operation-specific permissions, and invalidate the current identity's project/dashboard/lead queries. Preserve those contracts and the existing reference header. No backend or data changes.

## Requirements and acceptance criteria

1. Keep the Projects layout and action mounted. Open the existing form in a native modal with real background blur and a cream/forest panel, accessible title and close control.
2. Keep the header/footer accessible while fields scroll, including with keyboard, small screens and enlarged text. Respect safe areas and reduced motion/transparency.
3. Cancel, close, backdrop and Android Back dismiss without submitting; drafts survive dismissal. Prevent dismissal and duplicate submissions while a save is pending. Errors remain visible and retryable.
4. Preserve permissions, assignment endpoints/payloads and scoped invalidation. Reset drafts when environment/session ownership changes.
5. Background navigation cannot be operated or read by accessibility while open; restore trigger focus after dismissal.

## Integration and risks

Add Expo SDK-compatible `expo-blur ~57.0.3`, the only new dependency. Render blur beside a scaffold-wide BlurTargetView in the underlying window, keeping the native modal in its own window. This avoids cross-window blur capture and lets both phone chrome and content blur. Only enable blur while a modal is open; reduced-transparency users receive an opaque themed backdrop. See [Expo BlurView documentation](https://docs.expo.dev/versions/latest/sdk/blur-view/) and the installed module's source for platform requirements.

The native dependency requires a rebuilt Android development binary; JS reload alone is insufficient. Existing sessions must survive installation. Verify actual blur on Android, keyboard scrolling, dismissal, draft preservation and accessibility isolation. iOS native verification depends on available tooling and must not be implied by Android results. No open product decisions, migrations, deployment or project creation during native QA.
