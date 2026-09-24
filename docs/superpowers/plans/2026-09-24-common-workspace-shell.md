# Common workspace shell implementation plan

Date: 2026-09-24
Status: S0–S4 complete with one unrelated test exception documented below. Continued parallel execution preference from the active work.
Specification: [Common workspace shell](../specs/2026-09-24-common-workspace-shell-design.md).

## Dependency-ordered ownership

| Task | Owner and paths | Acceptance / verification |
| --- | --- | --- |
| S0 Inspect and preserve | Primary; task spec/plan and /tmp/lisno-common-shell-qa baselines | Current role, chat, notification and theme behavior traced. Initial dirty status/target diffs preserved. |
| S1 Account/topbar | Frontend agent; new WorkspaceTopbar.tsx, AccountMenu.tsx and AccountMenu.test.tsx only | Real identity/role, existing bell, account disclosure and guarded logout; keyboard/outside/Escape/route-change tests. No search. |
| S1 Sidebar | Sidebar agent; Sidebar.tsx and new SidebarIcon.tsx only | Preserve authorized registry navigation, remove account/role duplicate, retain optional legacy account props only if required by other consumers; no new routes. Root owns all CSS/tests. |
| S1 Integration and styles | Primary; AppShell.tsx, MobileHeader.tsx, new common-shell.css, AppShell.test.tsx and affected router expectations | One topbar/bell/profile, common 1024px drawer breakpoint, pale olive sidebar, matching role-agnostic topbar and messaging height. Existing scoped role content preserved. |
| S2 Independent review | Integrity reviewer after writers complete | Authorization/nav parity, notification providers/state, account focus/logout races, responsive/chat invariants and scoped CSS. |
| S3 Final verification | Verification runner after S2; primary for browser | Focused relevant tests, frontend typecheck/build, diff check; rendered width/role/state matrix. |
| S4 Handoff | Primary | Record exact checks, scope, artifacts and limitations; stop temporary server/browser. |

Parallel slices have no file overlap. Writers preserve unrelated work and return contract questions to primary. Only one parent implementation task is in progress.

## Fixed component contract

- WorkspaceTopbar props: user: PublicUser; onLogout: () => void | Promise<void>; leading?: ReactNode; compact?: boolean. Root provides responsive navigation in leading. Topbar renders one NotificationBell and AccountMenu. Class workspace-topbar (compact modifier if useful); account classes workspace-account*. Agent supplies no CSS; primary owns common-shell.css.
- AccountMenu props user/onLogout. Trigger accessible name is user.name for existing tests. Use actual ROLE_LABELS. Simple disclosure with aria-expanded/aria-controls; avoid menu roles unless full menu keyboard behavior is implemented. Email/role and Sign out only. Trigger title may describe account. Closed menu absent from DOM.
- Sidebar keeps user, authorization, onNavigate and navigationLabel. Remove sidebar account UI after extracting it; compatibility onLogout prop may remain for chat callers but does not render duplicate account. Local SVG icon mapping may use exact existing destination strings without duplicating permission rules. No Lucide additions. Root owns desktop/mobile CSS and optional decoration.
- Existing NotificationProvider, API and unread state remain authoritative. No backend changes. Chat class remains project-messaging-app; its inner layout/palette remains isolated from role content styling.

## Verification

Focused frontend: `npm test -- src/components/layout src/features/notifications/NotificationProvider.test.tsx src/features/messages/ProjectChatLayout.test.tsx src/app/router.test.tsx` (adjust only when inspection demonstrates another directly affected test). Then `npm run typecheck` and `npm run build`. Root `git diff --check` and final scope inspection against snapshots.

Rendered QA: actual AppShell with synthetic data for Super Admin procurement, Designer, Client and chat; 1920/1440/1024/768/390px representative matrix. Sidebar active/scroll, menu keyboard/Escape/outside/focus, notifications/real counts fixture, drawer close/focus, long profile name, one main/bell/profile, no search, no overflow. Inspect actual screenshots and axe results. No full unrelated backend/OCR/mobile tests or nonexistent lint script. No commit/deploy/migration/production changes.

## Integrated outcome and evidence

- Shared `WorkspaceTopbar` and `AccountMenu` now own the existing notification bell and real account identity/sign-out. `AppShell`, `MobileHeader`, `Sidebar`, `SidebarIcon` and scoped `common-shell.css` provide common pale olive chrome without changing permissions or adding search. Existing vendor table/action refinements are preserved.
- Independent integrity review closed all findings. Header/banner stacking and safe-area height are consistent; mobile navigation uses the existing `OverlayPortal` so the drawer covers the Client assistant launcher and retains focus isolation.
- Final focused command above: **239 passed, 1 failed across 7 files**. The only failure is the existing `router.test.tsx` test “marks interactive signup focus after a failed attempt is retried”, which expects an Address field at line 1182. The current untouched signup form has no Address field, and its own tests assert absence. This unrelated auth expectation was left intact; the whole focused command is not green.
- `npm run typecheck`: passed. `npm run build`: passed, with the existing chunk-size warning. `git diff --check`: passed. No lint script exists; unrelated backend, mobile and OCR suites were not run for this web-only change.
- Browser matrix: Super Admin at 1920/1440/1024/390px, Designer at 1440/768px, Client at 1440/390px, messaging list at 1440/390px. One bell, profile and main; no global search; no document overflow or unexpected fixture requests/render errors. Shared-shell and drawer axe scans reported zero violations. Keyboard/outside/Escape/focus restoration passed.
- Additional checks: notification banner under account and drawer; simulated 47px safe area yields 111px mobile header with controls inside it; Client drawer backdrop covers the assistant launcher; selected conversation at 1440/390px keeps its composer at the 900px viewport bottom. Screenshots visually inspected. Synthetic local data only; no live backend mutation.
- Evidence and temporary browser/test artifacts: `/tmp/lisno-common-shell-qa/`, including `final-focused.log`, `final-typecheck.log`, `final-build.log`, `final-diff-check.log` and screenshots. Task browser/server are closed at handoff; temporary harness moved out of the repository. No dependencies, API/data changes, commits, deployment or migrations.
