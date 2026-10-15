import { EstimateModel } from "../../../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../../../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../../../src/models/Lead.js";
import { ProjectModel } from "../../../src/models/Project.js";
import { ProjectPurchaseOrderModel } from "../../../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../../src/models/ProjectPurchaseOrderRevision.js";
import { VendorWorkAssignmentModel } from "../../../src/models/VendorWorkAssignment.js";
import { CHAT_NOW, chatLead } from "../project-chat.js";
import { insertChatMongoFixture } from "../project-chat-mongo.js";

export const RULES_PROJECT_AMOUNTS = {
  a: {ratePaise: 1_000, quantity: 2, subtotalPaise: 2_000, gstPaise: 360, totalPaise: 2_360},
  b: {ratePaise: 7_503, quantity: 3, subtotalPaise: 22_509, gstPaise: 4_052, totalPaise: 26_561}
} as const;

// This helper is called only after startMongoReplicaSet connects to its isolated database.
// Raw collection writes describe immutable historical publications without invoking app workflows.
export async function insertRulesMongoProjects() {
  const f = await insertChatMongoFixture();
  const {id, ...lead} = chatLead("lead-b", "b");
  await LeadModel.collection.insertOne({_id: id, ...lead} as never);
  const template = (await EstimateModel.findById("estimate-a").lean().exec())!;
  await EstimateModel.collection.insertOne({...template, _id: "estimate-b", projectId: "b", leadId: "lead-b"} as never);
  await ProjectModel.updateOne({_id: "b"}, {$set: {status: "paused"}});
  for (const key of ["a", "b"] as const) {
    const money = RULES_PROJECT_AMOUNTS[key];
    const line = {id: `published-line-${key}`, source: "configuration", itemType: "main_line", classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration",
      catalogueId: `ceiling-${key}`, roomId: `room-${key}`, roomName: `Published room ${key}`, specification: null,
      mainBasketId: "pop", mainBasketName: "POP", subBasketId: "pop-sub", subBasketName: "Ceiling", mainLineId: `ceiling-${key}`, mainLineName: `Published ceiling ${key}`,
      revisionId: `historical-revision-${key}`, uomId: "uom", uomName: "Square feet", unit: "sqft", quantity: money.quantity,
      rate: money.ratePaise / 100, amount: money.subtotalPaise / 100, ratePaise: money.ratePaise, amountPaise: money.subtotalPaise, included: true};
    const snapshot = {clientName: `Synthetic Client ${key}`, projectName: `Synthetic project ${key}`, location: "Synthetic", propertyType: "villa",
      rooms: [{id: `room-${key}`, label: `Published room ${key}`}], lineItems: [line],
      subtotal: money.subtotalPaise / 100, gst: money.gstPaise / 100, total: money.totalPaise / 100,
      subtotalPaise: money.subtotalPaise, gstPaise: money.gstPaise, totalPaise: money.totalPaise};
    await LeadModel.updateOne({_id: `lead-${key}`}, {$set: {clientEmail: `client-${key}@chat.test`}});
    await EstimateModel.collection.updateOne({_id: `estimate-${key}`} as never, {$set: {
      status: "client_approved", version: 4, clientDecisionAt: new Date(CHAT_NOW),
      totalPaise: key === "a" ? 99_000_003 : 88_000_001,
      rooms: [{id: `draft-room-${key}`, label: "PRIVATE_WORKING_ROOM"}],
      lineItems: [{...line, mainLineName: "PRIVATE_WORKING_LINE", ratePaise: 77_000_009, amountPaise: 77_000_009}]
    }});
    await EstimateClientReviewRoundModel.collection.insertOne({_id: `review-${key}`, estimateId: `estimate-${key}`, leadId: `lead-${key}`, projectId: key,
      estimateVersion: 3, version: 1, sendGeneration: 1, status: "approved", decision: "approve", decisionSource: "client_portal",
      decidedById: `client-${key}`, decidedAt: new Date(CHAT_NOW), createdAt: new Date(CHAT_NOW), recipientEmailNormalized: `client-${key}@chat.test`,
      estimateSnapshot: snapshot} as never);
    const issuedLine = {id: `issued-line-${key}`, procurementItemId: `procurement-${key}`, sourceLineItemKey: line.id};
    await ProjectPurchaseOrderModel.collection.insertOne({_id: `order-${key}`, projectId: key, vendorId: `vendor-${key}`, approvedRevisionId: `revision-${key}`,
      approvedRevision: 1, status: "issued", cancelledAt: null} as never);
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({_id: `revision-${key}`, projectId: key, vendorId: `vendor-${key}`, orderId: `order-${key}`,
      revision: 1, lines: [issuedLine]} as never);
    await VendorWorkAssignmentModel.collection.insertOne({_id: `work-${key}`, projectId: key, vendorId: `vendor-${key}`, orderId: `order-${key}`,
      orderRevision: 1, lineId: issuedLine.id, procurementItemId: issuedLine.procurementItemId, sourceLineItemKey: line.id,
      estimateId: `estimate-${key}`, estimateVersion: 3, estimateReviewRoundId: `review-${key}`, sourceSectionId: `section-${key}`,
      itemName: `PRIVATE_VENDOR_ITEM_${key}`, roomName: `PRIVATE_ROOM_${key}`, status: "in_progress", progress: key === "a" ? 75 : 25, currentRound: 0} as never);
  }
  return f;
}
