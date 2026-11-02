const shortText = { type: "string", minLength: 1, maxLength: 200 };
const text = { type: "string", minLength: 1, maxLength: 2000 };
const section = {
  type: "object", additionalProperties: false, required: ["id", "title", "body"],
  properties: { id: shortText, title: shortText, body: text }
};
const sections = (maximum: number) => ({ type: "array", minItems: 1, maxItems: maximum, items: section });
const days = (maximum: number) => ({ type: "integer", minimum: 1, maximum });

export const ESTIMATE_PROPOSAL_SCHEMAS = {
  EstimateProposalMetadata: {
    type: "object", additionalProperties: false,
    description: "Frozen document identity and commercial defaults for the Lisno proposal template. Present only on new exports/publications; omission preserves the legacy template. Included in the immutable snapshot digest. This is server-owned output, not an editable request field.",
    required: ["templateVersion", "defaultsVersion", "issuedAt", "validUntil", "reference", "preparedBy", "signatoryName", "terms"],
    properties: {
      templateVersion: { type: "string", enum: ["lisno-proposal-v1"] },
      defaultsVersion: { type: "integer", enum: [1] },
      issuedAt: { type: "string", format: "date-time" },
      validUntil: { type: "string", format: "date", description: "Issue calendar date in Asia/Kolkata plus the frozen validityDays." },
      reference: shortText, preparedBy: shortText, signatoryName: shortText,
      terms: {
        type: "object", additionalProperties: false,
        required: ["designWorkingDays", "executionWorkingDays", "paymentDueWorkingDays", "validityDays", "paymentStages", "clauses", "materials", "exclusions", "workflow", "changeReasons", "company"],
        properties: {
          designWorkingDays: days(1000), executionWorkingDays: days(1000), paymentDueWorkingDays: days(365), validityDays: days(365),
          paymentStages: {
            type: "array", minItems: 5, maxItems: 5,
            description: "Unique stage identities; basis points sum to 10000. Amounts are derived from the saved project total in integer paise, with any allocation remainder assigned to the final stage.",
            items: { type: "object", additionalProperties: false, required: ["id", "title", "trigger", "description", "basisPoints"],
              properties: { id: shortText, title: shortText, trigger: text, description: text, basisPoints: { type: "integer", minimum: 1, maximum: 10000 } } }
          },
          clauses: sections(16), exclusions: sections(16), changeReasons: sections(8),
          materials: { type: "array", minItems: 1, maxItems: 16, items: {
            type: "object", additionalProperties: false, required: ["area", "specification"], properties: { area: shortText, specification: text }
          } },
          workflow: { type: "array", minItems: 4, maxItems: 4, items: {
            type: "object", additionalProperties: false, required: ["id", "title", "timing", "steps"],
            properties: { id: shortText, title: shortText, timing: shortText, steps: { type: "array", minItems: 1, maxItems: 8, items: text } }
          } },
          company: { type: "object", additionalProperties: false, required: ["name", "phone", "email", "website", "social", "studioAddress"],
            properties: { name: shortText, phone: shortText, email: { type: "string", format: "email", maxLength: 200 }, website: shortText, social: shortText, studioAddress: text } }
        }
      }
    }
  }
};
