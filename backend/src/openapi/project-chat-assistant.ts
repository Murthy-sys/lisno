const text = {type: "string"};
const nullableText = {...text, nullable: true};
const integer = {type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER};
const money = {...integer, nullable: true, description: "Exact integer paise from an immutable customer estimate. Null means unavailable."};
const boolean = {type: "boolean"};
const ref = (name: string) => ({$ref: `#/components/schemas/${name}`});
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({type: "object", additionalProperties: false, properties, required});
const list = (items: unknown) => ({type: "array", items});
const mode = {type: "string", enum: ["pmc", "sub_vendor", "in_house"]};
const state = {type: "string", enum: ["complete", "partial", "clarification_required"]};
const service = {kind: {type: "string", enum: ["service"]}, id: {type: "string", enum: ["lisno-ai"]}, name: {type: "string", enum: ["Lisno AI"]}};

export const CHAT_ASSISTANT_SCHEMAS = {
  ChatServiceAuthor: object(service),
  ChatAuthor: {oneOf: [ref("ChatPerson"), ref("ChatServiceAuthor")]},
  ChatAssistantParticipant: object({...service, available: boolean}),
  ChatAssistantRequest: object({idempotencyKey: {type: "string", minLength: 8, maxLength: 100}, expectedVersion: {type: "integer", minimum: 1}}),
  ChatAssistantMessageState: object({runId: text, generation: integer, stateVersion: integer,
    status: {type: "string", enum: ["waiting_for_human", "ready", "leased", "answered", "needs_clarification", "no_answer", "suppressed", "failed"]},
    eligibleAt: {...text, format: "date-time"}, resultId: nullableText, checkedAt: nullableText,
    notified: {allOf: [ref("ChatPerson")], nullable: true}, routing: {type: "string", enum: ["not_required", "notified", "unroutable"]}, canRequest: boolean, failureCode: nullableText
  }, ["runId", "generation", "status", "eligibleAt", "resultId", "checkedAt", "notified", "routing", "canRequest", "failureCode"]),
  AssistantFact: object({id: text, label: text, value: text, source: object({id: text, label: text, href: nullableText})}),
  AssistantNarrative: {type: "array", maxItems: 4, items: object({text: {...text, minLength: 1, maxLength: 2000}, factIds: {type: "array", maxItems: 20, items: text}})},
  AssistantCatalogueCandidate: object({mainLineId: text, mainBasketId: text, subBasketId: nullableText, name: text, basketName: text, subBasketName: nullableText,
    revisionId: text, revisionVersion: integer, itemVersion: integer, uom: object({id: text, code: text, name: text, decimalScale: integer}), available: boolean,
    inHouseComponents: { type: "array", maxItems: 50, items: object({id: text, basketId: text, subBasketId: nullableText, basketName: text, subBasketName: nullableText, available: boolean}) } },
    ["mainLineId", "mainBasketId", "subBasketId", "name", "basketName", "subBasketName", "revisionId", "revisionVersion", "itemVersion", "uom", "available"]),
  AssistantPriceLine: object({mainLineId: text, roomId: nullableText, name: text, quantity: nullableText, uom: text, pricingMode: mode, optional: boolean,
    amountPaise: money, revisionId: text, missingInputs: list(text), selectedInHouseComponentIds: { type: "array", maxItems: 50, uniqueItems: true, items: text } },
    ["mainLineId", "roomId", "name", "quantity", "uom", "pricingMode", "optional", "amountPaise", "revisionId", "missingInputs"]),
  AssistantCommercialSnapshot: object({currency: {type: "string", enum: ["INR"]}, policy: {type: "string", enum: ["configuration-selling-v1"]}, state,
    lines: list(ref("AssistantPriceLine")), subtotalPaise: money, gstRateBps: integer, gstPaise: money, totalPaise: money, optionalSubtotalPaise: money,
    approvedBaselinePaise: money, hypotheticalTotalPaise: money, assumptions: list(text), missingInputs: list(text)}),
  AssistantProjectPricing: object({policy: {type: "string", enum: ["published-project-estimate-v1"]}, currency: {type: "string", enum: ["INR"]},
    state: {type: "string", enum: ["published", "approved"]}, estimateId: text, estimateVersion: {...integer, minimum: 1}, reviewRoundId: text, reviewVersion: {...integer, minimum: 1},
    publishedAt: {...text, format: "date-time"}, source: object({id: text, label: text, href: nullableText}),
    lines: {type: "array", maxItems: 100, items: object({id: text, label: text, quantity: nullableText, unit: nullableText, ratePaise: money, amountPaise: money})},
    lineCount: integer, hasMoreLines: boolean, subtotalPaise: money, gstPaise: money, totalPaise: money}),
  ChatAssistantResult: object({id: text, projectId: text, messageId: text, kind: {type: "string", enum: ["status", "catalogue", "price", "clarification", "handoff", "no_answer"]},
    disclosurePolicy: {type: "string", enum: ["project-publication-v1"]}, projectPricing: {allOf: [ref("AssistantProjectPricing")], nullable: true},
    narrative: ref("AssistantNarrative"), facts: list(ref("AssistantFact")), candidates: list(ref("AssistantCatalogueCandidate")), missingInputs: list(text),
    commercial: {allOf: [ref("AssistantCommercialSnapshot")], nullable: true}, checkedAt: {...text, format: "date-time"}, stale: boolean,
    commercialAccess: {type: "string", enum: ["allowed", "restricted", "none"], description: "Commercial access is checked independently from chat membership on every read."}}, ["id", "projectId", "messageId", "kind", "facts", "candidates", "missingInputs", "commercial", "checkedAt", "stale", "commercialAccess"])
};
