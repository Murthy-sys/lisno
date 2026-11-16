# Required work photos

The user requires photo exemptions to be disallowed. Existing manager controls can grant an exemption; vendor completion and manager verification currently accept that exemption instead of current-round photos. A previously saved exemption must no longer bypass the rule.

Remove grant controls, current exemption messaging and exemption guidance from vendor/manager/generic execution views. Require valid current-round photos for vendor completion through both typed completed reports and the legacy submit action. Reject manager verification of pending photo-less submissions, including historical exemption submissions; Request changes remains available so vendors can upload photos in a new round. Reject all grant commands, including stale clients and replay attempts, without writes. Keep normal progress photo requirements, hold/resume, versions, scope/identity checks, idempotency of other actions and audit history intact.

Keep stored historical exemption fields/events for audit compatibility. Expose no active exemption in current work responses, and write no exemption metadata into new completion submissions. Do not rewrite existing work records or revoke already recorded historical decisions. No database migration, dependency, email, external action or permission expansion.

Accept when no current UI offers an exemption, stale exemption data cannot bypass frontend validation, server submission/verification requires valid photos, stale grant commands cannot mutate or replay a grant, and normal photo-backed completion/review still passes.
