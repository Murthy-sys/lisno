# Complete mobile parity with current web workflows

## Goal and authority
The user explicitly selected **all missing web features**, while preserving the mobile app's theme and adding native UI screens. Standing autonomous implementation and parallel execution authorization applies. Deliver working native workflows against current backend contracts; no placeholder counts as parity. No production changes, seeding, live email, deployment, commits or pushes are authorized.

## Current evidence
- Mobile is React Native/Expo with environment- and identity-scoped transport/query storage and existing olive/cream Poppins UI primitives.
- Mobile authorization still mirrors September28 policy,151 permissions and257 operations; current backend/web use October14 policy,196 permissions and437 protected operations. Native role vocabulary omits Vendor and Program Manager. Session parsing/navigation fail closed against current snapshots.
- Native client estimate decisions omit mandatory immutable review-round identity/version; PDF URLs omit roundId. The display still consumes top-level mutable estimate fields rather than the published snapshot.
- Configuration has four native tabs, no14-question Design editor or Basket closure priority tab. Native vendor classification buttons use the retired direct hierarchy creation flow; proposal requests/review screens are missing.
- Leads have no native staff estimate authoring/publication; initiation has free-text property type, no bedroom count, no stable uncertain-retry command and no navigation into estimate creation.
- Client/staff written estimate requirements, project Design requirements, and project-client invitation flows are absent. Critical Design reminders have no destination. Assigned Procurement/Program Manager cannot navigate to Projects.
- Older broad parity documentation is stale: procurement has only partial expense/items support, and execution, Vendor work, purchase/work-order approval, completion and other advanced financial/management/chat features require current code comparison.

Baseline dirty status/diff/untracked hashes captured in `/tmp/lisno-mobile-parity/`. Existing work must be preserved.

## Scope and acceptance criteria
1. **Identity and navigation:** all current canonical roles/permissions/operations are recognized, with unchanged operation-specific Super Admin denial and environment/session fences. Every implemented web destination has the appropriate native entrypoint.
2. **Configuration:** native Design questionnaire and current web catalogue/vendor workflows, shared Quality and existing editors remain usable; removed Estimation visibility UI is not reintroduced. Closure-priority remains only the same genuine web placeholder, not invented functionality.
3. **Estimation:** native initiation → lead estimate → rooms/dimensions → scope → calculation/save/submit/assignment/publication/retry; dynamic property/bedroom rooms; edit lifecycle, conflict recovery and saved drafts; client requirements and staff resolution; immutable pre/final review and round-bound artifacts/decisions.
4. **Design/projects:** all scoped staff can view assigned projects before approvals; native drawing/design upload, annotation/mapping/review/section actions and workflow forms; Physical Selection/critical/PO/stock requirement actions and canonical deadlines; source/CAS/idempotency and real-client decisions.
5. **Vendor requests:** requester hierarchy-intake Main Basket/Sub Basket + descriptions + Main Line name; My Requests/resubmission; Super Admin configure/review/publish/send back; active hierarchy changes only through existing server workflow.
6. **Procurement/execution/vendor:** sourcing, baskets, tenders, quotes, award/PO/work-order preparation, approvals, issue/revisions/artifacts; vendor access/work/media; program/site monitoring and client/site/project completion, preserving commercial/payment/designer gates.
7. **Finance/management/admin:** existing web financial source/ledger/payment/invoice/document/control/reporting features; team/KPI/audit/deadline/evaluation; user/invitation/access queues and management actions reachable natively.
8. **Chat/notifications:** remaining web conversation/participant/mention/typing/filter/target-media capabilities and safe actionable notification routes; shared provenance, private media and receipt rules.
9. **UI quality:** current olive/cream tokens, Poppins hierarchy and native touch controls; phone/tablet layouts, accessible labels/states, reduced motion, loading/empty/offline/denied/conflict/success, safe back/dirty-form behavior. No webview or generic raw-JSON form substitutes for a user workflow.
10. **Verification:** current evidence-backed parity matrix, focused rendered/action/contract tests per slice, cross-role asymmetric identity/financial fixtures, mobile typecheck and Android bundle export, independent integrity review and integrated verification; visual/native device proof where tooling permits, explicit unverified limits.

## Contract and engineering decisions
Reuse canonical backend APIs and shared pure business models. Add native adapters/presentation rather than duplicate pricing, workflow eligibility, KPI or authorization rules. Backend remains authoritative; do not expand permissions or bypass approval requirements to obtain parity. Source amounts and risk are server values; preserve paise boundaries and frozen client quotation history. Private responses use explicit DTOs, never internal staff payloads for clients.

Every mutating screen preserves stable IDs, version/CAS, audit reason/proof and server idempotency semantics. Unknown outcomes retain the same semantic command for recovery. Invalidate related query families, and purge/hide protected content after scope loss. Email invitations preflight; publication commits separately from delivery. Uploads use the existing authenticated transfer layer with compensation/error behavior.

No migration is planned. Runtime remains environment-configured, with no production/public backend changes. Shared extraction is limited to pure code/types used by both clients and must leave web behavior unchanged.

## UX approach
Extend `mobile/src/ui/tokens.ts`, primitives, compact Knowledge controls, existing adaptive scaffold and feature-specific layout tokens. Use native list/detail, progressive disclosure, sheets and clear primary actions. Long forms group by the web workflow's meaningful steps; phone layouts stack and tablet layouts use established wider panes. Retain current fonts, colors and authentic labels; do not introduce a second theme.

## Risks and decisions
The broad scope spans many modules and pre-existing contract drift; implement dependency-ordered batches with exact ownership and keep uncompleted matrix entries open until verified. Highest risks are stale authorization, mutable client amounts, cross-project/private disclosure, uncertain duplicate writes, amount-unit mismatch and missed alternate approval paths. No single test/build demonstrates full native device certification.

Open product decisions: none required for the first implementation batch. Current working web behavior is the source of truth; unavailable web placeholders/public production signup are not new product requests.
