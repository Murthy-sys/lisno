import { responsibilityCategories } from "../domain/user-responsibilities.js";

const text = { type: "string" };
const stage = { type: "object", nullable: true, additionalProperties: false, required: ["key", "label"], properties: { key: text, label: text } };
const project = { type: "object", nullable: true, additionalProperties: false,
  required: ["id", "projectNumber", "name", "status", "currentStage", "stageState"], properties: {
    id: text, projectNumber: { type: "string", nullable: true, readOnly: true }, name: text, status: text,
    currentStage: stage, stageState: { type: "string", enum: ["available", "unavailable"] }
  }
};

export const USER_RESPONSIBILITY_SCHEMAS = {
  UserResponsibilityRow: { type: "object", additionalProperties: false,
    required: ["id", "category", "sourceType", "sourceId", "label", "workStatus", "workStage", "projectId", "project", "contextState", "relatedUser", "blocksRoleChange"],
    properties: {
      id: text, category: { type: "string", enum: [...responsibilityCategories] },
      sourceType: { type: "string", enum: ["lead", "estimate", "project", "task", "user", "project_access_grant", "workflow_task"] },
      sourceId: text, label: text, workStatus: { type: "string", nullable: true }, workStage: stage,
      projectId: { type: "string", nullable: true }, project,
      contextState: { type: "string", enum: ["available", "unlinked", "unavailable", "not_applicable"] },
      relatedUser: { type: "object", nullable: true, additionalProperties: false, required: ["id", "name"], properties: { id: text, name: text } },
      blocksRoleChange: { type: "boolean" }
    }
  },
  UserResponsibilitiesPage: { type: "object", additionalProperties: false,
    description: "Super Admin-only read of the target user's responsibilities. Counts cover all pages. This dated preview does not authorize a role change; the mutation rechecks assignments transactionally.",
    required: ["user", "destinationRole", "readAt", "counts", "blockingCount", "items", "pagination"], properties: {
      user: { type: "object", additionalProperties: false, required: ["id", "role", "version"], properties: {
        id: text, role: { $ref: "#/components/schemas/Role" }, version: { type: "integer", minimum: 1 }
      } },
      destinationRole: { nullable: true, allOf: [{ $ref: "#/components/schemas/Role" }] },
      readAt: { type: "string", format: "date-time" },
      counts: { type: "object", additionalProperties: false, required: [...responsibilityCategories],
        properties: Object.fromEntries(responsibilityCategories.map(category => [category, { type: "integer", minimum: 0 }])) },
      blockingCount: { type: "integer", minimum: 0 },
      items: { type: "array", maxItems: 100, items: { $ref: "#/components/schemas/UserResponsibilityRow" } },
      pagination: { $ref: "#/components/schemas/Pagination" }
    }
  }
};
