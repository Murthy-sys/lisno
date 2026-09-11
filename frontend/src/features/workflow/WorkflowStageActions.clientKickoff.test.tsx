import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { WorkflowStageActions } from "./WorkflowStageActions";
import type { DesignWorkflowStage, DesignWorkflowView } from "./projectWorkflowApi";

const acknowledgement = "I have reviewed the document submitted by the Designer";
const createUrl = vi.fn(() => "blob:internal-proof");
const revokeUrl = vi.fn();
const proof = (mimeType = "application/pdf") => ({ blob: new Blob(["Internal kickoff checklist"], { type: mimeType }), filename: "internal-checklist.pdf" });

function fixture() {
  const stage: DesignWorkflowStage = {
    id: "project-a:client-kickoff", type: "client_kickoff", name: "Client Kick off", order: 1,
    status: "in_progress", progress: 0, deadlineAt: null, deadlineTaskId: null, dependencyStageIds: [], tasks: [],
    operational: {
      status: "in_progress", version: 4,
      availableActions: [{ id: "client_kickoff_complete", label: "Complete Client Kick off", actor: "client", requiresProof: false }],
      submittedDocument: { eventId: "internal-event-a", filename: "internal-checklist.pdf", mimeType: "application/pdf", uploadedAt: "2026-09-11T09:00:00.000Z" },
      timing: { state: "running", startsAt: "2026-09-11T09:00:00.000Z", targetAt: "2026-09-15T09:00:00.000Z", originalTargetAt: "2026-09-15T09:00:00.000Z", endsAt: null, remainingMs: 345600000, clockOwner: "designer", designerElapsedMs: 0, clientElapsedMs: 0, band: "green" },
      blockingReasons: [], facts: [], history: [{ id: "client-request", action: "client_kickoff_request", actorName: "Designer A", actorRole: "designer", onBehalfOfClient: false, at: "2026-09-11T09:00:00.000Z", note: "Private internal history", proofAvailable: false }]
    }
  };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-11T09:00:00.000Z", projectStages: [stage], floors: [] };
  return { workflow, stage };
}

function setup(data = fixture(), presentation: "client" | "full" = "client") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<WorkflowStageActions key={data.workflow.projectId} {...data} presentation={presentation} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  });
  return { ...view, ...data, client };
}

async function viewDocument(user: ReturnType<typeof userEvent.setup>, filename = "internal-checklist.pdf") {
  const button = screen.getByRole("button", { name: `View ${filename}` });
  expect(button).toHaveTextContent("View document");
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByRole("region", { name: "Designer’s Internal Kick off document" }).querySelector("img, iframe")).toBeNull();
  await user.click(button);
  return screen.getByRole("dialog", { name: filename });
}

beforeEach(() => {
  createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.spyOn(apiClient, "getBlob").mockResolvedValue(proof());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Client Kick off document review", () => {
  it("opens only the committed Internal proof from View document and submits its exact event ID after acknowledgement", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    setup();
    expect(screen.getByText("internal-checklist.pdf")).toBeVisible();
    const save = screen.getByRole("button", { name: "Complete Client Kick off" });
    expect(save).toBeDisabled();
    const dialog = await viewDocument(user);
    expect(within(dialog).getByTitle("Designer’s Internal Kick off document: internal-checklist.pdf")).toHaveAttribute("src", "blob:internal-proof");
    await user.click(within(dialog).getByRole("button", { name: "Close internal-checklist.pdf" }));
    expect(screen.queryByTitle("Designer’s Internal Kick off document: internal-checklist.pdf")).not.toBeInTheDocument();
    expect(apiClient.getBlob).toHaveBeenCalledWith("/projects/project-a/design-workflow/history/internal-event-a/proof");
    expect(screen.queryByText("Private internal history")).not.toBeInTheDocument();
    expect(screen.queryByText("Action history")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Note" })).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("form"));
    expect(post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: acknowledgement }));
    await user.click(save);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", expect.objectContaining({
      stageId: "project-a:client-kickoff", action: "client_kickoff_complete", expectedVersion: 4,
      data: { reviewedDocumentEventId: "internal-event-a" }, note: ""
    }), { showGlobalLoader: false });
  });

  it("holds acknowledgement disabled while the authenticated proof loads", async () => {
    let resolve!: (value: ReturnType<typeof proof>) => void;
    vi.mocked(apiClient.getBlob).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the Designer’s document");
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Complete Client Kick off" })).toBeDisabled();
    await act(async () => resolve(proof()));
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Complete Client Kick off" })).toBeDisabled();
  });

  it("fails closed without a submitted-document reference even if a stale capability allows completion", () => {
    const data = fixture();
    delete data.stage.operational!.submittedDocument;
    const post = vi.spyOn(apiClient, "post");
    setup(data);
    expect(screen.getByText("The Designer’s Internal Kick off document is not available yet.")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(post).not.toHaveBeenCalled();
    expect(apiClient.getBlob).not.toHaveBeenCalled();
  });

  it("respects a disabled backend action while preserving document access", async () => {
    const data = fixture();
    data.stage.operational!.availableActions[0]!.disabledReason = "Complete Internal Kick off first.";
    setup(data);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Client Kick off" })).toBeDisabled();
    expect(screen.getByText("Complete Internal Kick off first.")).toBeVisible();
    const user = userEvent.setup();
    const dialog = await viewDocument(user);
    expect(within(dialog).getByTitle("Designer’s Internal Kick off document: internal-checklist.pdf")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Close internal-checklist.pdf" }));
  });

  it("shows a recoverable proof error and retries the same Internal document", async () => {
    vi.mocked(apiClient.getBlob).mockRejectedValueOnce(new Error("Unavailable"));
    const user = userEvent.setup();
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Designer’s document could not be loaded");
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry document" }));
    const dialog = await viewDocument(user);
    expect(within(dialog).getByTitle("Designer’s Internal Kick off document: internal-checklist.pdf")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Close internal-checklist.pdf" }));
    expect(apiClient.getBlob).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiClient.getBlob).mock.calls.every(([path]) => path === "/projects/project-a/design-workflow/history/internal-event-a/proof")).toBe(true);
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled();
  });

  it.each(["document", "version"])("clears review and blocks stale submission when the %s changes, requiring reopening", async (change) => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 6 });
    const user = userEvent.setup();
    const { workflow, stage, rerender } = setup();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: acknowledgement }));
    const updatedStage = { ...stage, operational: { ...stage.operational!, ...(change === "version" ? { version: 5 } : {
      submittedDocument: { ...stage.operational!.submittedDocument!, eventId: "internal-event-revised", filename: "revised-internal.pdf" }
    }) } };
    rerender(<WorkflowStageActions key={workflow.projectId} workflow={workflow} stage={updatedStage} presentation="client" />);
    expect(screen.getByRole("checkbox", { name: acknowledgement })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Complete Client Kick off" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    fireEvent.submit(screen.getByRole("form"));
    expect(post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Complete Client Kick off" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: acknowledgement }));
    await user.click(screen.getByRole("button", { name: "Complete Client Kick off" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ expectedVersion: change === "version" ? 5 : 4, data: { reviewedDocumentEventId: change === "document" ? "internal-event-revised" : "internal-event-a" } }));
  });

  it("clears acknowledgement when an image cannot render and requires reviewing it again after retry", async () => {
    vi.mocked(apiClient.getBlob).mockResolvedValue(proof("image/png"));
    const user = userEvent.setup(); setup();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: acknowledgement }));
    const dialog = await viewDocument(user);
    const image = within(dialog).getByRole("img", { name: "Designer’s Internal Kick off document: internal-checklist.pdf" });
    fireEvent.error(image);
    expect(screen.getByRole("checkbox", { name: acknowledgement })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry document" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: acknowledgement })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Complete Client Kick off" })).toBeDisabled();
    const retriedDialog = await viewDocument(user);
    expect(within(retriedDialog).getByRole("img", { name: "Designer’s Internal Kick off document: internal-checklist.pdf" })).toBeVisible();
    await user.click(within(retriedDialog).getByRole("button", { name: "Close internal-checklist.pdf" }));
  });

  it("keeps Client representative proof mandatory alongside review and prevents duplicate saves", async () => {
    const data = fixture(); data.stage.operational!.availableActions[0]!.requiresProof = true;
    let resolve!: (value: { version: number }) => void;
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const user = userEvent.setup();
    setup(data, "full");
    await user.click(screen.getByRole("button", { name: "Complete Client Kick off" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: acknowledgement }));
    fireEvent.submit(screen.getByRole("form"));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("required evidence file");
    await user.upload(screen.getByLabelText(/Client action proof/), new File(["Client confirmation"], "client-consent.pdf", { type: "application/pdf" }));
    fireEvent.submit(screen.getByRole("form")); fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(post.mock.calls[0]![1].get("data")))).toEqual({ reviewedDocumentEventId: "internal-event-a" });
    expect(post.mock.calls[0]![1].get("file")).toBeInstanceOf(File);
    await act(async () => resolve({ version: 5 }));
  });

  it("retains completed-stage image viewing and authenticated download without completion controls", async () => {
    vi.mocked(apiClient.getBlob).mockResolvedValue(proof("image/png"));
    const data = fixture(); data.stage.status = "completed"; data.stage.operational!.status = "completed"; data.stage.operational!.availableActions = [];
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const user = userEvent.setup(); const { unmount } = setup(data);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const dialog = await viewDocument(user);
    expect(within(dialog).getByRole("img")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Close internal-checklist.pdf" }));
    await user.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(apiClient.getBlob).toHaveBeenCalledTimes(2);
    unmount(); expect(revokeUrl).toHaveBeenCalledWith("blob:internal-proof");
  });

  it("discards a previous project’s late proof without leaking its preview or review state", async () => {
    let resolve!: (value: ReturnType<typeof proof>) => void;
    vi.mocked(apiClient.getBlob).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { rerender } = setup();
    const next = fixture(); next.workflow.projectId = "project-b"; next.stage.id = "project-b:client-kickoff";
    next.stage.operational!.submittedDocument = { ...next.stage.operational!.submittedDocument!, eventId: "internal-event-b", filename: "project-b.png" };
    vi.mocked(apiClient.getBlob).mockResolvedValue(proof("image/png"));
    rerender(<WorkflowStageActions key={next.workflow.projectId} {...next} presentation="client" />);
    const user = userEvent.setup();
    const dialog = await viewDocument(user, "project-b.png");
    expect(within(dialog).getByRole("img", { name: "Designer’s Internal Kick off document: project-b.png" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Close project-b.png" }));
    await act(async () => resolve(proof()));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("internal-checklist.pdf")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Designer’s Internal Kick off document: internal-checklist.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: acknowledgement })).not.toBeChecked();
    expect(apiClient.getBlob).toHaveBeenLastCalledWith("/projects/project-b/design-workflow/history/internal-event-b/proof");
  });

  it.each(["text/html", "image/svg+xml"])("does not embed an unsupported %s document response", async (mimeType) => {
    vi.mocked(apiClient.getBlob).mockResolvedValue(proof(mimeType));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot be previewed");
    expect(createUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeDisabled();
  });

  it("ignores a late download from the old document after reviewing its replacement", async () => {
    const user = userEvent.setup();
    const { workflow, stage, rerender } = setup();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled());
    let resolve!: (value: ReturnType<typeof proof>) => void;
    vi.mocked(apiClient.getBlob).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await user.click(screen.getByRole("button", { name: "Download" }));
    const updatedStage = { ...stage, operational: { ...stage.operational!, submittedDocument: { ...stage.operational!.submittedDocument!, eventId: "replacement-event", filename: "replacement.pdf" } } };
    rerender(<WorkflowStageActions key={workflow.projectId} workflow={workflow} stage={updatedStage} presentation="client" />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Complete Client Kick off" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: acknowledgement }));
    await act(async () => resolve(proof()));
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeChecked();
    expect(screen.getByRole("button", { name: "Complete Client Kick off" })).toBeEnabled();
    expect(screen.queryByText("internal-checklist.pdf")).not.toBeInTheDocument();
  });
});
