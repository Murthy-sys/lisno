import type { AssistantProjectPricing } from "../../src/contracts/project-chat-assistant.js";

export function customerEstimatePricing(totalPaise = 27140): AssistantProjectPricing {
  const subtotalPaise = totalPaise === 27140 ? 23000 : 23800;
  return {policy: "published-project-estimate-v1", currency: "INR", state: "approved", estimateId: "estimate-a", estimateVersion: 2,
    reviewRoundId: "review-a", reviewVersion: 1, publishedAt: "2026-10-10T10:00:00.000Z", source: {id: "review-a", label: "Approved customer estimate", href: null},
    lines: [{id: "line-a", label: "Customer work", quantity: "1", unit: "item", ratePaise: subtotalPaise, amountPaise: subtotalPaise}], lineCount: 1, hasMoreLines: false,
    subtotalPaise, gstPaise: totalPaise - subtotalPaise, totalPaise};
}
