import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import type { PlanDocumentWorkspace } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import * as api from "./estimateDesignApi";
import { PlanDocuments, usePlanDocuments } from "./PlanDocuments";
import { PlanDocumentPreview } from "./PlanDocumentPreview";

const hash = "a".repeat(64);
function workspace(status: "not_prepared" | "preparing" | "ready" | "failed" = "ready", manifestHash = hash): PlanDocumentWorkspace {
  return { manifestHash, readyForSubmission: status === "ready", reviewRoundId: null, documents: [{ sourceUploadId: "upload-1", originalFilename: "residence.pdf", documentId: status === "not_prepared" ? null : "doc-1", manifestHash, status, pageCount: 3, pdfUrl: status === "ready" ? "/estimates/estimate-1/design-plan-documents/doc-1/pdf" : null, failureCode: status === "failed" ? "PDF_FAILED" : null, failureMessage: status === "failed" ? "Re-export this replacement and try again." : null }] };
}
function Harness({ estimateId = "estimate-1", revision = "1" }: { estimateId?: string; revision?: string }) {
  const state = usePlanDocuments(estimateId, true, true, revision);
  return <><PlanDocuments state={state} /><button disabled={!state.ready}>Submit design</button><button onClick={() => void state.query.refetch()}>Refresh documents</button></>;
}
beforeEach(() => {
  vi.spyOn(api, "getPlanDocuments").mockResolvedValue(workspace());
  vi.spyOn(api, "preparePlanDocuments").mockResolvedValue(workspace());
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:updated-pdf") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => vi.restoreAllMocks());

describe("current full plan preparation", () => {
  it("blocks submission while preparing and enables it only after the current full PDF is ready", async () => {
    vi.mocked(api.getPlanDocuments).mockResolvedValue(workspace("not_prepared"));
    let finish!: (value: PlanDocumentWorkspace) => void;
    vi.mocked(api.preparePlanDocuments).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderWithQuery(<Harness />);
    await waitFor(() => expect(api.preparePlanDocuments).toHaveBeenCalledWith("estimate-1", hash));
    expect(screen.getByRole("button", { name: "Submit design" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Preview updated PDF" })).not.toBeInTheDocument();
    await act(async () => finish(workspace()));
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit design" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Preview updated PDF" })).toBeVisible();
  });

  it("automatically recovers a saved proportions failure and enables submission after preparation", async () => {
    const blocked = workspace("failed");
    blocked.documents[0]!.failureCode = "PLAN_DOCUMENT_ASPECT_MISMATCH";
    blocked.documents[0]!.failureMessage = "The revised drawing proportions do not match its original slot.";
    vi.mocked(api.getPlanDocuments).mockResolvedValue(blocked);
    renderWithQuery(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit design" })).toBeEnabled());
    expect(api.preparePlanDocuments).toHaveBeenCalledExactlyOnceWith("estimate-1", hash);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not loop when the server still rejects an old proportions failure", async () => {
    const blocked = workspace("failed");
    blocked.documents[0]!.failureCode = "PLAN_DOCUMENT_ASPECT_MISMATCH";
    vi.mocked(api.getPlanDocuments).mockResolvedValue(blocked);
    vi.mocked(api.preparePlanDocuments).mockRejectedValue(new ApiError(409, "PLAN_DOCUMENT_ASPECT_MISMATCH", "Refresh after the update."));
    renderWithQuery(<Harness />);
    await screen.findByText("Refresh after the update.");
    await userEvent.click(screen.getByRole("button", { name: "Refresh documents" }));
    expect(api.preparePlanDocuments).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Submit design" })).toBeDisabled();
  });

  it("stops automatic retries after failure and recovers through the explicit retry action", async () => {
    vi.mocked(api.getPlanDocuments).mockResolvedValue(workspace("not_prepared"));
    vi.mocked(api.preparePlanDocuments).mockRejectedValueOnce(new ApiError(409, "PDF_FAILED", "Re-export this replacement and try again."));
    renderWithQuery(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Re-export this replacement");
    expect(api.preparePlanDocuments).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Submit design" })).toBeDisabled();
    const retry = screen.getByRole("button", { name: "Refresh / retry full PDF" });
    await waitFor(() => expect(retry).toBeEnabled());
    await userEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit design" })).toBeEnabled());
    expect(api.preparePlanDocuments).toHaveBeenCalledTimes(2);
  });

  it("refreshes a stale manifest and prepares the newer version without submitting the old one", async () => {
    vi.mocked(api.getPlanDocuments).mockResolvedValue(workspace("not_prepared"));
    vi.mocked(api.preparePlanDocuments).mockImplementationOnce(async () => {
      vi.mocked(api.getPlanDocuments).mockResolvedValue(workspace("not_prepared", "b".repeat(64)));
      throw new ApiError(409, "DESIGN_PLAN_DOCUMENT_STALE", "Refresh the updated plan.");
    }).mockResolvedValue(workspace("ready", "b".repeat(64)));
    renderWithQuery(<Harness />);
    await waitFor(() => expect(api.preparePlanDocuments).toHaveBeenLastCalledWith("estimate-1", "b".repeat(64)));
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit design" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not let a delayed preparation overwrite a newer manifest", async () => {
    let finishOld!: (value: PlanDocumentWorkspace) => void;
    let finishNew!: (value: PlanDocumentWorkspace) => void;
    vi.mocked(api.getPlanDocuments).mockResolvedValue(workspace("not_prepared"));
    vi.mocked(api.preparePlanDocuments).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
    renderWithQuery(<Harness />);
    await waitFor(() => expect(api.preparePlanDocuments).toHaveBeenCalledTimes(1));
    vi.mocked(api.getPlanDocuments).mockResolvedValue(workspace("not_prepared", "b".repeat(64)));
    await userEvent.click(screen.getByRole("button", { name: "Refresh documents" }));
    await act(async () => finishOld(workspace()));
    await waitFor(() => expect(api.preparePlanDocuments).toHaveBeenLastCalledWith("estimate-1", "b".repeat(64)));
    expect(screen.getByRole("button", { name: "Submit design" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Preview updated PDF" })).not.toBeInTheDocument();
    await act(async () => finishNew(workspace("ready", "b".repeat(64))));
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit design" })).toBeEnabled());
  });

  it("hides cached PDF actions and blocks submission if refreshed access is denied", async () => {
    renderWithQuery(<Harness />);
    await screen.findByRole("button", { name: "Preview updated PDF" });
    vi.mocked(api.getPlanDocuments).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access removed."));
    await userEvent.click(screen.getByRole("button", { name: "Refresh documents" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Access removed.");
    expect(screen.queryByRole("button", { name: "Preview updated PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit design" })).toBeDisabled();
  });
});

describe("full PDF preview", () => {
  it("uses the submitted round URL and releases preview bytes when its document identity changes", async () => {
    const pdfUrl = "/client/estimates/estimate-1/design-plan-documents/doc-1/pdf?roundId=round-1";
    vi.spyOn(api, "downloadPlanDocument").mockResolvedValue({ blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }), filename: "submitted.pdf" });
    const doc = { ...workspace().documents[0]!, pdfUrl };
    const view = renderWithQuery(<PlanDocumentPreview document={doc} published />);
    await userEvent.click(screen.getByRole("button", { name: "Preview submitted PDF" }));
    await screen.findByTitle("Full plan: residence.pdf");
    expect(api.downloadPlanDocument).toHaveBeenCalledWith(pdfUrl);
    view.rerender(<PlanDocumentPreview document={{ ...doc, manifestHash: "b".repeat(64) }} published />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:updated-pdf");
    expect(screen.queryByTitle("Full plan: residence.pdf")).not.toBeInTheDocument();
  });

  it("ignores a PDF response that arrives after its preview has closed", async () => {
    let finish!: (value: { blob: Blob; filename: string }) => void;
    vi.spyOn(api, "downloadPlanDocument").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderWithQuery(<PlanDocumentPreview document={workspace().documents[0]!} />);
    await userEvent.click(screen.getByRole("button", { name: "Preview updated PDF" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Close residence.pdf" })[1]!);
    await act(async () => finish({ blob: new Blob(["%PDF"], { type: "application/pdf" }), filename: "updated.pdf" }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByTitle("Full plan: residence.pdf")).not.toBeInTheDocument();
  });
});
