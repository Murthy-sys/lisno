# Client estimate main-line visibility

## Goal and confirmed behavior

Configuration → Main Line → Overview adds “Is this main line needed for the client?” with Yes and No radio options. Existing configurations without a saved value behave as Yes. The user confirmed that No hides the line from the client estimate screen only. Sales still sees it, the client PDF/quotation still includes it, and all estimate amounts and approval totals remain unchanged.

## Current behavior and source of truth

Overview persists a revision-owned JSON section with field-specific conflict rebasing. Current internal catalogue consumers choose the latest saved draft, otherwise the active revision. Estimate saves derive configuration metadata on the server. Publication stores an immutable full line snapshot and PDF. Client presentation projects current and pre-approved snapshots and comparison IDs from those publications.

The existing Main Line `estimationVisibility` controls client requirements catalogue selection. It is separate and remains unchanged.

## Contract and invariants

- Add optional boolean `overview.clientVisible`. Missing means true; only boolean input is valid.
- Persist the setting through normal Overview save, discard, optimistic concurrency and conflict review. Include a meaningful saved-summary value.
- Project `clientVisible` from the selected current configuration revision into configured estimate rows. Clients cannot supply an authoritative override in estimate save input.
- Freeze the resolved flag in the complete published review snapshot. Retain all internal lines, identities, ordering, prices and obligations. Historical absent flags remain visible; no migration or retrospective publication rewrite.
- Filter false rows at the server's client screen projection for root line items, published snapshot, pre-approved snapshot and comparison IDs. Keep totals unchanged and support zero displayed rows.
- Client PDF generation, stored PDF downloads, email artifacts, internal Sales, finance, procurement and execution retain the full scope.
- Ask Lisno must validate the complete immutable financial source before emitting only screen-visible line details. Retain exact total reconciliation.
- Existing requirements selection, drawing documents and design workflow remain unchanged. This setting is a screen presentation choice, not confidential-data redaction from client documents.

## UX and authorization

Use the established native radio primitive and Overview styling, without new dependencies. Radios share a labelled group and support keyboard input; saving and read-only states disable changes. Explain that No still includes the amount and PDF/quotation line. Existing Configuration and proposal Overview permissions apply.

## Acceptance criteria

1. Missing/Yes settings show Yes; saving No survives reload and conflict rebasing without changing unrelated Overview fields.
2. Server validation rejects malformed values. Estimate rows take the current saved configuration value, including latest-draft precedence.
3. Sales and full immutable review snapshots keep every line. Client screen payloads omit false lines from all line-detail and comparison paths.
4. Totals, PDF/quotation rows and approval amounts are unchanged. No current configuration edit changes a previous publication.
5. All-hidden screen estimates retain totals and PDF access with an appropriate empty breakdown state.
6. Existing visibility defaults and requirements selection remain compatible.

## Verification and delivery

Focused frontend Overview/conflict/summary tests; backend validation/catalogue/persistence/publication/client projection/assistant tests, including transactional replica-set coverage; frontend and backend compilation/build; rendered radio and client breakdown checks. Apply only reviewed source changes to Lisno after checking original hashes. No dependency additions, production data writes, migration, deployment, commit, push or customer communication.

## Risks and rollback

Failure to propagate the optional flag would expose a line on screen; failure to filter nested snapshots would do likewise. Removing rows from the stored publication would break internal approved scope, so projection is outward-only. Reverting the additive code restores existing screen visibility and leaves totals and documents intact.
