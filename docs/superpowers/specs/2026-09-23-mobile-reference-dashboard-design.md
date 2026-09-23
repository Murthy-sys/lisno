# Mobile reference dashboard

Date: 2026-09-23

## Authority and goal

Implement the latest supplied mobile reference. The user explicitly waived further approval gates and previously chose parallel execution. This reference supersedes earlier icon-only navigation and generic restrictions on rounded cards: it includes labels, rounded cream surfaces, serif headings and a dark sage dock.

## Evidence and scope

The Expo app already has safe-area-aware shared navigation, Poppins/Fraunces fonts, a sage ChromeSurface with reduced-transparency fallback, and an authoritative Super Admin dashboard. Its current compact header, icon-only full-width footer, two-column KPIs and plain heading differ from the reference. Reuse the bundled web interior image and existing SVG navigation icons.

Change the shared authenticated header/dock and Super Admin dashboard presentation. Keep all authorized dashboard sections, real values, financial units, missing-data reasons, refresh/reporting controls and exact-value ledger. No backend, authorization, persistence, native dependency, migration or web changes.

## Requirements and acceptance

1. Dark forest header extends behind the native top safe area; show LISNO/tagline, real identity, initials avatar and notification action. Never synthesize unread counts.
2. Cream main surface has rounded top corners. Interior-photo hero has a readable greeting, editorial Executive dashboard heading and subtitle.
3. Reporting card groups period/date controls above compare/refresh. Keep 48-point targets, selected states, UTC basis and partial-final-day information.
4. Partial coverage banner exposes the actual summary and an action into the verified ledger.
5. Project overview is full width; financial overview has three cards at normal phone width and adapts to narrow widths/large text. Any mini chart uses actual project-created daily buckets, including explicit missing data.
6. Floating dark sage dock shows route icons and labels, selected state and a cream OS bottom inset. Preserve role-specific routes, pending-send guards, non-home Back and immersive chat.
7. Keep accessible names, reduced-transparency behavior, tablet/landscape usability and no overlapping system areas.

## Decisions, risks and compatibility

Use existing native layout/SVG, bundled photo and font assets. No fake device frame, system clock, data or decorative trend. The reference photo is represented by the existing Lisno interior asset; screen height, OS chrome and real account/data can differ. Rounded dashboard tokens are scoped to dashboard; existing controls remain compatible. Older phones and enlarged text may reflow financial cards and reporting controls rather than crop labels. Rollback is limited to these presentation edits while preserving the captured dirty baseline.

## Verification

Focused navigation/dashboard tests, typecheck, Android export, actual native portrait/tablet/large-text inspection and navigation/reporting interactions. Independent integrity review precedes final verification. Known unrelated baseline contract inventory mismatch must be reported separately if still present.

## Implemented refinement

The header/footer lighting uses measured SVG dimensions so native safe-area padding cannot leave a visible tint seam. Normal-width finance cards use a concise version of the generic missing-data sentence; custom failure reasons and full accessible/ledger reasons remain unchanged. Native large text reflows reporting controls and uses bounded single-line fitting for dock labels. See the task plan for completed verification and iOS limitations.
