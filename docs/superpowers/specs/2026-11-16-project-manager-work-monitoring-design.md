# Project Manager work monitoring

Photo-policy update: the later [Required work photos](2026-11-16-required-work-photos-design.md) specification supersedes all exemption behavior below. Photo exemptions are disabled and current-round completion photos are mandatory.


The current project screen separates vendor progress and reports and shows numeric percentages, ownership metadata, reporting flags and a generic action selector. The requested screen should focus on monitoring photo-based work and reviewing completion.

Show one list with work/vendor identity, current status, latest current-round vendor note and photo count, current hold reason, finish date and the relevant review action. No work percentages. Use a small project-wide count summary, search/status filters and expandable secondary filters/team information.

The work drawer shows status and due date, latest vendor update, current work photos and an explicit schedule or completion review only when backend allowedActions permits it. Put hold/resume, photo exemption and setup behind More actions; issued scope and history remain expandable. Preserve read-only proposed dates, reasons, exact submission IDs, current-round evidence, expectedVersion, idempotency, stale draft recovery, denied-access clearing and Client acceptance as a separate process. No API/schema, live data, notifications or permission changes.

Accept when managers can identify what needs attention and inspect photos without percentages or a generic action menu; work in progress requires no manager approval; completion has clear Verify completion / Request changes controls; all existing edge-case guards remain; desktop/mobile and keyboard interactions pass.

The default Project Manager Site tab uses this monitor directly. Assignment links stay in the tab; explicit full-detail links retain the optional project metadata view. Existing site notification targets resolve to the correct assignment. Filters do not switch views, and unsaved drafts remain guarded when changing project tabs or detail mode.

Photo viewing update: Project Manager photos start hidden and load only after selecting View photo. Closing a photo keeps it hidden on refresh; a new round or removed image clears the selected preview.

Required-sections update: retain only Activity history below the main work monitor. Remove More actions and Work details & schedule from the simplified Project Manager panel. Show required setup, resume of an existing manager hold, proposed-schedule confirmation or completion review contextually, using authorized server actions. Keep status, finish date, latest update, click-to-view photos and current hold reason visible.
