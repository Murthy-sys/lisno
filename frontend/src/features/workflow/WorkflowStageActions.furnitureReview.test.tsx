import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { WorkflowStageActions } from "./WorkflowStageActions";
import type { DesignWorkflowStage, DesignWorkflowView, FurnitureReviewEvidence } from "./projectWorkflowApi";

const files: FurnitureReviewEvidence[] = [
  { eventId: "measurement-a", filename: "site-sketch.pdf", mimeType: "application/pdf", byteSize: 1024, source: "site_measurement" },
  { eventId: "measurement-a", mediaId: "photo-a", filename: "living-room.jpg", mimeType: "image/jpeg", byteSize: 2048, source: "site_measurement" },
  { eventId: "measurement-a", mediaId: "video-a", filename: "walkthrough.mp4", mimeType: "video/mp4", byteSize: 4096, source: "site_measurement" },
  { eventId: "declaration-a", filename: "requirements.pdf", mimeType: "application/pdf", byteSize: 512, source: "furniture_requirements" }
];
const createUrl = vi.fn(() => "blob:review");
const revokeUrl = vi.fn();
const response = (type = "application/pdf") => ({ blob: new Blob(["synthetic evidence"], { type }), filename: "evidence" });

function fixture(evidence = files) {
  const stage: DesignWorkflowStage = {
    id: "project-a:furniture", type: "existing_furniture_dimensions", name: "Collection of existing furniture dimensions", order: 4,
    status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, dependencyStageIds: [], tasks: [],
    operational: {
      status: "in_progress", version: 9,
      availableActions: [{ id: "furniture_accept", label: "Accept furniture requirements", actor: "client", requiresProof: false }],
      furniture: { phase: "awaiting_client_acceptance", notApplicable: false, requiredRoomCount: 1, readyRoomCount: 0, pendingRoomCount: 1, evidence },
      rooms: [{ id: "bedroom", name: "Bedroom", required: true, hasDimensions: false, canProceed: false }, { id: "living", name: "Living room", required: false, hasDimensions: false, canProceed: true }],
      timing: { state: "running", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0, band: null },
      blockingReasons: [], facts: [], history: [{ id: "private-event", action: "furniture_scope", actorName: "Designer A", actorRole: "designer", onBehalfOfClient: false, at: "2026-09-17T09:00:00Z", note: "Private internal note", proofAvailable: true }]
    }
  };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-17T09:00:00Z", projectStages: [stage], floors: [] };
  return { workflow, stage };
}
function setup(data = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...data, ...render(<WorkflowStageActions {...data} presentation="client" />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }) };
}
beforeEach(() => {
  createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.spyOn(apiClient, "getBlob").mockResolvedValue(response());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Client furniture evidence review", () => {
  it("shows saved rooms and evidence before acceptance, without eagerly fetching files or private history", async () => {
    setup();
    const review = screen.getByRole("region", { name: "Review furniture requirements" });
    const accept = screen.getByRole("button", { name: "Accept furniture requirements" });
    expect(review.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Saved room requirements" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["BedroomDimensions required", "Living roomDimensions not required"]);
    files.forEach((file) => expect(within(review).getByText(file.filename)).toBeVisible());
    expect(screen.queryByText("Private internal note")).not.toBeInTheDocument();
    expect(screen.queryByText("Action history")).not.toBeInTheDocument();
    expect(apiClient.getBlob).not.toHaveBeenCalled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it.each([[0, "application/pdf", "iframe"], [1, "image/jpeg", "img"], [2, "video/mp4", "video"]] as const)("previews selected file %s through its protected endpoint and releases it on close", async (index, mime, tag) => {
    vi.mocked(apiClient.getBlob).mockResolvedValue(response(mime));
    setup();
    const user = userEvent.setup(); const file = files[index]!;
    await user.click(screen.getByRole("button", { name: `View ${file.filename}` }));
    const dialog = screen.getByRole("dialog", { name: file.filename });
    await waitFor(() => expect(dialog.querySelector(tag)).toHaveAttribute("src", "blob:review"));
    expect(apiClient.getBlob).toHaveBeenCalledTimes(1);
    expect(apiClient.getBlob).toHaveBeenCalledWith(`/projects/project-a/design-workflow/history/measurement-a/${file.mediaId ? `media/${file.mediaId}` : "proof"}`, expect.objectContaining({ signal: expect.any(AbortSignal), showGlobalLoader: false }));
    const signal = vi.mocked(apiClient.getBlob).mock.calls[0]![1]!.signal!;
    await user.click(within(dialog).getByRole("button", { name: `Close ${file.filename}` }));
    expect(signal.aborted).toBe(true);
    expect(revokeUrl).toHaveBeenCalledWith("blob:review");
    expect(screen.getByRole("button", { name: `View ${file.filename}` })).toHaveFocus();
  });

  it("downloads the exact declaration file with protected IDs", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Download requirements.pdf" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(apiClient.getBlob).toHaveBeenCalledWith("/projects/project-a/design-workflow/history/declaration-a/proof");
  });

  it("loads no files while paging a large collection and reaches the last upload", async () => {
    setup(fixture(Array.from({ length: 33 }, (_, index) => ({ ...files[1]!, mediaId: `photo-${index}`, filename: `photo-${index}.jpg` }))));
    const list = screen.getByRole("list", { name: "Files for furniture review" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(25);
    await userEvent.setup().click(screen.getByRole("button", { name: "Next files" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText("photo-32.jpg")).toBeVisible();
    expect(apiClient.getBlob).not.toHaveBeenCalled();
  });

  it("offers retry after a network failure and download for unpreviewable response types", async () => {
    vi.mocked(apiClient.getBlob).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response("text/html"));
    setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "View site-sketch.pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/cannot be previewed in your browser/)).toBeVisible();
    expect(screen.getByRole("dialog").querySelector("iframe,img,video")).toBeNull();
    expect(createUrl).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Download site-sketch.pdf" })).toBeEnabled();
  });

  it("unlocks file pagination when an in-flight download is removed at the same version", async () => {
    const evidence = Array.from({ length: 33 }, (_, index) => ({ ...files[1]!, mediaId: `photo-${index}`, filename: `photo-${index}.jpg` }));
    let resolve!: (value: ReturnType<typeof response>) => void;
    vi.mocked(apiClient.getBlob).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { workflow, stage, rerender } = setup(fixture(evidence)); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Download photo-0.jpg" }));
    expect(screen.getByRole("button", { name: "Next files" })).toBeDisabled();
    rerender(<WorkflowStageActions workflow={workflow} stage={{ ...stage, operational: { ...stage.operational!, furniture: { ...stage.operational!.furniture!, evidence: evidence.slice(1) } } }} presentation="client" />);
    expect(screen.getByRole("button", { name: "Next files" })).toBeEnabled();
    await act(async () => resolve(response("image/jpeg")));
    expect(createUrl).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Next files" }));
    expect(screen.getByText("photo-32.jpg")).toBeVisible();
  });

  it("shows download fallback when the browser cannot decode the selected video", async () => {
    vi.mocked(apiClient.getBlob).mockResolvedValue(response("video/mp4"));
    setup(); await userEvent.setup().click(screen.getByRole("button", { name: "View walkthrough.mp4" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.querySelector("video")).not.toBeNull());
    fireEvent.error(dialog.querySelector("video")!);
    expect(screen.getByRole("alert")).toHaveTextContent("could not display");
    expect(within(dialog).getByRole("button", { name: "Download walkthrough.mp4" })).toBeEnabled();
  });

  it("unlocks pagination when a downloading row moves to another page on refresh", async () => {
    const evidence = Array.from({ length: 33 }, (_, index) => ({ ...files[1]!, mediaId: `photo-${index}`, filename: `photo-${index}.jpg` }));
    let resolve!: (value: ReturnType<typeof response>) => void;
    vi.mocked(apiClient.getBlob).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { workflow, stage, rerender } = setup(fixture(evidence)); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next files" }));
    await user.click(screen.getByRole("button", { name: "Download photo-25.jpg" }));
    expect(screen.getByRole("button", { name: "Previous files" })).toBeDisabled();
    rerender(<WorkflowStageActions workflow={workflow} stage={{ ...stage, operational: { ...stage.operational!, furniture: { ...stage.operational!.furniture!, evidence: evidence.slice(1) } } }} presentation="client" />);
    expect(screen.getByRole("button", { name: "Previous files" })).toBeEnabled();
    await act(async () => resolve(response("image/jpeg")));
    await user.click(screen.getByRole("button", { name: "Previous files" }));
    expect(screen.getByText("photo-25.jpg")).toBeVisible();
  });

  it.each(["close", "project", "version", "source removal", "source replacement", "unmount"])("aborts pending preview and ignores a late response on %s", async (change) => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    vi.mocked(apiClient.getBlob).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { workflow, stage, rerender, unmount } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "View site-sketch.pdf" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading file");
    const signal = vi.mocked(apiClient.getBlob).mock.calls[0]![1]!.signal!;
    if (change === "close") await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close site-sketch.pdf" }));
    else if (change === "unmount") unmount();
    else rerender(<WorkflowStageActions workflow={{ ...workflow, projectId: change === "project" ? "project-b" : workflow.projectId }} stage={{ ...stage, operational: { ...stage.operational!, version: change === "version" ? 10 : 9, furniture: { ...stage.operational!.furniture!, evidence: change === "source removal" ? [] : change === "source replacement" ? files.map((file) => ({ ...file, filename: `updated-${file.filename}` })) : files } } }} presentation="client" />);
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(response()));
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the review visible during acceptance and blocks a stale open form", async () => {
    const post = vi.spyOn(apiClient, "post");
    const { workflow, stage, rerender } = setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Accept furniture requirements" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("site-sketch.pdf")).toBeVisible();
    expect(screen.getByRole("list", { name: "Saved room requirements" })).toBeVisible();
    rerender(<WorkflowStageActions workflow={workflow} stage={{ ...stage, operational: { ...stage.operational!, version: 10 } }} presentation="client" />);
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    fireEvent.submit(screen.getByRole("form"));
    expect(post).not.toHaveBeenCalled();
  });

  it("allows acceptance without optional evidence while keeping the authoritative version", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 10 });
    const data = fixture([]);
    data.stage.operational!.furniture!.notApplicable = true;
    data.stage.operational!.rooms = [];
    setup(data); const user = userEvent.setup();
    expect(screen.getByText("No existing furniture dimensions are needed.")).toBeVisible();
    expect(screen.getByText(/No documents or site media/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Accept furniture requirements" }));
    await user.click(screen.getByRole("button", { name: "Accept furniture requirements" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", expect.objectContaining({ stageId: "project-a:furniture", expectedVersion: 9, action: "furniture_accept", data: {} }), { showGlobalLoader: false });
  });
});
