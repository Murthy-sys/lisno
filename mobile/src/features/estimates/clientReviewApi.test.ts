import type { MobileRuntime } from "../../runtime/createRuntime";
import {
  clientEstimateListKey,
  clientEstimatePdfPath,
  clientPlanPageImagePath,
  decideClientEstimate,
  getClientEstimates,
  previewClientPlanTargets,
  submitClientPlanRequest
} from "./clientReviewApi";

function runtimeWith(get: jest.Mock, post: jest.Mock): MobileRuntime {
  return { api: { authenticated: { get, post } } } as unknown as MobileRuntime;
}

describe("client review API", () => {
  it("uses the existing scoped estimate-list key and exact client routes", async () => {
    const get = jest.fn().mockResolvedValue([]);
    const post = jest.fn().mockResolvedValue({ id: "estimate/a", projectId: "project/a", status: "client_approved", publishedReview: { id: "round/a", version: 5, status: "approved" } });
    const runtime = runtimeWith(get, post);
    const scope = { environmentId: "qa-one", userId: "client-one" };
    expect(clientEstimateListKey(scope)).toEqual(["qa-one", "client-one", "estimates", "estimates", "/client/estimates"]);
    await getClientEstimates(runtime);
    expect(get).toHaveBeenCalledWith("/client/estimates", { signal: undefined });
    await expect(decideClientEstimate(runtime, "estimate/a", "approve", "  looks good  ", { id: "round/a", version: 4 })).resolves.toMatchObject({ projectId: "project/a" });
    expect(post).toHaveBeenCalledWith("/client/estimates/estimate%2Fa/decision", { decision: "approve", note: "looks good", reviewRoundId: "round/a", reviewRoundVersion: 4 });
    expect(clientEstimatePdfPath("estimate/a", "round/a")).toBe("/client/estimates/estimate%2Fa/pdf?roundId=round%2Fa");
    expect(clientPlanPageImagePath("page/a")).toBe("/client/estimate-plan-pages/page%2Fa/current-image");
  });

  it("keeps preview revision, snapshot, and idempotency fields distinct on submission", async () => {
    const post = jest.fn()
      .mockResolvedValueOnce({ pageRevisionNumber: 7, snapshotToken: "snapshot", targets: [{ drawingId: "drawing-a", title: "Kitchen", reason: "area_overlap" }] })
      .mockResolvedValueOnce({ id: "request-a" });
    const runtime = runtimeWith(jest.fn(), post);
    const annotations = { schemaVersion: 1 as const, imageWidth: 100, imageHeight: 200, elements: [] };
    const preview = await previewClientPlanTargets(runtime, "page-a", annotations, "design-round-a");
    await submitClientPlanRequest(runtime, "page-a", {
      reviewRoundId: "design-round-a",
      version: preview.pageRevisionNumber,
      summary: "Move the partition",
      annotations,
      targetDrawingIds: [preview.targets[0]!.drawingId],
      snapshotToken: preview.snapshotToken,
      idempotencyKey: "request-key-a"
    });
    expect(post).toHaveBeenNthCalledWith(1, "/client/estimate-plan-pages/page-a/target-preview", { annotations, reviewRoundId: "design-round-a" });
    expect(post).toHaveBeenNthCalledWith(2, "/client/estimate-plan-pages/page-a/change-requests", {
      reviewRoundId: "design-round-a",
      version: 7,
      summary: "Move the partition",
      annotations,
      targetDrawingIds: ["drawing-a"],
      snapshotToken: "snapshot",
      idempotencyKey: "request-key-a"
    });
  });
});

 it("rejects mismatched estimate, round, version or decision acknowledgements", async () => {
   for (const payload of [
     { id: "other-estimate", status: "client_approved", publishedReview: { id: "round-a", version: 2, status: "approved" } },
     { id: "estimate-a", status: "client_approved", publishedReview: { id: "other-round", version: 2, status: "approved" } },
     { id: "estimate-a", status: "client_approved", publishedReview: { id: "round-a", version: 1, status: "approved" } },
     { id: "estimate-a", status: "client_changes_requested", publishedReview: { id: "round-a", version: 2, status: "changes_requested" } }
   ]) {
     const runtime = runtimeWith(jest.fn(), jest.fn().mockResolvedValue(payload));
     await expect(decideClientEstimate(runtime, "estimate-a", "approve", "", { id: "round-a", version: 1 })).rejects.toThrow("The service returned an invalid response.");
   }
 });
