# Main Line Design rules and project readiness

## Goal and authority
Implement the fourteen supplied Yes/No questions in Configuration → Main Line → Design, including their estimate, designer, physical-selection and procurement consequences. The user has authorized autonomous implementation and parallel execution; routine approval gates are waived. No deployment, data migration, customer communication or production mutation is authorized.

## Evidence
Design currently holds the independent Internal/External metadata editor. Configuration uses revision-owned sections and current draft-first resolution. Estimates and published client rounds have stable line IDs and immutable quotation snapshots. No Physical Selection Sheet or final docket entity exists. The existing Design-plan submission is the coherent docket milestone and already has a shared submission gate. Procurement supports direct POs, project requests and basket awards, all requiring coverage. Existing amount-based Designer approval alone is insufficient for the new rule.

## Decisions
- Store rules in a revision-owned optional `design` section; preserve the visibility editor. Legacy missing sections mean all No. Lazily create a section on a draft save; do not backfill active revisions or historical approvals.
- Treat the existing Design-plan submission as docket submission. Add a source-linked Physical Selection Sheet and critical checklist alongside it, rather than a separate workflow stage.
- Explicit `itemNature: standard | custom` avoids treating existing Special pricing or temporary items as Custom. Selecting Custom defaults designer vendor involvement to Yes, which can be explicitly changed.
- User confirmed: stock closure deadline is four calendar days from recorded initial payment; pre-discussion records vendor and notes only, never automatically appoints a vendor.
- Store configurable point-by-point Designer PO checklist entries. Require a nonempty checklist when that rule is enabled. Approval requires every current point and assigned Designer identity.

## Configuration contract
`DesignRules` contains `itemNature`, `answers` with fourteen boolean keys, `details` keyed by the same keys, nullable `discussedVendorId`, and `poApprovalChecklist: {id,text}[]`.

Keys: `vendorPreDiscussed`, `designerPoApproval`, `physicalSampleApproval`, `stockCheck`, `designerVendorSelection`, `installationMethod`, `siteMeasurementVerification`, `tradeCoordination`, `clientFinishApproval`, `shopDrawingApproval`, `mockupPrototype`, `maintenanceAccess`, `substrateFixing`, `dimensionsClearances`.

Yes consequences:
- Pre-discussion: vendor identity plus discussion notes, internal only.
- Designer PO approval: assigned Designer signs off every configured point before PO raising/submission/approval/issue; preparation and enquiries stay available.
- Physical sample, client finish, shop drawing: physical-selection rows, blocking submission until approved or explicitly deferred with a reason to during-project selection. Deferred work remains visible and open. Client finish decisions are made by the actual project Client; no unproved staff impersonation.
- Stock: customer notice “This item is subject to availability at the time of procurement.”; Procurement critical-supply row with fixed four-day payment anchor deadline.
- Vendor involvement: assigned Designer confirmation in project checklist; Custom defaults Yes.
- Installation, measurement, coordination, mock-up, maintenance, substrate, dimensions: critical designer checklist rows, completed with evidence notes before submission. Mock-up remains a critical closure item.
- Maintenance, substrate, dimensions: customer-safe estimate notes from configured details or a clear default notice.

## Source, history and authorization
Current internal work uses the saved draft revision first, otherwise active, joined by stable Main Line ID. Configured manual-price lines receive rules too. Source changes must invalidate applicable completion/signoff without deleting history. Read and mutation source identity must include stable estimate line, Main Line and rule digest. Completed records capture actor, time, notes and checked point IDs. CAS, idempotency and transactional dependency fences apply. Historical submitted/approved rounds retain their recorded readiness evidence. No old approved artifact is rewritten.

Assigned Designer performs internal approvals/checklists and reasoned selection deferral. Actual Client decides finish/specification approval. Assigned Procurement closes stock checks. Assigned project staff may read internal progress; clients see only their relevant selection entries, customer-safe notes and existing quotation prices. Vendor discussion, internal costs, rates and margins are excluded from client projections. Existing commercial/design/payment issuance gates remain authoritative. Super Admin gets only explicitly scoped read/administrative rights, not inferred Designer signoff authority.

## API and UI
Add authenticated project-scoped read and action endpoints under `/projects/:projectId/design-requirements`, synchronized with authorization and OpenAPI. Response provides version/source token, categorized entries, server-derived available actions, blockers, deadline and original evidence. Actions supply expected version, source token, entry ID, action, note, checklist point IDs and idempotency key. The UI renders native labeled Yes/No controls, conditional details, explicit save, conflicts and dirty navigation. Project checklist supports loading/error/empty/read-only states, keyboard use and mobile widths. Existing price presentation and Internal/External behavior stay intact.

## Compatibility and risks
No migration or new dependency is required. Missing legacy rules introduce no blockers. Financial calculation is unchanged. New submissions and POs must fail safely on stale or incomplete current rule sources; issued replay remains idempotent. The highest risks are bypasses across alternate submission/PO paths, transactional races, over-disclosure to clients, and accidentally applying changed configuration to immutable history. Cover these with focused replica-set tests and independent integrity review.

## Acceptance criteria
1. All fourteen persisted native Yes/No choices load/save correctly; Custom default, vendor notes and point IDs survive edits, with existing visibility preserved.
2. Current configuration drives editable estimates; public notes appear in quotations/PDFs and remain frozen after publication.
3. Physical and critical entries are generated deterministically per included stable line; source changes invalidate current evidence without deleting history.
4. Docket submission blocks unresolved required rows; only the three selection types allow reasoned during-project deferral, which remains open work.
5. Client decisions and staff actions are properly project-scoped; client payloads omit internal vendor/checklist/confidential fields.
6. Designer PO signoff is enforced for every effective PO path irrespective of order value; enquiries/preparation remain available, and existing final approval/payment gates remain.
7. Stock critical closure is visible to assigned Procurement, with four-calendar-day deadline from initial payment and auditable closure.
8. Tests cover No/legacy compatibility, stale/CAS/idempotent paths, asymmetric identity denial, immutable history/notes, alternate gates and rendered responsive interactions.

## Open implementation detail
Repository-backed gates must use transaction-bound adapters to the same requirements source used by direct Mongo procurement paths; do not weaken transactions or create a second truth.
