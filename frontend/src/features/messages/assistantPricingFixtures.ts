import type { AssistantProjectPricing } from "./assistantAnswerSchema";

export const publishedPriceFixture = (overrides: Partial<AssistantProjectPricing> = {}): AssistantProjectPricing => ({
  policy: "published-project-estimate-v1", currency: "INR", state: "published", estimateId: "estimate-a", estimateVersion: 3, reviewRoundId: "review-a", reviewVersion: 2, publishedAt: "2026-10-15T00:00:00Z", source: { id: "estimate-a", label: "Published estimate", href: null },
  lines: [{ id: "line-a", label: "Living room ceiling", quantity: "100", unit: "sq-ft", ratePaise: 8250, amountPaise: 825000 }], lineCount: 1, hasMoreLines: false, subtotalPaise: 825000, gstPaise: 148500, totalPaise: 973500, ...overrides
});
