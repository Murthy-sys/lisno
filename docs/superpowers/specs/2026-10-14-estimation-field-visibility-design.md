# Main Line estimation visibility

Status: implemented and verified locally; integrity review cleared. Selected suites have 627 passing tests and 17 confirmed pre-existing failures; both typechecks/builds and rendered desktop/mobile checks passed. User resolved the two open choices on 2026-10-14: one Internal/External setting for the whole Main Line; keep customer quotation prices and totals visible. Standing autonomous instruction waives routine approval pauses; execution uses Mode A.

## Goal and current evidence

Configuration has a new, empty Design tab in each Main Line workspace. Main Line metadata already has transactional, versioned, audited PATCH semantics. Client estimate requirements currently allow Main Basket, room and written requests only. Staff estimation uses a separately authorized catalogue. Client quotation responses already exclude internal costs, vendor rates and margins and expose immutable customer selling amounts.

## Scope and behavior

- Add one `estimationVisibility: internal | external` metadata value to each Main Line. Missing/legacy/new values default to Internal. Temporary items remain unavailable to clients.
- In the Design tab, show a native radio group labelled Estimation visibility, Internal and External choices, an explicit Save visibility action, saved/error/conflict states and existing navigation protection for unsaved changes. Reconcile uncertain write responses against an authoritative read; lock further changes and discard navigation until saved state is known, and block discard during an in-flight save. Only existing authorized Configuration editors can change it. Archived lines cannot be changed.
- Clients may optionally select an External Main Line under the selected Main Basket when entering a written requirement. Basket-only requests continue to work. The server provides only stable IDs, Main Line name and parent labels, never configuration payloads, vendor identity or internal financial data.
- Authorized staff retain both Internal and External Main Lines in estimation and can see which Main Line a client requested. A selected reference is a requirement, not an automatic estimate mutation or price commitment.
- Preserve quotation selling rates, line amounts, GST and totals, PDFs, emails, immutable snapshots and approval history. Visibility controls current selection options, not historical published quotation contents.
- Previously selected lines that become Internal/unavailable are not returned as current client options. Preserve recorded request IDs/text/history; clients can clear or replace an unavailable selection or withdraw. Do not disclose the current Internal line name through historical request projection.

## Contract and invariants

- Main Line aggregate field and existing PATCH `{ expectedVersion, estimationVisibility }`; CAS, transactional audit old/new value and actor identity retained. No new route or role grant. Changes take effect immediately independently of revision activation, like name metadata. Draft/current pricing semantics are unchanged.
- Configuration item/list responses project visibility explicitly, normalizing missing to Internal. Existing clients can omit the new PATCH field without changing it. Duplication must default Internal to avoid unintended publication.
- Requirements detail adds `mainLines: [{ id, mainBasketId, subBasketId, subBasketName, name }]`. Clients receive explicit External non-temporary available lines under valid active parents. Staff receive both visibility classes through their existing authorized service access. Existing staff catalogue is not filtered.
- Requirements create/update add optional nullable `mainLineId`; persistence/history and idempotency digest preserve the stable reference. For omitted/null creation selections, preserve the previous digest shape so pre-upgrade retries remain valid. Missing means basket-only for create and unchanged for update. An older client changing basket without sending mainLineId clears the old selection; an explicitly supplied mismatched selection is rejected. The UI clears selection on basket change.
- Transactionally validate selected line, explicit External visibility, item type, stable basket/subbasket membership and current lifecycle eligibility. Fence Main Line and parent mutations so concurrent withdrawal of visibility cannot permit stale creation/update. Withdrawal remains possible without catalogue validation and preserves stored target/text fields even if a caller supplies mixed edit fields.
- Resolve/included-publication checks require the exact selected catalogue Main Line when a request specifies one, in addition to existing basket/room constraints. Existing basket-only resolution remains compatible.
- Reject unknown pricing/configuration mutation fields. No rate, amount, margin or vendor field is accepted or returned through the new list.
- Invalidate Configuration/item lists, staff catalogue and requirements reads after visibility changes. Backend remains authoritative for stale screens and forged requests.

## Decisions and compatibility

Use aggregate metadata rather than a revision field because visibility is a current access control and must be revocable immediately. Revision-owned visibility would couple revocation to draft/activation and multiply stale-history risks. No live migration or backfill is needed; missing values fail closed to Internal. Old clients continue basket-only requests. New clients should tolerate absent optional response additions during rolling compatibility. No dependencies, production mutation, external email, commit or deployment.

## Acceptance criteria

1. Accessible radios persist and reload whole-line visibility with CAS, audit and proper errors/unsaved navigation.
2. Client options contain only explicitly External eligible Main Lines and safe keys; staff options retain both classes.
3. Client create/update reject Internal, temporary, unavailable, cross-basket and forged selections, including concurrent revocation; history/idempotency/version gates remain correct.
4. Optional selection and written requests work together; basket-only requests, unavailable selection replacement/withdrawal and staff reconciliation still work.
5. Selected-line resolution and publication enforce exact stable lineage; customer quotations and financial values remain unchanged.
6. Relevant tests, typechecks/builds, integrity review and rendered desktop/mobile interaction checks pass, with pre-existing failures distinguished.

## Risks and verification

Use asymmetric line/parent/actor fixtures and assert secret values absent from serialized output. Cover model/schema defaults, invalid values, PATCH CAS/audit, client filtering, transaction races, idempotency compatibility, direct submission and immutable snapshots. Run focused backend replica-set and presentation tests, frontend visibility/requirements regressions, both typechecks/builds and git diff --check. Full-repository/OCR suites are outside this bounded change unless evidence requires them. Preserve the unrelated dirty project-visibility and Configuration-tabs work; initial diff snapshots are in `/tmp/lisno-estimation-visibility/`.
