import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DownloadButton } from "./DownloadButton";

const file = new Blob(["pdf"], { type: "application/pdf" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderDownloadButton(
  getFile = vi.fn().mockResolvedValue({ blob: file, filename: "estimate-42.pdf" })
) {
  render(
    <>
      <DownloadButton
        label="Export as PDF"
        loadingLabel="Preparing PDF..."
        errorMessage="PDF export failed for Aurora Villa. Try again."
        fallbackFilename="estimate.pdf"
        getFile={getFile}
      />
      <button type="button">Unrelated action</button>
    </>
  );
  return getFile;
}

describe("DownloadButton", () => {
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;
  let clickAnchor: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectUrl = vi.fn(() => "blob:estimate");
    revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl
    });
    clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders an accessible label with a decorative download icon", () => {
    renderDownloadButton();

    expect(screen.getByRole("button", { name: "Export as PDF" })).toBeInTheDocument();
    expect(document.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("disables only itself and ignores a second click while the file is pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ blob: Blob; filename: string | undefined }>();
    const getFile = renderDownloadButton(vi.fn(() => pending.promise));
    const button = screen.getByRole("button", { name: "Export as PDF" });

    await user.click(button);

    expect(screen.getByRole("button", { name: "Preparing PDF..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unrelated action" })).toBeEnabled();
    await user.click(button);
    expect(getFile).toHaveBeenCalledOnce();

    pending.resolve({ blob: file, filename: "estimate-42.pdf" });
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("uses an in-flight lock for a re-entrant click before React rerenders", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ blob: Blob; filename: string | undefined }>();
    let reenter = true;
    let button: HTMLButtonElement;
    const getFile = vi.fn(() => {
      if (reenter) {
        reenter = false;
        button.click();
      }
      return pending.promise;
    });
    renderDownloadButton(getFile);
    button = screen.getByRole("button", { name: "Export as PDF" });

    await user.click(button);

    expect(getFile).toHaveBeenCalledOnce();
    pending.resolve({ blob: file, filename: "estimate-42.pdf" });
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("downloads with the server filename and cleans up its temporary URL", async () => {
    const user = userEvent.setup();
    const getFile = renderDownloadButton();
    const remove = vi.spyOn(HTMLAnchorElement.prototype, "remove");

    await user.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => expect(clickAnchor).toHaveBeenCalledOnce());
    const anchor = clickAnchor.mock.instances[0]! as HTMLAnchorElement;
    expect(getFile).toHaveBeenCalledOnce();
    expect(anchor.download).toBe("estimate-42.pdf");
    expect(anchor.href).toBe("blob:estimate");
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:estimate");
  });

  it("uses the fallback filename when the server does not provide one", async () => {
    const user = userEvent.setup();
    renderDownloadButton(vi.fn().mockResolvedValue({ blob: file, filename: undefined }));

    await user.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => expect(clickAnchor).toHaveBeenCalledOnce());
    expect((clickAnchor.mock.instances[0]! as HTMLAnchorElement).download).toBe("estimate.pdf");
  });

  it("cleans up an object URL and temporary anchor when clicking the anchor throws", async () => {
    const user = userEvent.setup();
    const remove = vi.spyOn(HTMLAnchorElement.prototype, "remove");
    clickAnchor.mockImplementationOnce(() => {
      throw new Error("click failed");
    });
    renderDownloadButton();

    await user.click(screen.getByRole("button", { name: "Export as PDF" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:estimate");
  });

  it("shows a retryable per-instance error after failure", async () => {
    const user = userEvent.setup();
    const getFile = renderDownloadButton(
      vi.fn()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce({ blob: file, filename: "estimate-42.pdf" })
    );
    const button = screen.getByRole("button", { name: "Export as PDF" });

    await user.click(button);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "PDF export failed for Aurora Villa. Try again."
    );
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(clickAnchor).toHaveBeenCalledOnce());
    expect(getFile).toHaveBeenCalledTimes(2);
  });

  it("does not update state or signal completion after unmount while pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ blob: Blob; filename: string | undefined }>();
    const onBusyChange = vi.fn();
    const { unmount } = render(
      <DownloadButton
        label="Export as PDF"
        loadingLabel="Preparing PDF..."
        errorMessage="PDF export failed for Aurora Villa. Try again."
        fallbackFilename="estimate.pdf"
        getFile={vi.fn(() => pending.promise)}
        onBusyChange={onBusyChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Export as PDF" }));
    unmount();
    await act(async () => {
      pending.resolve({ blob: file, filename: "estimate-42.pdf" });
      await Promise.resolve();
    });

    expect(onBusyChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
