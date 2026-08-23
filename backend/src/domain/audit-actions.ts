export const EXISTING_AUDIT_ACTIONS = [
  "client_project_linked",
  "client_signed_up",
  "design_extraction_completed",
  "design_extraction_failed",
  "design_extraction_manually_recovered",
  "design_extraction_retried",
  "design_section_approved",
  "design_section_created",
  "design_section_edited",
  "design_section_rejected",
  "design_section_removed",
  "design_section_replaced",
  "design_sections_submitted",
  "design_version_approval_changed",
  "design_version_uploaded",
  "design_version_visibility_changed",
  "estimate_design_annotation_draft_saved",
  "estimate_design_changes_requested",
  "estimate_design_crop_corrected",
  "estimate_design_drawing_approved",
  "estimate_design_drawing_removed",
  "estimate_design_drawings_submitted",
  "estimate_design_extraction_claimed",
  "estimate_design_extraction_completed",
  "estimate_design_extraction_failed",
  "estimate_design_final_approved",
  "estimate_design_final_changes_requested",
  "estimate_design_item_assigned",
  "estimate_design_manual_drawing_created",
  "estimate_design_mapping_corrected",
  "estimate_design_replacement_created",
  "estimate_design_replacement_queued",
  "estimate_design_upload_retried",
  "estimate_design_uploaded",
  "estimate_design_verified",
  "estimate_designer_assigned",
  "estimate_plan_change_request_updated",
  "estimate_plan_changes_requested",
  "estimate_plan_page_resolved",
  "estimate_plan_targets_linked",
  "evaluation_created",
  "evaluation_revised",
  "floor_created",
  "lead_activity_added",
  "lead_created",
  "lead_updated",
  "project_created",
  "stage_created",
  "task_created",
  "task_deadline_revised",
  "task_note_added",
  "task_progress_changed",
  "task_status_changed"
] as const;

export const PROMPT_1_AUDIT_ACTIONS = [
  "user.role_changed",
  "user.activated",
  "user.deactivated",
  "access_request.created",
  "access_request.cancelled",
  "access_request.approved",
  "access_request.rejected",
  "project_access.granted",
  "project_access.revoked"
] as const;

export const USER_INVITATION_AUDIT_ACTIONS = [
  "user_invitation.created",
  "user_invitation.superseded",
  "user_invitation.delivery_sent",
  "user_invitation.delivery_failed",
  "user_invitation.resent",
  "user_invitation.revoked",
  "user_invitation.accepted",
  "user.invited_created"
] as const;

export const AUDIT_ACTIONS = [
  ...EXISTING_AUDIT_ACTIONS,
  ...PROMPT_1_AUDIT_ACTIONS,
  ...USER_INVITATION_AUDIT_ACTIONS
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
