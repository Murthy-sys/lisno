import { render, waitFor } from "@testing-library/react-native";

import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ConversationThumbnails, previewableImages } from "./ConversationThumbnails";

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: jest.fn()
}));

const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);

describe("ConversationThumbnails", () => {
  it("selects only previewable images, at most two", () => {
    expect(previewableImages([
      { id: "a", kind: "image", filename: "a.jpg", hasPreview: false },
      { id: "b", kind: "document", filename: "b.pdf", hasPreview: true },
      { id: "c", kind: "image", filename: "c.jpg", hasPreview: true },
      { id: "d", kind: "image", filename: "d.jpg", hasPreview: true },
      { id: "e", kind: "image", filename: "e.jpg", hasPreview: true }
    ]).map((item) => item.id)).toEqual(["c", "d"]);
  });

  it("renders nothing without previewable images", async () => {
    useConfiguredRuntimeMock.mockReturnValue({ runtime: { transfers: { download: jest.fn() } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const view = await render(
      <ConversationThumbnails attachmentCount={1} attachments={[{ id: "a", kind: "document", filename: "a.pdf", hasPreview: false }]} projectId="p" />
    );
    expect(view.toJSON()).toBeNull();
  });

  it("releases downloaded previews and cancels transfers on unmount", async () => {
    const release = jest.fn(async () => undefined);
    const cancel = jest.fn();
    const download = jest.fn(() => ({ result: Promise.resolve({ uri: "file:///cache/a.webp", release }), cancel }));
    useConfiguredRuntimeMock.mockReturnValue({ runtime: { transfers: { download } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
    const view = await render(
      <ConversationThumbnails attachmentCount={1} attachments={[{ id: "a", kind: "image", filename: "a.jpg", hasPreview: true }]} projectId="p" />
    );
    expect(download).toHaveBeenCalledWith(expect.objectContaining({
      path: "/projects/p/chat/attachments/a/preview",
      maxBytes: expect.any(Number)
    }));
    await waitFor(() => expect(view.getAllByTestId("conversation-thumbnail-image-a", { includeHiddenElements: true })).toHaveLength(1));

    await view.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
