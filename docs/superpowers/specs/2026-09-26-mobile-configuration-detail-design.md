# Mobile Configuration item workspace

## Goal and authority
Improve the opened main-line Configuration screen and all four tabs using the current web implementation. The supplied image shows the current noisy mobile presentation. User authorized autonomous implementation in this session. Preserve the completed basket catalog and header.

## Evidence and scope
`KnowledgeItemWorkspace.tsx` puts a long completeness/finding panel and large save button before scrolling tabs. Editors repeat full-width controls, nested card titles and helper paragraphs. Web uses a compact progress/save strip; Overview manages UOM/surfaces, Mode groups calculation/scope/specifications, Recommendations groups additions/exclusions, and Quality manages a shared basket checklist. Quick summary and revision history remain important and must stay available.

## Acceptance
- Compact back/title/context, a genuine completeness bar and optional expandable checks. Show user-facing field names instead of raw section identifiers. Keep actionable save errors visible.
- Four visible, accessible tabs on a phone: Overview, Mode, Recommendations & Exclusions, Quality Parameters. Temporary items retain the existing three-tab restriction. Active underline only, no extra decorative divider.
- Save/status available in a compact bottom bar. Preserve unsaved guards, busy locks, revision immutability, version conflicts, lifecycle permissions/reasons and deletion confirmation.
- Compact Overview selection and quick-add actions; selected surfaces are readable rows with edit/remove controls.
- Mode keeps mode/source choices, description, scope, rate/quantity, margins, simulations, recovery and specifications; reduce nested chrome and repeated prose.
- Recommendations presents web-aligned addition/exclusion groups and readable rule summaries/editing. Quality retains shared-basket scope, checklist operations, stage/filter, workbook flows, and legacy/recovery content. Reduce unnecessary default prose and borders without deleting fields or behavior.
- Quick summary and Revision history remain clearly labeled expandable sections. Keep complete contents and guarded revision selection.
- Scope density changes to this detail workspace; global UI defaults and catalog rendering remain unchanged. No backend, API, calculation, financial-unit or persistence changes; no new dependencies.

## Verification and constraints
Capture dirty baselines; use focused native tests for all tabs, save/navigation/read-only/error states, and new disclosure/layout behavior. Check TypeScript, Android export, scoped regression suite and rendered phone/tablet states. Native/web adapter rendering is not physical-device verification. Preserve all unrelated work. No commit, push, live deletion, migration or deployment.
