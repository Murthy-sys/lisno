const featureScope = {
  kind: "non_project",
  namespace: "ai_estimator_knowledge"
} as const;

const readOperation = {
  scope: featureScope,
  operationClass: "read",
  superAdminBehavior: "global_read",
  availability: "ai_estimator_knowledge"
} as const;

const adminOperation = {
  scope: featureScope,
  operationClass: "admin",
  superAdminBehavior: "admin_override",
  availability: "ai_estimator_knowledge"
} as const;

export const EXPECTED_AI_ESTIMATOR_KNOWLEDGE_OPERATIONS = [
  { key: "GET /admin/ai-estimator-knowledge/baskets", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/baskets", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "PATCH /admin/ai-estimator-knowledge/baskets/:basketId", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/baskets/:basketId", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/baskets/:basketId/deletion-impact", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/baskets/:basketId/permanent", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/baskets/:basketId/main-lines", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/baskets/:basketId/main-lines", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "PATCH /admin/ai-estimator-knowledge/main-lines/:mainLineId", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/main-lines/:mainLineId", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/items", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "GET /admin/ai-estimator-knowledge/main-lines/:mainLineId", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "GET /admin/ai-estimator-knowledge/main-lines/:mainLineId/history", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "PUT /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/activate", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/deactivate", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/duplicate", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "POST /admin/ai-estimator-knowledge/preview", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "GET /admin/ai-estimator-knowledge/uoms", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/uoms", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "PATCH /admin/ai-estimator-knowledge/uoms/:id", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/uoms/:id", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/vendors", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/vendors", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "PATCH /admin/ai-estimator-knowledge/vendors/:id", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/vendors/:id", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/taxes", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/taxes", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "PATCH /admin/ai-estimator-knowledge/taxes/:id", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/taxes/:id", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/priorities", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/priorities", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "PATCH /admin/ai-estimator-knowledge/priorities/:id", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/priorities/:id", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/surfaces", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/surfaces", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "PATCH /admin/ai-estimator-knowledge/surfaces/:id", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/surfaces/:id", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "GET /admin/ai-estimator-knowledge/modes", permission: "ai_estimator_knowledge.configuration.read", ...readOperation },
  { key: "POST /admin/ai-estimator-knowledge/modes", permission: "ai_estimator_knowledge.configuration.create", ...adminOperation },
  { key: "PATCH /admin/ai-estimator-knowledge/modes/:id", permission: "ai_estimator_knowledge.configuration.update", ...adminOperation },
  { key: "DELETE /admin/ai-estimator-knowledge/modes/:id", permission: "ai_estimator_knowledge.configuration.lifecycle", ...adminOperation },
  { key: "POST /ai-estimator-knowledge/context", permission: "ai_estimator_knowledge.context.read", ...readOperation }
] as const;
