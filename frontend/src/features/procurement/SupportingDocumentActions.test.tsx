import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupportingDocumentSummary } from "../../api/types";
import { SupportingDocumentActions } from "./SupportingDocumentActions";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

const firstDocument: SupportingDocumentSummary = {
  id: "document-one",
  originalFilename: "receipt-one.png",
  mimeType: "image/png",
  sizeBytes: 1_024,
  createdAt: "2026-08-26T09:00:00.000Z"
};

describe("SupportingDocumentActions", () => {
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectUrl = vi.fn(() => "blob:authenticated-receipt");
    revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not create an object URL when a preview request finishes after unmount", async () => {
    const pending = deferred<{ blob: Blob; filename: string | undefined }>();
    const user = userEvent.setup();
    const view = render(
      <SupportingDocumentActions
        supportingDocument={firstDocument}
        getFile={() => pending.promise}
      />
    );

    await user.click(screen.getByRole("button", { name: "Preview receipt receipt-one.png" }));
    view.unmount();
    await act(async () => {
      pending.resolve({
        blob: new Blob(["receipt"], { type: "image/png" }),
        filename: "receipt-one.png"
      });
      await pending.promise;
    });

    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("ignores a stale preview response and revokes the current URL on unmount", async () => {
    const stale = deferred<{ blob: Blob; filename: string | undefined }>();
    const currentFile = {
      blob: new Blob(["current receipt"], { type: "image/webp" }),
      filename: "receipt-two.webp"
    };
    const secondDocument: SupportingDocumentSummary = {
      ...firstDocument,
      id: "document-two",
      originalFilename: "receipt-two.webp",
      mimeType: "image/webp"
    };
    const user = userEvent.setup();
    const view = render(
      <SupportingDocumentActions
        supportingDocument={firstDocument}
        getFile={() => stale.promise}
      />
    );

    await user.click(screen.getByRole("button", { name: "Preview receipt receipt-one.png" }));
    view.rerender(
      <SupportingDocumentActions
        supportingDocument={secondDocument}
        getFile={() => Promise.resolve(currentFile)}
      />
    );
    await act(async () => {
      stale.resolve({
        blob: new Blob(["stale receipt"], { type: "image/png" }),
        filename: "receipt-one.png"
      });
      await stale.promise;
    });

    expect(createObjectUrl).not.toHaveBeenCalled();
    const previewButton = await screen.findByRole("button", {
      name: "Preview receipt receipt-two.webp"
    });
    await waitFor(() => expect(previewButton).toBeEnabled());
    await user.click(previewButton);

    expect(await screen.findByRole("img", { name: "Receipt receipt-two.webp" })).toHaveAttribute(
      "src",
      "blob:authenticated-receipt"
    );
    expect(createObjectUrl).toHaveBeenCalledOnce();
    view.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:authenticated-receipt");
  });
});
