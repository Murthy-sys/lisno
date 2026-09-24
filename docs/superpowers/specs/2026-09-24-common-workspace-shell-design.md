# Common workspace sidebar and top bar

Date: 2026-09-24
Status: Implemented and reviewed. Rendered checks and build/typecheck passed; focused test suite has one existing signup Address assertion failure, documented in the task plan. Search explicitly excluded by latest correction.

## Goal and evidence

Match the supplied screenshot's shared shell: pale warm olive sidebar, dark olive active navigation, quiet top bar with real notification bell and signed-in profile at right. Use existing logo and artwork. Keep content screens and the completed vendor directory unchanged.

Current AppShell owns providers, sidebar/mobile navigation, a main landmark and separate desktop/mobile/chat bell locations. Sidebar currently owns name/initials, role/email and Sign out. navigationForAuthorization derives links from the canonical registry and permissions. There is no existing web profile/settings route. NotificationProvider already isolates sessions, checks chat.read, derives unread totals and reads before navigating. Chat intentionally has an independent sidebar-free full-viewport shell, verified by its layout tests.

## Scope and requirements

1. Use one shared topbar component across authenticated web workspaces and chat. Show the existing notification bell and live user name/role/initials/profile disclosure. Profile exposes current account information and existing Sign out, with duplicate-submit protection and error handling. Do not invent profile/settings routes.
2. Use the common sidebar component on all regular workspaces and in responsive navigation drawers. Retain registry-derived destinations and operation visibility. No new fake screenshot links, permission or backend changes.
3. Pale olive/cream rail, restrained olive active link, dark readable text, existing logo, small interior decoration below navigation when space permits. Remove redundant sidebar account area and trailing link arrows. Keep real navigation scrollable above decoration.
4. Responsive shared topbar: desktop profile name/role; narrow phone compact avatar; all controls at least 44px. One bell/profile surface, navigation drawer closes on route selection and restores focus. Shared collapse at 1024px. Preserve one main and skip link, safe areas, keyboard and reduced motion.
5. Messaging shares the same topbar while keeping its dedicated viewport, scroll and existing navigation experience. No permanent desktop sidebar added to chat.
6. Exclude global search entirely, including placeholders/disabled controls. Vendor KPI, icon chips, form and table remain as implemented.
7. Keep old role dashboards, content tokens, contextual drawers and unrelated dirty work intact. Add a scoped common-shell stylesheet with sufficient specificity rather than rewriting existing global/role themes.

## State, data and compatibility

Use PublicUser, ROLE_LABELS, navigationForAuthorization and existing notification provider/bell. No API, database, cache contract, migration, permission expansion or external mutation. Account closes on outside click, Escape or route change; keyboard access and focus return work. Logout failure remains actionable without an unhandled rejection. Notification empty/error/offline/read/navigation flows remain owned by the existing implementation. Decorative images have empty alternative text.

## Risks and acceptance

- AC1: Screenshot-like shared sidebar/topbar on Super Admin, Designer and Client/worker samples; no search UI.
- AC2: Authorized navigation is unchanged; current links remain active; no invented routes or role leakage.
- AC3: Real profile identity, keyboard menu, guarded logout and notification unread/inbox behavior work on desktop/mobile and chat.
- AC4: Layout at 1920/1440/1024/768/390px has no page overflow, hidden controls, duplicate bells or overlapping menus. Chat retains usable viewport/scroll/composer.
- AC5: Focused shell/navigation/router/notification/chat tests, frontend typecheck/build and diff check pass. No new dependency. Scope-matched rendered QA includes accessibility scan and long names.

Main risks are role-theme CSS overriding shell colors, overlapping responsive bell instances, moving sign-out without focus/state protection, and reducing chat's scrollable area. The component boundary and visual matrix address these. No product decision remains unresolved after excluding search.
