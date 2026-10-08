# Simple vendor invitations and ranked bid responses

Revised 2026-10-06 after the user's correction. This replaces the earlier requirement to complete BOQ fields before sending.

## Goal

In Procurement → Projects → Main Basket, show progress, vendor search, active vendor checkboxes, and one Send bid invitations action. Send private BOQ links by email and provide a WhatsApp invitation path. Each vendor sees Lisno's approved pre-GST quoted line amount and quantity read-only, enters its own unit rate and GST, and submits. Procurement sees responses, average pre-GST bid, KPI, and a priority list with one star on the top eligible recommendation.

## Current behavior and evidence

- ProcurementBasketEnquiry.tsx opens Complete BOQ details on Send when scope, date, or delivery location is missing. New lines always have blank scope; the approved estimate and Configuration have no authoritative supply/execution choice. The BOQ schema and model currently require all three fields.
- Approved included basket lines already supply description, quantity, UOM, and approved estimate amount. VendorBoqPublicPage.tsx already accepts a vendor unit rate and GST against fixed lines. The backend has expiring vendor-specific email invitations and complete bid submission.
- Scope, target date, and location flow from BOQ lines to issued work orders. They are needed before award approval and issue, but are not needed to collect comparable rates against fixed items and quantities.
- Existing WhatsApp code prepares a wa.me work-order message for a person to send and records not_sent. There is no configured WhatsApp Business sender or delivery callback. Bid invitations currently send email only.
- Eligibility requires active status, rated official KPI, basket match, and contact email. Archived or unrated vendors remain unavailable. City is a discovery filter, not an eligibility rule. Comparison has a deterministic KPI/price recommendation but no average bid value or ranked rows.

## Required behavior

1. **Simple screen.** Show progress first, then one search field, eligible vendor checkbox rows, selected count, and Send bid invitations. Support multi-selection across search/pages. Remove the persistent BOQ review, Complete BOQ details form, scope dropdown, city filter, budget paragraph, and lengthy guidance from this enquiry view. Show concise invitation and response status per vendor. Keep award and history accessible.
2. **One action from approved lines.** On Send, the backend builds the BOQ from all included approved main lines: stable source ID, approved description, quantity, UOM, and approved estimate pre-GST line amount. The frontend cannot omit or change an approved line or invent a scope. No additional per-line entry or second Send click is required. Preserve readiness, authorization, active-vendor, source-digest, and email preflight checks; show an accurate blocker when a source or delivery prerequisite is genuinely missing. A saved draft with failed delivery remains retryable without duplication or false sent status. A sent revision stays frozen; source changes require explicit revision/resend.
3. **Vendor view.** The vendor-specific link shows fixed item, quantity/UOM, and Our quoted amount (before GST) read-only. The vendor enters its own unit rate and GST for every line and submits once per revision. The server computes totals in integer paise. Never expose internal Configuration/project base cost, margin, other vendors, KPI, or project budget.
4. **Email and WhatsApp.** Dispatch email through the existing preflighted mailer. Provide each vendor a private ready-to-send WhatsApp invitation with the same secure BOQ destination and minimal context. Procurement opens/sends it in WhatsApp. Label it Ready to send until delivery is externally confirmed; never say Sent merely because a share link was generated or opened. If a vendor has no usable phone, email remains available and WhatsApp says Unavailable. Do not store or log raw public access tokens or invalidate the email link when preparing WhatsApp. Automatic WhatsApp Business delivery remains an open choice below.
5. **Responses and priority.** Show current-revision responses with each submitted unit rate, pre-GST total, official KPI, and deterministic rank. Show the arithmetic average pre-GST total of all latest complete current-revision bids, computed on the backend in paise and rounded to the nearest paise. Reuse the established equal KPI/price score and tie-breaks. Star and label only the top eligible recommendation. Invalid or ineligible bids may remain visible but receive no rank/star. Keep GST/line totals and history in details; refresh after submissions and on explicit Refresh bids.
6. **Work-order terms at award.** A new bid BOQ does not require or display scope type, target date, or delivery location. Old saved/sent revisions with those fields remain readable. Collect missing terms per awarded line in the award proposal before approval. Include them in its immutable digest/revision and approval view. The issued order uses the approved terms. Never default scope to execution or add terms after approval. A material vendor-facing scope change after bids requires a new BOQ revision and rebid.

## Data, API, and workflow constraints

- Preserve project-scoped Procurement authorization, vendor-scoped public tokens, expiry, revocation, idempotency, vendor revalidation, and the rule that disabled/unavailable mail creates no invitation, token, audit, or email write. No live messages are sent during development or verification.
- Make scope/date/location optional on pre-award BOQ input, storage, and public DTO for new revisions; omit absent values in the vendor view. Retain values on historical revisions. Require explicit terms on approved award proposals and issued orders. Freeze approved quote and quantity in sent revisions; an old revision lacking that snapshot displays Quoted amount unavailable instead of joining to a newer estimate.
- Derive or strictly validate the complete included-line set, description, quantity, UOM, and approved quote against the approved basket on the server. Keep Configuration/project-only base cost distinct from the approved customer quote. Recheck current source/readiness before dispatch; sent revisions are immutable.
- Channel-specific access must not revoke a working email link. Keep raw tokens out of persistent records, audit events, logs, list responses, and other vendors' views. Manual WhatsApp sharing must be reported truthfully.
- Extend comparison with averageBidNetPaise: number | null and server priority rank; update frontend types/OpenAPI and invalidate affected queries. Null average means no complete current-revision bid. Preserve unrelated dirty worktree changes and untracked tender files. No seed, production migration, live send, deployment, commit, or push is authorized.

## Risks and controls

| Risk | Control |
| --- | --- |
| Internal pricing leaks to vendors | Public payload contains approved customer quote, quantity, and only the recipient's response; test with unequal internal and approved amounts. |
| Client alters approved BOQ | Server derives or strictly matches every included line and freezes the sent revision. |
| Work-order terms are deferred too far | Award proposal requires explicit per-line terms before immutable approval; issue uses those terms. |
| WhatsApp is labeled sent without delivery | Show Ready to send or Unavailable and audit not_sent until a real delivery confirmation exists. |
| Preparing WhatsApp invalidates email | Both channel links for a vendor/revision stay valid. |
| Failed email creates false sent state | Preserve mail preflight, retry, delivery status, and idempotency. |
| Average or star misleads Procurement | Server calculates across all latest complete current-revision bids; one eligible top recommendation gets the star. |

## Acceptance criteria

1. Desktop and mobile enquiry views show progress, search, eligible vendor checkboxes, selected count, and Send, with no BOQ details/scope/date/location form. Keyboard selection and send work.
2. One Send click creates and dispatches private email invitations to multiple active, basket-matched vendors from every included approved line, without another data-entry step. Archived/unrated vendors remain unavailable; genuine blockers and delivery failures remain actionable.
3. Each vendor sees fixed approved description, quantity/UOM, and pre-GST quote, enters its unit rate/GST, and submits a complete bid. Token isolation, expiry, server money math, and revision immutability are verified.
4. Procurement can prepare/open a vendor-specific WhatsApp invitation for each vendor with a usable phone; UI/audit do not claim delivery. Email remains valid; no phone produces an accurate unavailable state.
5. Procurement sees latest current-revision rates, bid total, official KPI, average, rank, and one accessible top star. Earlier revisions and partial/ineligible bids do not distort average/rank.
6. An award cannot be proposed, approved, or issued without explicit scope, target date, and location for every awarded line. Approval captures the terms; issued order matches them. Historical BOQs and orders remain readable.
7. Focused backend and rendered frontend checks cover send/retry, public quote, WhatsApp state, bids/average/rank, award validation, and token isolation. Run affected typechecks/builds, desktop/mobile interaction checks, and git diff --check after implementation.

## Open decision

The evidence-backed WhatsApp implementation is a ready-to-send message because this repository has no WhatsApp Business sender. If Lisno must send WhatsApp automatically, a provider, credentials, template approval, delivery status, and failure handling must be specified before implementation. Email dispatch and the BOQ flow are independent of that choice.
