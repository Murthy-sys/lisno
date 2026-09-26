import type { MobileRuntime } from "../../runtime/createRuntime";
import {
  clientEstimateListKey,
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
    const post = jest.fn().mockResolvedValue({ id: "estimate/a", projectId: "project/a", status: "client_approved" });
    const runtime = runtimeWith(get, post);
    const scope = { environmentId: "qa-one", userId: "client-one" };
    expect(clientEstimateListKey(scope)).toEqual(["qa-one", "client-one", "estimates", "estimates", "/client/estimates"]);
    await getClientEstimates(runtime);
    expect(get).toHaveBeenCalledWith("/client/estimates", { signal: undefined });
    await expect(decideClientEstimate(runtime, "estimate/a", "approve", "  looks good  ")).resolves.toMatchObject({ projectId: "project/a" });
    expect(post).toHaveBeenCalledWith("/client/estimates/estimate%2Fa/decision", { decision: "approve", note: "looks good" });
    expect(clientPlanPageImagePath("page/a")).toBe("/client/estimate-plan-pages/page%2Fa/current-image");
  });

  it("keeps preview revision, snapshot, and idempotency fields distinct on submission", async () => {
    const post = jest.fn()
      .mockResolvedValueOnce({ pageRevisionNumber: 7, snapshotToken: "snapshot", targets: [{ drawingId: "drawing-a", title: "Kitchen", reason: "area_overlap" }] })
      .mockResolvedValueOnce({ id: "request-a" });
    const runtime = runtimeWith(jest.fn(), post);
    const annotations = { schemaVersion: 1 as const, imageWidth: 100, imageHeight: 200, elements: [] };
    const preview = await previewClientPlanTargets(runtime, "page-a", annotations);
    await submitClientPlanRequest(runtime, "page-a", {
      version: preview.pageRevisionNumber,
      summary: "Move the partition",
      annotations,
      targetDrawingIds: [preview.targets[0]!.drawingId],
      snapshotToken: preview.snapshotToken,
      idempotencyKey: "request-key-a"
    });
    expect(post).toHaveBeenNthCalledWith(2, "/client/estimate-plan-pages/page-a/change-requests", {
      version: 7,
      summary: "Move the partition",
      annotations,
      targetDrawingIds: ["drawing-a"],
      snapshotToken: "snapshot",
      idempotencyKey: "request-key-a"
    });
  });
});
