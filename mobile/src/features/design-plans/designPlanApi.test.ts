import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
import type { SelectedAsset } from "../../platform/files";
import { assignDesignItem, changePlanRequest, editDesignDrawing, getDesignWorkspace, prepareDesignDocuments, replacePlanRequest, submitDesignDrawings } from "./designPlanApi";
import { cropWithinPage, designTaskOptions, drawingSubmissionIssues, parseDesignWorkspace } from "./designPlanModel";
import { task, workspace, request } from "./__tests__/fixtures";
const asset = { uri: "file:///private/selected.pdf", name: "revised.pdf", mimeType: "application/pdf", size: 123 } as SelectedAsset;
function runtime() { const get = jest.fn(); const post = jest.fn(); const put = jest.fn(); const patch = jest.fn(); const upload = jest.fn(); return { get, post, put, patch, upload, value: { api: { authenticated: { get, post, put, patch } }, transfers: { upload } } as unknown as MobileRuntime }; }
it("rejects another estimate, duplicate source IDs and a cross-drawing revision", () => {
 expect(() => parseDesignWorkspace(workspace, "estimate-b")).toThrow(ApiProtocolError);
 expect(() => parseDesignWorkspace({ ...workspace, pages: [...workspace.pages, workspace.pages[0]] }, "estimate-a")).toThrow(ApiProtocolError);
 expect(() => parseDesignWorkspace({ ...workspace, revisions: [{ ...workspace.revisions[0], drawingId: "drawing-b" }] }, "estimate-a")).toThrow(ApiProtocolError);
});
it("preserves optional verification and Miscellaneous mapping, but requires returned replacements and complete extraction", () => {
 expect(drawingSubmissionIssues(workspace)).toEqual([]);
 expect(drawingSubmissionIssues({ ...workspace, revisions: [{ ...workspace.revisions[0]!, reviewStatus: "changes_requested" }] })).toEqual([expect.stringMatching(/upload a replacement/)]);
 expect(drawingSubmissionIssues({ ...workspace, uploads: [{ ...workspace.uploads[0]!, extractionStatus: "processing" }] })).toEqual([expect.stringMatching(/extraction/)]);
});
it("uses stable room/Main Line IDs when room labels are duplicated and skips unmapped configuration", () => {
 const options = designTaskOptions({ ...task, rooms: task.rooms.map(room => ({ ...room, label: "Bedroom" })), lineItems: [...task.lineItems, { ...task.lineItems[0]!, roomId: "missing" }] });
 expect(options.items).toEqual([expect.objectContaining({ roomId: "room-a", catalogueId: "main-a", roomLabel: "Bedroom" }), expect.objectContaining({ roomId: "room-b", catalogueId: "main-b" })]);
});
it.each([{ x: -1, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 1 }, { x: 799, y: 0, width: 2, height: 1 }, { x: 0, y: 599, width: 1, height: 2 }, { x: .5, y: 0, width: 1, height: 1 }])("rejects invalid crop %p", crop => expect(cropWithinPage(crop, workspace.pages[0]!)).toBe(false));
it("loads an estimate-bound workspace and encodes identifiers", async () => { const api = runtime(); api.get.mockResolvedValue(workspace); await getDesignWorkspace(api.value, "estimate-a"); expect(api.get).toHaveBeenCalledWith("/estimates/estimate-a/design-uploads", { signal: undefined }); });
it("sends the reviewed drawing CAS and refuses a cross-drawing acknowledgement", async () => {
 const api = runtime(); api.patch.mockResolvedValue({ ...workspace.drawings[0], revision: { ...workspace.revisions[0], id: "revision-b", revisionNumber: 4 } });
 const input = { version: 3, displayTitle: "Corrected title", crop: { x: 10, y: 20, width: 200, height: 100 }, verified: true };
 await editDesignDrawing(api.value, "estimate-a", "drawing-a", input); expect(api.patch).toHaveBeenCalledWith("/estimate-design-drawings/drawing-a", input);
 api.patch.mockResolvedValue({ ...workspace.drawings[0], revision: { ...workspace.revisions[0], drawingId: "drawing-b" } }); await expect(editDesignDrawing(api.value, "estimate-a", "drawing-a", input)).rejects.toThrow(ApiProtocolError);
});
it("binds exact estimate item assignment and rejects swapped room acknowledgements", async () => {
 const api = runtime(); const input = { version: 3, roomId: "room-b", catalogueId: "main-b" }; api.put.mockResolvedValue({ ...workspace.drawings[0], ...input, revision: workspace.revisions[0] }); await assignDesignItem(api.value, "estimate-a", "drawing-a", input); expect(api.put).toHaveBeenCalledWith("/estimate-design-drawings/drawing-a/estimate-item", input);
 api.put.mockResolvedValue({ ...workspace.drawings[0], ...input, roomId: "room-a", revision: workspace.revisions[0] }); await expect(assignDesignItem(api.value, "estimate-a", "drawing-a", input)).rejects.toThrow(ApiProtocolError);
});
it("binds full PDF preparation to the current manifest and rejects an old response", async () => {
 const api = runtime(); const docs = { manifestHash: "manifest-a", readyForSubmission: true, reviewRoundId: null, documents: [] }; api.post.mockResolvedValue(docs); await prepareDesignDocuments(api.value, "estimate-a", "manifest-a"); expect(api.post).toHaveBeenCalledWith("/estimates/estimate-a/design-plan-documents/prepare", { expectedManifestHash: "manifest-a" });
 await expect(prepareDesignDocuments(api.value, "estimate-a", "manifest-b")).rejects.toThrow(ApiProtocolError);
});
it("uses request version and target IDs, and preserves conflict denial", async () => {
 const api = runtime(); api.put.mockResolvedValue({ ...request, version: 5 }); await changePlanRequest(api.value, request.id, request.sourcePageId, { version: 4, targetDrawingIds: ["drawing-a"] }); expect(api.put).toHaveBeenCalledWith("/estimate-plan-change-requests/request-a/targets", { version: 4, targetDrawingIds: ["drawing-a"] });
 const denied = new ApiError(409, "STALE", "Changed"); api.put.mockRejectedValue(denied); await expect(changePlanRequest(api.value, request.id, request.sourcePageId, { version: 4, targetDrawingIds: ["drawing-a"] })).rejects.toBe(denied);
});
it("uses identical request replacement identity/version/file and preserves failed delivery as a saved submission", async () => {
 const api = runtime(); const upload = { ...workspace.uploads[0], purpose: "plan_request_replacement", requestReplacement: { requestId: "request-a", requestVersion: 4, sourcePageId: "page-a", targetCount: 1, matches: [], ignoredPageNumbers: [], ignoredPageCount: 0 } }; api.upload.mockReturnValue({ result: Promise.resolve(upload) });
 await replacePlanRequest(api.value, "estimate-a", "request-a", 4, "stable-key-1234", asset); expect(api.upload).toHaveBeenCalledWith(expect.objectContaining({ path: "/estimate-plan-change-requests/request-a/replacement-upload", fileUri: asset.uri, parameters: { version: "4", idempotencyKey: "stable-key-1234" } }));
 api.post.mockResolvedValue({ submittedCount: 1, reviewRoundId: "round-a", designPlanVersion: 4, deliveryStatus: "failed" }); expect(await submitDesignDrawings(api.value, "estimate-a")).toMatchObject({ reviewRoundId: "round-a", deliveryStatus: "failed" });
});
