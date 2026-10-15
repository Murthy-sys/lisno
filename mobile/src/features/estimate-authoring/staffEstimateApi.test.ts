import type { MobileRuntime } from "../../runtime/createRuntime";
import { getStaffCatalogue, getStaffEstimate, getStaffEstimateQueue, parseStaffEstimate, retryEstimateEmail, saveStaffEstimate, staffEstimateKey, submitStaffEstimate } from "./staffEstimateApi";
import { catalogueFixture, estimateFixture, leadFixture } from "./__tests__/fixtures";
import { restoreStaffForm, staffFormInput } from "./staffEstimateModel";
function runtime(get = jest.fn(), post = jest.fn(), put = jest.fn()) { return { api: { authenticated: { get, post, put } } } as unknown as MobileRuntime; }
it("binds staff reads and acknowledgements to the requested lead and monotonically advancing save version", async () => {
 const get = jest.fn().mockResolvedValue({ ...estimateFixture(), leadId: "other-lead" }); await expect(getStaffEstimate(runtime(get), "lead-one")).rejects.toThrow("invalid response");
 const input = staffFormInput(restoreStaffForm(estimateFixture(), leadFixture, catalogueFixture), 7); const put = jest.fn().mockResolvedValue(estimateFixture({ version: 8 }));
 await expect(saveStaffEstimate(runtime(undefined, undefined, put), "lead/one", input)).resolves.toMatchObject({ version: 8 }); expect(put).toHaveBeenCalledWith("/leads/lead%2Fone/estimate", expect.objectContaining({ expectedVersion: 7 }));
 put.mockResolvedValue(estimateFixture({ version: 7 })); await expect(saveStaffEstimate(runtime(undefined, undefined, put), "lead-one", input)).rejects.toThrow("invalid response");
});
it("rejects duplicate saved line identities and mismatched configured catalogue IDs", () => {
 const estimate = estimateFixture(); expect(() => parseStaffEstimate({ ...estimate, lineItems: [...estimate.lineItems, ...estimate.lineItems] })).toThrow();
 expect(() => parseStaffEstimate({ ...estimate, lineItems: [{ ...estimate.lineItems[0], catalogueId: "different" }] })).toThrow();
});
it("submits the acknowledged save version and retries email against the same frozen round", async () => {
 const post = jest.fn().mockResolvedValueOnce(estimateFixture({ version: 9, status: "sent_to_client" })).mockResolvedValueOnce({ id: "round-one", version: 4, status: "pending", deliveryStatus: "sent", deliveryAttemptCount: 2, deliveredAt: "2026-10-14T00:00:00Z" });
 await submitStaffEstimate(runtime(undefined, post), "lead-one", 8); expect(post).toHaveBeenNthCalledWith(1, "/leads/lead-one/estimate/submit", { expectedVersion: 8 });
 await retryEstimateEmail(runtime(undefined, post), "estimate-one", { id: "round-one", version: 4 }); expect(post).toHaveBeenNthCalledWith(2, "/estimates/estimate-one/client-email/retry", { roundId: "round-one", version: 4 });
 post.mockResolvedValue({ id: "other-round", version: 4, status: "pending", deliveryStatus: "sent", deliveryAttemptCount: 2, deliveredAt: null }); await expect(retryEstimateEmail(runtime(undefined, post), "estimate-one", { id: "round-one", version: 4 })).rejects.toThrow();
});
it("loads all catalogue pages and rejects duplicate or cross-basket sources including temporary items", async () => {
 const get = jest.fn().mockResolvedValue({ ...catalogueFixture, pagination: { offset: 0, hasMore: false } }); await expect(getStaffCatalogue(runtime(get))).resolves.toMatchObject(catalogueFixture);
 expect(get).toHaveBeenCalledWith("/estimation/catalogue?limit=100&offset=0&includeReadyNonActive=true", { signal: undefined });
 const basket = catalogueFixture.items[0]!; const line = basket.subBaskets[0]!.mainLines[0]!;
 for (const items of [[basket, basket], [{ ...basket, directTemporaryItems: [{ ...line, itemType: "temporary", subBasketId: null, basketId: "wrong-basket" }] }], [{ ...basket, subBaskets: [{ ...basket.subBaskets[0], mainLines: [line, line] }] }]]) {
  get.mockResolvedValue({ items, ineligibleLineCount: 0, pagination: { offset: 0, hasMore: false } }); await expect(getStaffCatalogue(runtime(get))).rejects.toThrow();
 }
});
it("uses scoped keys and the queue's own lead identity without requiring unauthorized lead reads", async () => {
 const get = jest.fn().mockResolvedValue([{ ...estimateFixture(), lead: { ...leadFixture, id: undefined, _id: "lead-one" } }]);
 expect(await getStaffEstimateQueue(runtime(get), "/estimates/review-queue")).toMatchObject([{ leadId: "lead-one", lead: { id: "lead-one" } }]); expect(get).toHaveBeenCalledTimes(1);
 expect(staffEstimateKey({ environmentId: "env-a", userId: "staff-a" }, "lead-one")).not.toEqual(staffEstimateKey({ environmentId: "env-b", userId: "staff-a" }, "lead-one"));
});
