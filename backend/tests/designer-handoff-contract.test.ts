import { describe, expect, it } from "vitest";
import { HUMAN_JWT_OPERATIONS } from "../src/domain/route-operations.js";
import { openApiDocument } from "../src/openapi.js";
import { AUDIT_ACTIONS } from "../src/domain/audit-actions.js";

describe("Designer handoff public contracts", () => {
  it("keeps Designer decisions personal and request administration project scoped", () => {
    for (const key of ["GET /designer/assignment-requests", "POST /designer/assignment-requests/:requestId/decision"] as const) {
      expect(HUMAN_JWT_OPERATIONS[key]).toMatchObject({ operationClass: "personal", superAdminBehavior: "deny_personal" });
    }
    for (const key of ["POST /admin/projects/:projectId/designer-assignment-requests", "POST /admin/projects/:projectId/designer-assignment-requests/:requestId/cancel"] as const) {
      expect(HUMAN_JWT_OPERATIONS[key]).toMatchObject({ scope: { kind: "project", module: "projects" }, operationClass: "admin", superAdminBehavior: "admin_override" });
    }
  });

  it("documents strict decisions and exposes only safe Client and inbox properties", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    expect(schemas.CreateDesignerAssignmentRequest).toMatchObject({ additionalProperties: false, required: ["designerId", "expectedSourceRevision", "idempotencyKey"] });
    expect(schemas.DecideDesignerAssignmentRequest).toMatchObject({ additionalProperties: false, required: ["expectedVersion", "decision", "idempotencyKey"] });
    expect(schemas.DesignWorkflow.properties.designerHandoff).toEqual({ $ref: "#/components/schemas/DesignerHandoffView" });
    expect(schemas.DesignWorkflowActionRequest.properties.action.enum).toContain("key_collection_schedule");
    expect(schemas.KeyCollectionScheduleData.oneOf).toHaveLength(2);
    expect(schemas.KeyCollectionScheduleData.oneOf.every((shape: any) => shape.additionalProperties === false)).toBe(true);
    for (const property of ["email", "clientEmail", "clientMobile", "pendingRequest", "pendingRequests", "languagesKnown", "activeProjectCount"]) {
      expect(schemas.DesignerHandoffView.properties).not.toHaveProperty(property);
      expect(schemas.DesignerAssignmentInboxItem.properties).not.toHaveProperty(property);
    }
    expect(schemas.KeyCollectionAppointmentView.required).toContain("originalDeadlineAt");
  });

  it("documents plural pending requests and privacy-safe closure reasons", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    expect(schemas.DesignerSuggestionsPage.required).toContain("pendingRequests");
    expect(schemas.DesignerSuggestionsPage.properties.pendingRequests).toEqual({ type: "array", items: { $ref: "#/components/schemas/DesignerAssignmentRequestSummary" } });
    expect(schemas.DesignerSuggestionsPage.properties.pendingRequest).toMatchObject({ nullable: true, deprecated: true });
    for (const name of ["DesignerAssignmentRequestSummary", "DesignerAssignmentInboxItem"]) {
      expect(schemas[name].required).toContain("closureReason");
      expect(schemas[name].properties.closureReason).toMatchObject({ nullable: true, enum: ["assigned_elsewhere", "cancelled_by_admin", null] });
    }
    expect(schemas.DesignerAssignmentInboxItem.properties).not.toHaveProperty("winningRequestId");
  });

  it("binds real request/response schemas to every new operation", () => {
    const paths = openApiDocument.paths as Record<string, any>;
    expect(paths["/admin/projects/{projectId}/designer-suggestions"].get.responses["2XX"].content["application/json"].schema.properties.data.$ref)
      .toBe("#/components/schemas/DesignerSuggestionsPage");
    expect(paths["/designer/assignment-requests/{requestId}/decision"].post.requestBody.content["application/json"].schema.$ref)
      .toBe("#/components/schemas/DecideDesignerAssignmentRequest");
    expect(paths["/admin/projects/{projectId}/design-assignment"].post).toMatchObject({ deprecated: true });
    expect(paths["/admin/projects/{projectId}/design-assignment"].post.responses).not.toHaveProperty("2XX");
    for (const action of ["designer_assignment_requested", "designer_assignment_accepted", "designer_assignment_declined", "designer_assignment_cancelled"]) expect(AUDIT_ACTIONS).toContain(action);
  });
});
