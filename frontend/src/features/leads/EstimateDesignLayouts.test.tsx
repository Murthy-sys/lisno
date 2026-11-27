import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesignLayoutRequirements } from "../../../../shared/projects/designLayoutRequirements";
import { apiClient, ApiError } from "../../api/client";
import type { EstimateDesignUpload, EstimateDesignWorkspace } from "../../api/types";
import { layoutRequirementsFixture } from "../../test/fixtures/designLayoutRequirements";
import { renderWithQuery } from "../../test/render";
import * as api from "./estimateDesignApi";
import { EstimateDesignUploads } from "./EstimateDesignUploads";

const upload: EstimateDesignUpload = {
  id: "root-3d", estimateId: "estimate-a", leadId: "lead-a", originalFilename: "existing-layout.pdf", mimeType: "application/pdf",
  sizeBytes: 1024, uploaderId: "designer-a", uploadedAt: "2026-11-27T00:00:00.000Z", extractionStatus: "estimator_review",
  failureCode: null, failureMessage: null, canRetry: false, canDelete: true, purpose: "ordinary", requestReplacement: null,
  layoutType: "layout_3d", canClassifyLayoutType: false, classificationBlockedReason: null
};

function workspace(requirements: DesignLayoutRequirements = layoutRequirementsFixture()): EstimateDesignWorkspace {
  const mapping = { roomId: "room-a", scopeSectionId: "scope-a", catalogueId: "item-a", mappingStatus: "auto_mapped" as const };
  return {
    layoutRequirements: requirements, uploads: [{ ...upload }],
    pages: [{ id: "page-a", uploadId: upload.id, pageNumber: 1, width: 100, height: 100 }],
    drawings: [{ ...mapping, id: "drawing-a", uploadId: upload.id, sourcePageId: "page-a", estimateId: "estimate-a", active: true, verified: true,
      detectedTitle: "Living room", displayTitle: "Living room", source: "ocr", roomConfidence: 1, scopeConfidence: 1, ocrConfidence: 1, roomEvidence: [], scopeEvidence: [] }],
    revisions: [{ ...mapping, id: "revision-a", drawingId: "drawing-a", revisionNumber: 1, sourcePageId: "page-a", crop: { x: 0, y: 0, width: 100, height: 100 },
      label: "Living room", reviewStatus: "draft", submittedAt: null, reviewerId: null, reviewedAt: null, changeSummary: null, annotationLayerId: null,
      annotations: null, replacementUploadId: null, replacesRevisionId: null }]
  };
}

const props = { estimateId: "estimate-a", rooms: [{ id: "room-a", label: "Living room" }], scopes: [{ id: "scope-a", label: "Interior" }], items: [], variant: "designer" as const };

beforeEach(() => {
  vi.spyOn(api, "getPlanDocuments").mockResolvedValue({ manifestHash: "a".repeat(64), readyForSubmission: true, documents: [], reviewRoundId: null });
  vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "synthetic.png" });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:layout-preview"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("execution-choice layout uploads", () => {
  it("uploads separate 2D and 3D files with explicit multipart types for Option 1", async () => {
    const data = workspace(layoutRequirementsFixture("option_1"));
    vi.spyOn(api, "getEstimateDesignWorkspace").mockResolvedValue(data);
    const send = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue(upload);
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads {...props} />);
    const summary = await screen.findByRole("region", { name: "Required layouts" });
    await waitFor(() => expect(within(summary).getByLabelText("2D layout file")).toBeEnabled());
    const two = new File(["2d"], "layout-2d.pdf", { type: "application/pdf" });
    const three = new File(["3d"], "layout-3d.pdf", { type: "application/pdf" });
    await user.upload(within(summary).getByLabelText("2D layout file"), two);
    await user.click(within(summary).getByRole("button", { name: "Upload 2D layout" }));
    await waitFor(() => expect(within(summary).getByLabelText("3D layout file")).toBeEnabled());
    await user.upload(within(summary).getByLabelText("3D layout file"), three);
    await user.click(within(summary).getByRole("button", { name: "Upload 3D layout" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls.map(call => (call[1] as FormData).get("layoutType"))).toEqual(["layout_2d", "layout_3d"]);
    expect((send.mock.calls[0]![1] as FormData).get("file")).toBe(two);
    expect((send.mock.calls[1]![1] as FormData).get("file")).toBe(three);
    expect(send.mock.calls.every(call => call[0] === "/estimates/estimate-a/design-uploads")).toBe(true);
  });

  it("offers only 3D for Option 2 and submits when existing drawing and PDF checks pass", async () => {
    vi.spyOn(api, "getEstimateDesignWorkspace").mockResolvedValue(workspace());
    const submit = vi.spyOn(api, "submitEstimateDrawings").mockResolvedValue({ submittedCount: 1, deliveryStatus: "disabled" });
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads {...props} />);
    await screen.findByLabelText("3D layout file");
    expect(screen.queryByLabelText("2D layout file")).not.toBeInTheDocument();
    expect(screen.queryByText("2D layout missing")).not.toBeInTheDocument();
    const button = await screen.findByRole("button", { name: "Submit drawings to client" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(submit).toHaveBeenCalledWith("estimate-a");
  });

  it.each(["layout_2d", "layout_3d"] as const)("blocks Option 1 when %s is missing even with ready PDFs", async missing => {
    const requirements = layoutRequirementsFixture("option_1");
    const entry = requirements.coverage.find(item => item.layoutType === missing)!;
    entry.uploadIds = []; entry.qualifyingUploadIds = []; entry.state = "missing";
    requirements.missingTypes = [missing]; requirements.coverageComplete = false;
    vi.spyOn(api, "getEstimateDesignWorkspace").mockResolvedValue(workspace(requirements));
    const submit = vi.spyOn(api, "submitEstimateDrawings");
    renderWithQuery(<EstimateDesignUploads {...props} />);
    const button = await screen.findByRole("button", { name: "Submit drawings to client" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(`${missing === "layout_2d" ? "2D" : "3D"} layout missing`);
    fireEvent.click(button);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(["missing", "waiting", "malformed"])("fails closed for %s requirements without using cached/default types", async state => {
    const data = workspace();
    if (state === "missing") delete data.layoutRequirements;
    else if (state === "waiting") data.layoutRequirements = layoutRequirementsFixture("option_2", {
      status: "waiting_for_choice", choice: null, allowedTypes: [], requiredTypes: [], coverage: [], coverageComplete: false
    });
    else data.layoutRequirements!.allowedTypes = ["layout_2d", "layout_3d"];
    vi.spyOn(api, "getEstimateDesignWorkspace").mockResolvedValue(data);
    renderWithQuery(<EstimateDesignUploads {...props} />);
    await screen.findByRole("button", { name: "Submit drawings to client" });
    expect(screen.queryByLabelText("2D layout file")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("3D layout file")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit drawings to client" })).toBeDisabled();
    const region = screen.getByRole("region", { name: "Required layouts" });
    expect(region).toHaveTextContent(state === "waiting" ? "Waiting for the Client to choose an execution path" : "Layout requirements are unavailable");
  });

  it("requires an explicit one-time label and replays the same command after an uncertain result", async () => {
    const data = workspace();
    data.uploads[0] = { ...upload, layoutType: null, canClassifyLayoutType: true };
    data.layoutRequirements!.coverageComplete = false;
    data.layoutRequirements!.unclassifiedUploadIds = [upload.id];
    vi.spyOn(api, "getEstimateDesignWorkspace").mockImplementation(async () => structuredClone(data));
    const classify = vi.spyOn(api, "classifyEstimateDesignUpload").mockRejectedValueOnce(new TypeError("Connection interrupted")).mockImplementation(async (_id, command) => {
      data.uploads[0] = { ...upload, layoutType: command.layoutType };
      data.layoutRequirements = layoutRequirementsFixture();
      return data.uploads[0]!;
    });
    const user = userEvent.setup();
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    renderWithQuery(<EstimateDesignUploads {...props} />);
    const label = await screen.findByRole("button", { name: "Set layout type for existing-layout.pdf" });
    await user.click(label);
    const dialog = screen.getByRole("dialog", { name: "Set layout type permanently?" });
    expect(within(dialog).getByLabelText("Layout type")).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: "Confirm layout type" })).toBeDisabled();
    expect(within(dialog).queryByRole("option", { name: "2D layout" })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Layout type"), "layout_3d");
    await user.click(within(dialog).getByRole("button", { name: "Confirm layout type" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("save result could not be confirmed");
    await user.click(within(dialog).getByRole("button", { name: "Retry saving layout type" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(classify).toHaveBeenCalledTimes(2);
    expect(classify.mock.calls[0]).toEqual(classify.mock.calls[1]);
    expect(classify.mock.calls[0]![1]).toEqual({ layoutType: "layout_3d", expectedDesignPlanVersion: 0, idempotencyKey: expect.any(String) });
    expect(screen.queryByRole("button", { name: /Set layout type for/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("existing-layout.pdf").closest("li")).toHaveFocus());
    const keys = invalidate.mock.calls.map(call => call[0]?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([
      ["estimate-designs", "estimate-a"], ["estimate-plan-documents", "estimate-a", "draft"], ["project-workflow"],
      ["client", "estimate-designs", "estimate-a"], ["client", "estimate-plan-review", "estimate-a"]
    ]));
  });

  it("cancels classification by keyboard without saving and restores the upload action", async () => {
    const data = workspace();
    data.uploads[0] = { ...upload, layoutType: null, canClassifyLayoutType: true };
    vi.spyOn(api, "getEstimateDesignWorkspace").mockResolvedValue(data);
    const classify = vi.spyOn(api, "classifyEstimateDesignUpload");
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads {...props} />);
    const trigger = await screen.findByRole("button", { name: /Set layout type for/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(classify).not.toHaveBeenCalled();
  });

  it("refreshes a denied classification and does not offer a protected draft another save", async () => {
    const data = workspace();
    data.uploads[0] = { ...upload, layoutType: null, canClassifyLayoutType: true };
    vi.spyOn(api, "getEstimateDesignWorkspace").mockImplementation(async () => structuredClone(data));
    const classify = vi.spyOn(api, "classifyEstimateDesignUpload").mockImplementation(async () => {
      data.uploads[0]!.canClassifyLayoutType = false;
      data.uploads[0]!.classificationBlockedReason = "This file contains approved content.";
      throw new ApiError(409, "LAYOUT_CLASSIFICATION_LOCKED", "This file contains approved content.");
    });
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads {...props} />);
    await user.click(await screen.findByRole("button", { name: "Set layout type for existing-layout.pdf" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Layout type"), "layout_3d");
    await user.click(within(dialog).getByRole("button", { name: "Confirm layout type" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Retry saving layout type" })).toBeDisabled());
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("shows the persisted label when the save response is lost but refresh confirms it", async () => {
    const data = workspace();
    data.uploads[0] = { ...upload, layoutType: null, canClassifyLayoutType: true };
    vi.spyOn(api, "getEstimateDesignWorkspace").mockImplementation(async () => structuredClone(data));
    const classify = vi.spyOn(api, "classifyEstimateDesignUpload").mockImplementation(async () => {
      data.uploads[0] = { ...upload };
      throw new TypeError("Connection interrupted after commit");
    });
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads {...props} />);
    await user.click(await screen.findByRole("button", { name: /Set layout type for/ }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Layout type"), "layout_3d");
    await user.click(within(dialog).getByRole("button", { name: "Confirm layout type" }));
    expect(await within(dialog).findByText("Saved layout type: 3D layout. This label is permanent.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Retry saving layout type" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(classify).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("existing-layout.pdf").closest("li")).toHaveFocus());
  });

  it("disables upload, labeling, and submission when a refresh fails with old data present", async () => {
    const data = workspace();
    data.uploads[0] = { ...upload, layoutType: null, canClassifyLayoutType: true };
    const get = vi.spyOn(api, "getEstimateDesignWorkspace").mockResolvedValue(data);
    const user = userEvent.setup();
    renderWithQuery(<EstimateDesignUploads {...props} />);
    await screen.findByLabelText("3D layout file");
    get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Assignment unavailable"));
    await user.click(screen.getByRole("button", { name: "Refresh layout requirements" }));
    await screen.findByText("Layout requirements could not be refreshed. Refresh before uploading or submitting.");
    expect(screen.getByLabelText("3D layout file")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Set layout type for/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit drawings to client" })).toBeDisabled();
  });

  it("resets selected files and classification dialogs when the estimate changes", async () => {
    const data = workspace();
    data.uploads[0] = { ...upload, layoutType: null, canClassifyLayoutType: true };
    vi.spyOn(api, "getEstimateDesignWorkspace").mockImplementation(async id => ({ ...structuredClone(data), uploads: [{ ...data.uploads[0]!, estimateId: id }] }));
    const user = userEvent.setup();
    let changeEstimate: (id: string) => void = () => {};
    function Harness() {
      const [estimateId, setEstimateId] = useState(props.estimateId);
      changeEstimate = setEstimateId;
      return <EstimateDesignUploads {...props} estimateId={estimateId} />;
    }
    renderWithQuery(<Harness />);
    await user.upload(await screen.findByLabelText("3D layout file"), new File(["private"], "project-a-only.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /Set layout type for/ }));
    act(() => changeEstimate("estimate-b"));
    await screen.findByLabelText("3D layout file");
    expect(screen.queryByText("project-a-only.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload 3D layout" })).toBeDisabled();
  });

  it("shows historical unclassified content as read-only without inferring 3D", async () => {
    const data = workspace();
    data.uploads[0] = { ...upload, layoutType: null, originalFilename: "3d-final.pdf", canClassifyLayoutType: false };
    vi.spyOn(api, "getEstimateDesignWorkspace").mockResolvedValue(data);
    renderWithQuery(<EstimateDesignUploads {...props} readOnly />);
    const list = await screen.findByRole("list", { name: "Design upload status" });
    expect(list).toHaveTextContent("Layout type not set");
    expect(screen.queryByRole("button", { name: /Set layout type for/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("3D layout file")).not.toBeInTheDocument();
  });
});
