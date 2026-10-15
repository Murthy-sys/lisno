const string = { type: "string" };
const nullableString = { type: "string", nullable: true };
const actions = ["complete", "approve", "defer", "reopen"];

export const DESIGN_REQUIREMENTS_SCHEMAS = {
  DesignRequirementAction: {
    type: "object", additionalProperties: false,
    required: ["expectedVersion", "sourceToken", "entryId", "action", "note", "idempotencyKey"],
    description: "Project-scoped action against the exact current rule source. Only the assigned Designer can complete internal checks or sign every configured PO point. Only the actual Client can approve finish/specification. Assigned Procurement closes stock checks. Deferral is limited to physical selection entries and requires a reason; it remains open work. No Super Admin impersonation.",
    properties: {
      expectedVersion: { type: "integer", minimum: 0 }, sourceToken: string, entryId: string,
      action: { type: "string", enum: actions }, note: { type: "string", minLength: 1, maxLength: 2000 },
      checkedPointIds: { type: "array", uniqueItems: true, items: string },
      idempotencyKey: { type: "string", minLength: 8, maxLength: 200 }
    }
  },
  DesignRequirements: {
    type: "object", additionalProperties: false,
    required: ["projectId", "version", "sourceToken", "entries", "blockers", "canReadInternal"],
    description: "Server-derived current requirements. Clients receive only their selection entries; vendor discussions and internal signoff data are excluded. Source changes invalidate current evidence without rewriting history. Stock due dates use the original recorded initial payment plus four calendar days.",
    properties: {
      projectId: string, version: { type: "integer", minimum: 0 }, sourceToken: string,
      replayed: { type: "boolean", description: "Present on an action result; true when the identical stored action was replayed." },
      canReadInternal: { type: "boolean" }, blockers: { type: "array", items: string },
      entries: { type: "array", items: { $ref: "#/components/schemas/DesignRequirementEntry" } }
    }
  },
  DesignRequirementEntry: {
    type: "object", additionalProperties: false,
    required: ["id", "lineItemId", "mainLineId", "lineName", "ruleKey", "label", "category", "status", "availableActions"],
    properties: {
      id: string, lineItemId: string, mainLineId: string, lineName: string, ruleKey: string, label: string,
      category: { type: "string", enum: ["selection", "critical", "stock", "po_approval"] },
      status: { type: "string", enum: ["pending", "approved", "completed", "deferred"] },
      note: string, details: string, checkedPointIds: { type: "array", items: string },
      checklist: { type: "array", items: { type: "object", additionalProperties: false,
        required: ["id", "text"], properties: { id: string, text: string } } },
      completedAt: nullableString, completedById: nullableString, deferredReason: nullableString,
      dueAt: nullableString, availableActions: { type: "array", items: { type: "string", enum: actions } }
    }
  }
};
