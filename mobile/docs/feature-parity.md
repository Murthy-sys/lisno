# Mobile and web feature parity

Updated: 2026-10-14. Scope: all working web workflows, adapted to native mobile using the existing olive/cream theme, Poppins/Fraunces typography, compact controls and responsive navigation. Current implementation has passed integrated automated verification. Device certification and production deployment are separate.

Specification: [mobile parity design](../../docs/superpowers/specs/2026-10-14-mobile-web-parity-design.md). Execution and exact results: [task plan](../../docs/superpowers/plans/2026-10-14-mobile-web-parity.md).

## Current feature map

| Web workflow | Native implementation | Verification anchors |
| --- | --- | --- |
| Authentication, recovery and invitations | Existing auth/session plus `auth/ProjectInvitationScreen`, project invitation management, safe initiation retry | Session manager, project invitation and creation tests; canonical contract drift |
| Project portfolio/detail | Scoped project list and detail tabs: information, estimates, designs, documents, procurement, execution, finance, team, tasks, activity as authorized | `projects/ProjectStructure.test.tsx`, model, documents, activity and invitation tests |
| Lead pipeline and follow-ups | Lead creation, typed source-driven stage/activity/history and paged/filterable pipeline; unified estimation entry | LeadPipeline and stage/history rendered/API tests pass |
| Staff estimation | `estimate-authoring`: property-based rooms/optional attached spaces, bedroom counts, scopes, current Configuration rates/rules, quantities, review/save/submit, assignment/publication/retry | StaffEstimateWorkspace/model/API/lifecycle and room tests |
| Client requirements and quotations | Main Basket/written requests; staff resolution; immutable published pre/final snapshot, totals and exact review/PDF identity | `estimates` rendered/model/API suites; requirements tests |
| Estimate Design and drawings | `design-plans`: assigned Design task workspace, plan uploads, extraction, crops/manual drawings, room/item mapping, replacement/history, prepared PDF and submission; read-only saved Sales preparation | DesignPreparation, PlanWorkspace, task/API/model suites |
| Client Design review | Touch plan/annotation review, normalized geometry, version-bound drafts, changes/request targeting and resolution, exact artifacts | Client plan/drawing review and annotation suites |
| Project Design workflow | `workflows`: schedule, prerequisites, furniture scope/dimensions/UOMs, site evidence, kickoff/review forms, source-bound Design checklist and initial payment queue | Workflow and requirement rendered/model tests; multipart transport tests |
| Project tasks | Native task updates with ownership/status/progress rules; deadline reason/version; operational queue/history and status display | `tasks`, `operations`; project integration tests |
| Configuration | Existing complete catalog/Overview/modes/pricing/Recommendations/Quality/history/master/vendor editors plus Design questionnaire and closure tab | Knowledge rendered/model/workbook suites; visibility section absent |
| Basket requests | Main Basket/Sub Basket descriptions + Main Line name; requester history/resubmit; Super Admin detailed configuration/comparison/verify/publish/send back | `vendor-requests` and Knowledge request tests |
| Procurement | `procurement`: approved-source items/modes, vendor search/suggestions/access, tender/enquiry/quotes, awards, purchase/work orders, approval/preparation/issue and artifacts | Native flow/API/lineage tests |
| Execution and Vendor work | `execution`, `vendor-work`: assigned work, delivery/progress/issues/site/vendor media and monitoring | Delivery flow/API tests |
| Completion | `completion`: project/site/Client completion with backend prerequisites and proof | Delivery/completion rendered/API tests |
| Finance | `finance`: portfolio/project totals and ledger, direct/other/overhead entries, receipts and invoice/TDS assessment | Finance parity/entry/money tests, asymmetric project fixtures |
| Management and KPI | `management`, `performance`: team/tree/designer metrics, period/task details, evaluations and audit; personal KPI for eligible roles | Management/admin/performance tests |
| Dashboard | Existing executive overview plus module, project and workforce drilldowns, filters/sorts/pagination and stable project links | Dashboard contracts/drilldown suites |
| Users and access | `admin`, `access`: invitations/activation/roles, own/review requests, grants/revoke, Program Manager/worker/Designer assignment | Administration and access regression suites |
| Proxy approval queues | `reviews`: immutable quotation snapshot/PDF, Design attachments, actor/on-behalf provenance/proof, safe decision and email retry | Review queue and decision tests |
| Messages | `messages`: conversation search/filter, replies/mentions/issues, targeted messages, participants/typing, assistant actions, authenticated images/files/audio | Chat rendered/model/API, file, realtime and audio suites |
| Notifications | `notifications`: paged chat/basket/execution inboxes, routing-version acknowledgment, exact message/request/assignment, current critical-task review | Notification inbox/presentation/current-review tests |
| Native foundations | Existing onboarding, profile, secure credentials, environment-scoped cache, authenticated transfers, audio, annotations, XLSX, responsive shell and reduced motion | Platform/core/navigation/onboarding/profile suites |

Paths above are relative to `mobile/src/features` unless noted. APIs remain canonical server operations; mobile does not implement independent finance, risk, deadline or permission rules. Client amounts come only from immutable published snapshots. Unknown mutating outcomes retain their exact submission identity, evidence and recovery path. Distinct response shapes have distinct query keys.

## Native adaptations and boundaries
- Documents use authenticated native download/view/share. Browser-only print UI is replaced by issued-order detail; the vendor order API has no separate printable-artifact endpoint.
- Protected videos use authenticated download and the device's external viewer/share flow; native inline video editing/playback is not introduced.
- Long web forms use compact native sections and selectors. Phone screens stack; wider layouts retain the existing rail/context composition. No embedded web page replaces a native workflow.
- Basket closure priority and Ask Lisno remain the same unavailable web placeholders. Vendor KPI is upstream unrated. Unsupported SSO, public production signup, and terminated-app push notifications are not invented.
- All 18 canonical roles are understood. Entry points are operation-gated; server scope remains authoritative. No production permissions were expanded.

## Verification status
Final integrated checks: **171 suites / 1592 tests passed**, mobile TypeScript check passed, canonical contract check passed (3 tests), and Android Hermes bundle export passed. Independent integrity review resolved all five reported findings. One non-failing React act warning remains in the test log. Existing backend/web dirty work was preserved; no dependencies changed.

Android phone validation passed for synthetic sign-in, role-based navigation, Configuration hierarchy, Design Yes/No and conditional vendor fields, unsaved-change protection and the closure tab. Screenshots and exact limitations are recorded in `/tmp/lisno-mobile-parity/visual-handoff.md`. Remaining native feature flows, tablet/font-scale/TalkBack checks, live API end-to-end certification and iOS packaging were not performed. The synthetic preview was stopped and its temporary environment override and generated runtime logs cleaned up. No deployment was performed.
