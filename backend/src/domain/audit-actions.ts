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

export const PASSWORD_RESET_AUDIT_ACTIONS = [
  "password_reset.requested",
  "password_reset.superseded",
  "password_reset.delivery_sent",
  "password_reset.delivery_failed",
  "password_reset.completed",
  "password_reset.notification_sent",
  "password_reset.notification_failed"
] as const;

export const ESTIMATE_CLIENT_REVIEW_AUDIT_ACTIONS = [
  "estimate_client_review_published",
  "estimate_email_delivery_sent",
  "estimate_email_delivery_failed",
  "estimate_email_retry_requested",
  "estimate_client_response_task_assigned",
  "estimate_client_approval_recorded_by_admin",
  "estimate_client_changes_recorded_by_admin",
  "estimate_client_response_recorded_through_portal",
  "estimate_client_proof_stored"
] as const;

export const DESIGN_PLAN_WORKFLOW_AUDIT_ACTIONS = [
  "design_plan_designer_assigned",
  "design_plan_submitted_for_client_review",
  "design_plan_email_delivery_sent",
  "design_plan_email_delivery_failed",
  "design_plan_email_retry_requested",
  "design_plan_client_proof_stored",
  "design_plan_approved",
  "project_workflow_task_assignee_changed",
  "project_workflow_section_assignee_changed",
  "project_workflow_task_progress_changed"
] as const;

export const PROCUREMENT_AUDIT_ACTIONS = [
  "procurement_expense_recorded"
] as const;

export const AI_ESTIMATOR_KNOWLEDGE_AUDIT_ACTIONS = [
  "ai_estimator_knowledge_basket_created",
  "ai_estimator_knowledge_basket_updated",
  "ai_estimator_knowledge_basket_archived",
  "ai_estimator_knowledge_basket_permanently_deleted",
  "ai_estimator_knowledge_main_line_created",
  "ai_estimator_knowledge_main_line_updated",
  "ai_estimator_knowledge_main_line_archived",
  "ai_estimator_knowledge_main_line_permanently_deleted",
  "ai_estimator_knowledge_main_line_deactivated",
  "ai_estimator_knowledge_main_line_duplicated",
  "ai_estimator_knowledge_master_created",
  "ai_estimator_knowledge_master_updated",
  "ai_estimator_knowledge_master_archived",
  "ai_estimator_knowledge_section_updated",
  "ai_estimator_knowledge_price_version_created",
  "ai_estimator_knowledge_tax_version_created",
  "ai_estimator_knowledge_tax_version_rolled_over",
  "ai_estimator_knowledge_revision_created",
  "ai_estimator_knowledge_revision_activated",
  "ai_estimator_knowledge_lifecycle_blocked"
] as const;

export const AUDIT_ACTIONS = [
  ...EXISTING_AUDIT_ACTIONS,
  ...PROMPT_1_AUDIT_ACTIONS,
  ...USER_INVITATION_AUDIT_ACTIONS,
  ...PASSWORD_RESET_AUDIT_ACTIONS,
  ...ESTIMATE_CLIENT_REVIEW_AUDIT_ACTIONS,
  ...DESIGN_PLAN_WORKFLOW_AUDIT_ACTIONS,
  ...PROCUREMENT_AUDIT_ACTIONS,
  ...AI_ESTIMATOR_KNOWLEDGE_AUDIT_ACTIONS
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
