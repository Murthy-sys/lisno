import { PROTECTED_OPERATIONS } from "../../contracts/operations";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
import type { SelectedAsset } from "../../platform/files";
import { classifyDesignLayout, uploadDesign, assignDesignItem, changePlanRequest, editDesignDrawing, getDesignWorkspace, prepareDesignDocuments, replacePlanRequest, submitDesignDrawings } from "./designPlanApi";
import { cropWithinPage, designTaskOptions, drawingSubmissionIssues, parseDesignWorkspace } from "./designPlanModel";
import { layoutWorkspace, session, task, workspace, request } from "./__tests__/fixtures";
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

it("requires valid backend layout requirements without inventing a fallback", () => {
 const selected = layoutWorkspace("option_2");
 expect(() => parseDesignWorkspace({ ...selected, layoutRequirements: undefined }, "estimate-a")).toThrow(ApiProtocolError);
 expect(() => parseDesignWorkspace({ ...selected, layoutRequirements: { ...selected.layoutRequirements, allowedTypes: ["layout_2d", "layout_3d"] } }, "estimate-a")).toThrow(ApiProtocolError);
 expect(() => parseDesignWorkspace({ ...selected, layoutRequirements: { ...selected.layoutRequirements, choice: { ...selected.layoutRequirements.choice, optionId: "option_1" } } }, "estimate-a")).toThrow(ApiProtocolError);
 expect(() => parseDesignWorkspace({ ...selected, uploads: selected.uploads.map(upload => ({ ...upload, layoutType: "layout_2d" })) }, "estimate-a")).toThrow(ApiProtocolError);
 expect(parseDesignWorkspace({ ...selected, layoutRequirements: { ...selected.layoutRequirements, designPlanVersion: 0 } }, "estimate-a").layoutRequirements.designPlanVersion).toBe(0);
});
it("sends ordinary layout type and rejects a mismatched saved classification", async () => {
 const api = runtime(); api.upload.mockReturnValue({ result: Promise.resolve({ ...workspace.uploads[0], layoutType: "layout_3d" }) });
 await uploadDesign(api.value, "estimate-a", asset, undefined, undefined, "layout_3d"); expect(api.upload).toHaveBeenCalledWith(expect.objectContaining({ parameters: { layoutType: "layout_3d" } }));
 await expect(uploadDesign(api.value, "estimate-a", asset, undefined, undefined, "layout_2d")).rejects.toThrow(ApiProtocolError);
});
it("binds classification acknowledgement to the original upload, estimate and chosen type", async () => {
 const api = runtime(); const input = { layoutType: "layout_3d" as const, expectedDesignPlanVersion: 0, idempotencyKey: "stable-layout-key" }; const saved = { ...workspace.uploads[0], layoutType: "layout_3d", canClassifyLayoutType: false };
 api.patch.mockResolvedValue(saved); await classifyDesignLayout(api.value, "estimate-a", "upload-a", input); expect(api.patch).toHaveBeenCalledWith("/estimate-design-uploads/upload-a/layout-type", input);
 for (const change of [{ id: "upload-b" }, { estimateId: "estimate-b" }, { layoutType: "layout_2d" }, { canClassifyLayoutType: true }]) { api.patch.mockResolvedValue({ ...saved, ...change }); await expect(classifyDesignLayout(api.value, "estimate-a", "upload-a", input)).rejects.toThrow(ApiProtocolError); }
});
it("uses the existing personal upload permission for one-time layout classification", () => {
 const operation = "PATCH /estimate-design-uploads/:uploadId/layout-type";
 expect(PROTECTED_OPERATIONS.filter(entry => entry.operation === operation)).toEqual([{ operation, permission: "estimation.design_upload.create", superAdminBehavior: "deny_personal" }]);
 expect(canPerformOperation(session, operation)).toBe(true);
 expect(canPerformOperation({ ...session, authorization: { ...session.authorization, permissions: [] } }, operation)).toBe(false);
 expect(canPerformOperation({ ...session, user: { ...session.user, role: "super_admin" }, authorization: { ...session.authorization, role: "super_admin" } }, operation)).toBe(false);
});
