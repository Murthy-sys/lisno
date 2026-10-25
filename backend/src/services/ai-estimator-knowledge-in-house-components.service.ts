import type { ClientSession } from "mongoose";
import type { KnowledgeInHouseComponent } from "../domain/ai-estimator-knowledge-in-house-components.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";

/** Share writes with catalogue edits/deletion before freezing a selected component scope. */
export async function lockInHouseComponentReferences(
  components: readonly Pick<KnowledgeInHouseComponent, "id" | "basketId" | "subBasketId">[],
  session: ClientSession
): Promise<Set<string>> {
  const unavailable = new Set<string>();
  for (const basketId of [...new Set(components.map((component) => component.basketId))].sort()) {
    const basket = await AiEstimatorKnowledgeBasketModel.findOneAndUpdate({ _id: basketId, status: "active" },
      { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false, returnDocument: "after", runValidators: true })
      .select({ _id: 1 }).lean().exec();
    if (!basket) for (const component of components.filter((row) => row.basketId === basketId)) unavailable.add(component.id);
  }
  const references = new Map(components.filter((row) => row.subBasketId !== null).map((row) => [JSON.stringify([row.basketId, row.subBasketId]), row]));
  for (const [, component] of [...references.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const subBasket = await AiEstimatorKnowledgeSubBasketModel.findOneAndUpdate({ _id: component.subBasketId, basketId: component.basketId },
      { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false, returnDocument: "after", runValidators: true })
      .select({ _id: 1 }).lean().exec();
    if (!subBasket) for (const row of components.filter((row) => row.basketId === component.basketId && row.subBasketId === component.subBasketId)) unavailable.add(row.id);
  }
  return unavailable;
}
