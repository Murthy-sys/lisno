import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { ApiError, apiClient } from "../../api/client";
import { WorkflowStageActions } from "./WorkflowStageActions";
import { downloadWorkflowActionMedia, projectWorkflowKeys, type DesignWorkflowStage, type DesignWorkflowView } from "./projectWorkflowApi";

function fixture() {
  const stage: DesignWorkflowStage = {
    id: "project-a:measurement", type: "site_measurement", name: "On Site Actual Measurement", order: 3,
    status: "in_progress", progress: 0, deadlineAt: null, deadlineTaskId: null, dependencyStageIds: [], tasks: [],
    operational: {
      status: "in_progress", version: 6,
      // An already-cached action must not make the sketch required again.
      availableActions: [{ id: "measurement_complete", label: "Complete measurement and upload sketch", actor: "designer", requiresProof: true }],
      timing: { state: "not_applicable", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: []
    }
  };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-17T09:00:00.000Z", projectStages: [stage], floors: [] };
  return { stage, workflow };
}

function setup(data = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<WorkflowStageActions {...data} />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...view, ...data, client };
}

const photo = (name = "site.jpg") => new File(["photo"], name, { type: "image/jpeg" });
const video = () => new File(["video"], "walkthrough.mp4", { type: "video/mp4" });
const mediaInput = () => screen.getByLabelText(/Site photos and videos/);
const submit = () => fireEvent.submit(screen.getByRole("form", { name: "Complete measurement" }));

describe("measurement photo and video uploads", () => {
  it("sends mixed media as multipart without a sketch or URL and refreshes affected workflow queries", async () => {
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 7 });
    const post = vi.spyOn(apiClient, "post");
    const { client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    expect(screen.queryByLabelText(/folder/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("As-built on-site sketch (optional)")).not.toBeRequired();
    await user.upload(mediaInput(), [photo(), video()]);
    expect((await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    await screen.findByText("Action recorded. The project workflow has been updated.");
    expect(post).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
    const body = upload.mock.calls[0]![1];
    expect(body.getAll("mediaFiles").map((file) => (file as File).name)).toEqual(["site.jpg", "walkthrough.mp4"]);
    expect(body.has("file")).toBe(false);
    expect(body.get("data")).toBe("{}");
    expect(body.get("expectedVersion")).toBe("6");
    expect(body.get("stageId")).toBe("project-a:measurement");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.all });
    expect(invalidate).toHaveBeenCalledTimes(5);
  });

  it("requires a photo or video even when a sketch is attached", async () => {
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress");
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    await user.upload(screen.getByLabelText("As-built on-site sketch (optional)"), new File(["sketch"], "sketch.pdf", { type: "application/pdf" }));
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one site photo or video");
    expect(upload).not.toHaveBeenCalled();
  });

  it("adds more files, removes and reselects the same file, and can remove the optional sketch", async () => {
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 7 });
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    const first = photo();
    await user.upload(mediaInput(), first);
    await user.upload(mediaInput(), video());
    await user.click(screen.getByRole("button", { name: "Remove site.jpg" }));
    expect(mediaInput()).toHaveFocus();
    await user.upload(mediaInput(), first);
    expect(screen.getAllByRole("button", { name: /^Remove (site|walkthrough)/ })).toHaveLength(2);
    await user.upload(screen.getByLabelText("As-built on-site sketch (optional)"), new File(["sketch"], "sketch.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Remove sketch" }));
    submit();
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0]![1].has("file")).toBe(false);
    expect(upload.mock.calls[0]![1].getAll("mediaFiles").map((file) => (file as File).name)).toEqual(["walkthrough.mp4", "site.jpg"]);
  });

  it("preserves selected media when cancellation is dismissed", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    await user.upload(mediaInput(), photo());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByText("site.jpg")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["unsupported", () => [new File(["audio"], "voice.mp3", { type: "audio/mpeg" })], /not a supported photo or video/],
    ["empty", () => [new File([], "empty.jpg", { type: "image/jpeg" })], /is empty/]
  ] as const)("rejects %s selections without discarding previously selected files", async (_name, files, error) => {
    setup();
    const user = userEvent.setup({ applyAccept: false });
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    await user.upload(mediaInput(), photo());
    await user.upload(mediaInput(), [...files()]);
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    expect(within(screen.getByRole("list", { name: "Selected site photos and videos" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("site.jpg")).toBeVisible();
  });

  it("accepts media above 25 MB with an optional sketch and submits every selected page", async () => {
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 7 });
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    const files = Array.from({ length: 32 }, (_, index) => photo(`site-${index + 1}.jpg`));
    Object.defineProperty(files[0]!, "size", { value: 30 * 1024 * 1024 });
    await user.upload(mediaInput(), files);
    const sketch = new File(["sketch"], "sketch.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("As-built on-site sketch (optional)"), sketch);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/32 files selected · 30.0 MB/)).toBeVisible();
    const list = screen.getByRole("list", { name: "Selected site photos and videos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(25);
    expect(screen.getByText("1–25 of 32 files")).toBeVisible();
    expect(screen.queryByText("site-32.jpg")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next files" }));
    expect(list).toHaveFocus();
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("26–32 of 32 files")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove site-32.jpg" }));
    expect(screen.getByText(/31 files selected/)).toBeVisible();
    await user.upload(mediaInput(), [files[0]!, files[31]!]);
    expect(screen.getByText(/32 files selected/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous files" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(25);
    submit();
    await screen.findByText("Action recorded. The project workflow has been updated.");
    expect(upload).toHaveBeenCalledTimes(1);
    const body = upload.mock.calls[0]![1];
    expect(body.getAll("mediaFiles").map((file) => (file as File).name)).toEqual(files.map((file) => file.name));
    expect((body.get("file") as File).name).toBe("sketch.pdf");
  });

  it("returns to the preceding page when its last selected file is removed", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    await user.upload(mediaInput(), Array.from({ length: 26 }, (_, index) => photo(`site-${index + 1}.jpg`)));
    await user.click(screen.getByRole("button", { name: "Next files" }));
    await user.click(screen.getByRole("button", { name: "Remove site-26.jpg" }));
    expect(screen.getByText(/25 files selected/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Next files" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Selected site photos and videos" })).getAllByRole("listitem")).toHaveLength(25);
    expect(screen.getByText("site-1.jpg")).toBeVisible();
    expect(mediaInput()).toHaveFocus();
  });

  it("shows progress through saving and prevents duplicate submits without a sketch", async () => {
    let complete!: (value: { version: number }) => void;
    let progress!: (value: number) => void;
    const pending = new Promise<{ version: number }>((resolve) => { complete = resolve; });
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress").mockImplementation(async <T,>(_path: string, _data: FormData, onProgress: (value: number) => void) => { progress = onProgress; return await pending as T; });
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    await user.upload(mediaInput(), video());
    submit(); submit();
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    act(() => progress(42));
    expect(screen.getByText("Uploading evidence… 42%")).toBeVisible();
    expect(mediaInput()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove walkthrough.mp4" })).toBeDisabled();
    act(() => progress(100));
    expect(screen.getByText("Saving action and evidence…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => complete({ version: 7 }));
    await screen.findByText("Action recorded. The project workflow has been updated.");
  });

  it("retains the draft and idempotency key for retry after a server upload failure", async () => {
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress").mockRejectedValueOnce(new ApiError(503, "UPLOAD_UNAVAILABLE", "The upload service is temporarily unavailable.")).mockResolvedValueOnce({ version: 7 });
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    await user.upload(mediaInput(), photo());
    await user.type(screen.getByLabelText("Note"), "East wall measured.");
    submit();
    await screen.findByText("The upload service is temporarily unavailable.");
    expect(screen.getByText("site.jpg")).toBeVisible();
    expect(screen.getByLabelText("Note")).toHaveValue("East wall measured.");
    submit();
    await screen.findByText("Action recorded. The project workflow has been updated.");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]![1].get("idempotencyKey")).toBe(upload.mock.calls[1]![1].get("idempotencyKey"));
    expect(upload.mock.calls[1]![1].getAll("mediaFiles")).toHaveLength(1);
  });

  it("keeps the media draft visible and blocks completion if the workflow changes", async () => {
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress");
    const { workflow, stage, rerender } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Complete measurement" }));
    await user.upload(mediaInput(), photo());
    rerender(<WorkflowStageActions workflow={workflow} stage={{ ...stage, operational: { ...stage.operational!, version: 7 } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    expect(screen.getByText("site.jpg")).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete measurement" })).toBeDisabled();
    submit();
    expect(upload).not.toHaveBeenCalled();
  });

  it("downloads each historical media file through authenticated IDs and retains legacy evidence", async () => {
    const download = vi.spyOn(apiClient, "getBlob").mockRejectedValue(new Error("Unavailable"));
    const data = fixture();
    data.stage.operational!.history = [{ id: "event-a", action: "measurement_complete", actorName: "Designer A", actorRole: "designer", onBehalfOfClient: false, at: data.workflow.serverNow, note: "", proofAvailable: true,
      mediaFiles: [{ id: "photo-a", filename: "site.jpg", mimeType: "image/jpeg", byteSize: 12000, kind: "image" }, { id: "video-a", filename: "walkthrough.mp4", mimeType: "video/mp4", byteSize: 500000, kind: "video" }] }];
    setup(data);
    const user = userEvent.setup();
    await user.click(screen.getByText("Action history"));
    expect(screen.getByRole("button", { name: "Download evidence" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Download walkthrough.mp4" }));
    expect(download).toHaveBeenCalledWith("/projects/project-a/design-workflow/history/event-a/media/video-a");
    await screen.findByText("walkthrough.mp4 could not be downloaded. Please try again.");
    await user.click(screen.getByRole("button", { name: "Download site.jpg" }));
    expect(download).toHaveBeenCalledWith("/projects/project-a/design-workflow/history/event-a/media/photo-a");
  });

  it("encodes all identifiers in protected media download paths", async () => {
    const download = vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["photo"]), filename: "site.jpg" });
    await downloadWorkflowActionMedia("project/a", "event/b", "media/c");
    expect(download).toHaveBeenCalledWith("/projects/project%2Fa/design-workflow/history/event%2Fb/media/media%2Fc");
  });

  it("pages historical media without losing file identities and keeps an active download mounted", async () => {
    let rejectDownload!: (error: Error) => void;
    const pending = new Promise<Awaited<ReturnType<typeof apiClient.getBlob>>>((_resolve, reject) => { rejectDownload = reject; });
    const download = vi.spyOn(apiClient, "getBlob").mockReturnValue(pending);
    const data = fixture();
    data.stage.operational!.history = [{ id: "event-many", action: "measurement_complete", actorName: "Designer A", actorRole: "designer", onBehalfOfClient: false, at: data.workflow.serverNow, note: "", proofAvailable: false,
      mediaFiles: Array.from({ length: 32 }, (_, index) => ({ id: `media-${index + 1}`, filename: `site-${index + 1}.jpg`, mimeType: "image/jpeg", byteSize: 12000, kind: "image" as const })) }];
    setup(data);
    const user = userEvent.setup();
    await user.click(screen.getByText("Action history"));
    const list = screen.getByRole("list", { name: "Site photos and videos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(25);
    await user.click(screen.getByRole("button", { name: "Next files" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "Download site-32.jpg" }));
    expect(download).toHaveBeenCalledWith("/projects/project-a/design-workflow/history/event-many/media/media-32");
    expect(screen.getByRole("button", { name: "Previous files" })).toBeDisabled();
    await act(async () => rejectDownload(new Error("Unavailable")));
    await screen.findByText("site-32.jpg could not be downloaded. Please try again.");
    await user.click(screen.getByRole("button", { name: "Previous files" }));
    expect(screen.getByRole("button", { name: "Download site-1.jpg" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Download site-32.jpg" })).not.toBeInTheDocument();
  });
});
