# Vendor work updates

Photo-policy update: the later [Required work photos](2026-11-16-required-work-photos-design.md) specification supersedes all exemption behavior below. Photo exemptions are disabled and current-round completion photos are mandatory.


User requests four clear vendor updates: Started working, In progress with photos, On hold with reason, and Completed. Existing report form separately asks for action/status/progress and leaves a started note at not_started. Existing completion requires a separate 100% report then submission.

Extend the existing report command with optional updateType (started, progress, hold, completed), keeping legacy commands compatible. Started records in_progress at zero without inventing completed quantity. Progress requires current-round photos; hold records blocked at existing progress with a reason and does not grant staff hold/exemption powers. Completion retains the existing current-round Project Manager evidence exemption; progress still requires photos. Completion atomically records 100% and creates the Project Manager verification submission. PM verification and Client acceptance stay separate. CAS, idempotency, exact assignment/vendor/round evidence and immutable issued scope remain authoritative. No live data migration, no inferred status from free text, and no emails.

UI: four native status choices, only relevant fields, automatic photo upload, optional notes, concise status/review summary, expandable order/history. Existing acknowledgement and schedule preconditions remain. Photo failures and stale data preserve the draft; staff cannot use vendor updates.

Acceptance: start is visible at zero; progress cannot save without eligible photos; completion requires eligible photos or an authorized current-round exemption; hold requires reason; completion is atomic and retry safe; review ownership remains correct; desktop/mobile and keyboard flows work. Tests cover foreign/old photos, CAS/concurrency, rollback, new and legacy flows.

User refinement: vendor updates are photo-based, with no percentage input or percentage display in the vendor list, summary, work details, or history. Repeated In progress photo updates preserve the stored legacy percentage for API compatibility and remain in progress until the vendor explicitly chooses Completed. The current-round typed report determines Started working versus In progress at a stored zero. Completion and existing review/exemption rules remain unchanged.
