/** Shared scope for the staff estimate workspace, in addition to LeadService.get. */
export function estimateStaffReadFilter(actor: { id: string; role: string }): Record<string, unknown> {
  return actor.role === "super_admin" ? {} : actor.role === "designer"
    ? { "estimation.workflowVersion": { $in: [2, 3] }, "estimation.phase": "post", designPlanDesignerId: actor.id }
    : { ownerId: actor.id };
}
