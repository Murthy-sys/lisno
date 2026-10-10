const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const body = { type: "string", minLength: 1, maxLength: 2000 };
const projectId = { type: "string", minLength: 1, maxLength: 200, nullable: true };
const listOffset = { type: "integer", minimum: 0, maximum: 1_000_000, multipleOf: 20 };
const listVersion = { type: "string", pattern: "^[a-f0-9]{64}$" };

export const ASK_LISNO_SCHEMAS = {
  AskLisnoRequest: object({ projectId, contextProjectId: projectId, choiceProjectId: projectId, projectListPage: object({offset: listOffset, version: listVersion}), message: body, history: { type: "array", maxItems: 15, items: object({ body, projectId }, ["body"]) } }, ["projectId", "message", "history"]),
  AskLisnoProjectList: object({items: {type: "array", maxItems: 20, items: object({id: {type: "string"}, name: {type: "string"}, detail: {type: "string", nullable: true}})}, offset: listOffset, nextOffset: {...listOffset, nullable: true}, version: listVersion}),
  AskLisnoResolution: object({state: {type: "string", enum: ["resolved", "clarification", "account"]},
    project: {allOf: [object({id: {type: "string"}, name: {type: "string"}})], nullable: true}, question: {type: "string", nullable: true},
    choices: {type: "array", maxItems: 5, items: object({id: {type: "string"}, name: {type: "string"}, detail: {type: "string", nullable: true}})}}),
  AskLisnoResponse: object({ projectId, resolution: ref("AskLisnoResolution"), projectList: ref("AskLisnoProjectList"), checkedAt: { type: "string", format: "date-time" }, answer: object({
    kind: { type: "string", enum: ["status", "catalogue", "price", "clarification", "handoff", "no_answer"] },
    narrative: ref("AssistantNarrative"), facts: { type: "array", items: ref("AssistantFact") },
    candidates: { type: "array", items: ref("AssistantCatalogueCandidate") },
    missingInputs: { type: "array", items: { type: "string" } },
    commercial: { allOf: [ref("AssistantCommercialSnapshot")], nullable: true }
  }, ["kind", "facts", "candidates", "missingInputs", "commercial"]) }, ["projectId", "checkedAt", "answer"])
};
