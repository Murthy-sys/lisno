import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { View } from "react-native";

import { AUTHORIZATION_POLICY_VERSION, type Role } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { privateQueryKey } from "../../core/query/queryClient";
import { DesignVersionWorkspace } from "../design/DesignVersionWorkspace";
import { ProjectDocuments } from "./ProjectDocuments";

const mockGet = jest.fn();
const mockDownload = jest.fn();

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: () => ({
    environment: { environment: { id: "env-test" } },
    session: { status: "unauthenticated" },
    runtime: {
      api: { authenticated: { get: (...args: unknown[]) => mockGet(...args) } },
      transfers: { download: (...args: unknown[]) => mockDownload(...args) }
    }
  })
}));

jest.mock("../documents/PdfDocumentSurface", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View: NativeView } = jest.requireActual("react-native") as typeof import("react-native");
  return { PdfDocumentSurface: ({ uri }: { readonly uri: string }) => React.createElement(NativeView, { testID: "protected-document-pdf", accessibilityLabel: uri }) };
});

const PDF = "estimation.estimate_pdf.download";
const CLIENT_PDF = "estimation.client_estimate_pdf.download";
const READ_DESIGNS = "design.version.read";
const DOWNLOAD_DESIGN = "design.version.download";
const DESIGN_URL = "/projects/project-lakeside/design-versions?limit=30&offset=0";

function session(role: Role, permissions: readonly string[], id = `session-${role}`): AuthenticatedSession {
  return {
    user: { id, name: "Signed-in user", email: `${role}@example.test`, role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: [...permissions] }
  } as AuthenticatedSession;
}

function versionsPayload(items: readonly Record<string, unknown>[], hasMore = false) {
  return { items, pagination: { limit: 30, offset: 0, total: items.length + (hasMore ? 1 : 0), hasMore } };
}

/** Mixed approval states: only the two approved versions may appear. */
const MIXED_VERSIONS = versionsPayload([
  { id: "version-2", versionNumber: 2, originalFilename: "bedroom-rejected.pdf", mimeType: "application/pdf", approvalStatus: "rejected", approvedAt: null },
  { id: "version-3", versionNumber: 3, originalFilename: "living-room.pdf", mimeType: "application/pdf", approvalStatus: "approved", approvedAt: "2026-09-05T23:30:00.000Z" },
  { id: "version-4", versionNumber: 4, originalFilename: "kitchen-pending.pdf", mimeType: "application/pdf", approvalStatus: "pending", approvedAt: null },
  { id: "version-7", approvalStatus: "approved", approvedAt: "not-a-date" }
]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function makeClient(staleTime = 0) {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime, gcTime: Infinity }, mutations: { retry: false } } });
}

async function renderWith(node: ReactElement, client = makeClient()) {
  const wrapper = ({ children }: { readonly children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = await render(node, { wrapper });
  return { view, client };
}

function artifact() {
  return { uri: "file:///synthetic/document", fileName: "document", mimeType: "application/pdf", sizeBytes: 10, share: jest.fn(async () => undefined), release: jest.fn(async () => undefined) };
}

describe("ProjectDocuments", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDownload.mockReset();
  });

  describe("estimate PDF row", () => {
    it("is hidden without the PDF permission", async () => {
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={{ id: "estimate-a", statusLabel: "Approved" }} session={session("admin", [])} />);
      expect(view.getByRole("header", { name: "Documents" })).toBeTruthy();
      expect(view.queryByText("Estimate PDF")).toBeNull();
      expect(view.queryByRole("button", { name: "Export PDF" })).toBeNull();
      expect(view.getByText("No documents are available for your access.")).toBeTruthy();
      expect(mockDownload).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("is hidden when the project has no estimate", async () => {
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("admin", [PDF])} />);
      expect(view.queryByText("Estimate PDF")).toBeNull();
      expect(view.queryByRole("button", { name: "Export PDF" })).toBeNull();
      expect(view.getByText("No documents are available for your access.")).toBeTruthy();
      expect(mockDownload).not.toHaveBeenCalled();
    });

    it("exports each estimate by its own id and cleans up after sharing", async () => {
      const shares = { a: artifact(), b: artifact() };
      mockDownload.mockImplementation(({ path }: { readonly path: string }) => ({ result: Promise.resolve(path.includes("estimate-a") ? shares.a : shares.b), cancel: jest.fn() }));
      const admin = session("admin", [PDF]);
      const { view } = await renderWith(
        <View>
          <View testID="documents-a"><ProjectDocuments projectId="project-lakeside" estimate={{ id: "estimate-a", statusLabel: "Approved" }} session={admin} /></View>
          <View testID="documents-b"><ProjectDocuments projectId="project-harbour" estimate={{ id: "estimate-b", statusLabel: "Sent to client" }} session={admin} /></View>
        </View>
      );

      const first = within(view.getByTestId("documents-a"));
      const second = within(view.getByTestId("documents-b"));
      expect(first.getByLabelText("Estimate PDF, Approved")).toBeTruthy();
      expect(second.getByLabelText("Estimate PDF, Sent to client")).toBeTruthy();

      await fireEvent.press(second.getByRole("button", { name: "Export PDF" }));
      await waitFor(() => expect(shares.b.share).toHaveBeenCalledWith({ cleanupAfterShare: true }));
      expect(mockDownload).toHaveBeenCalledTimes(1);
      expect(mockDownload).toHaveBeenLastCalledWith({ path: "/estimates/estimate-b/pdf", fileName: "lisno-estimate-estimate-b.pdf", mimeType: "application/pdf", maxBytes: 25 * 1024 * 1024 });

      await fireEvent.press(first.getByRole("button", { name: "Export PDF" }));
      await waitFor(() => expect(shares.a.share).toHaveBeenCalledWith({ cleanupAfterShare: true }));
      expect(mockDownload).toHaveBeenCalledTimes(2);
      expect(mockDownload).toHaveBeenLastCalledWith({ path: "/estimates/estimate-a/pdf", fileName: "lisno-estimate-estimate-a.pdf", mimeType: "application/pdf", maxBytes: 25 * 1024 * 1024 });
      expect(shares.b.share).toHaveBeenCalledTimes(1);
    });

    it("encodes the estimate id into the transfer path", async () => {
      const shared = artifact();
      mockDownload.mockReturnValue({ result: Promise.resolve(shared), cancel: jest.fn() });
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={{ id: "estimate/7 a", statusLabel: "Draft" }} session={session("admin", [PDF])} />);
      await fireEvent.press(view.getByRole("button", { name: "Export PDF" }));
      await waitFor(() => expect(shared.share).toHaveBeenCalled());
      expect(mockDownload).toHaveBeenCalledWith(expect.objectContaining({ path: "/estimates/estimate%2F7%20a/pdf" }));
    });

    it("keeps the Client estimate PDF inside the modal until Close without sharing", async () => {
      const opened = artifact();
      mockDownload.mockReturnValue({ result: Promise.resolve(opened), cancel: jest.fn() });
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={{ id: "estimate/client", statusLabel: "Approved" }} session={session("client", [CLIENT_PDF])} />);
      const open = view.getByRole("button", { name: "Open PDF" });
      expect(open.props.accessibilityHint).toBe("Opens the estimate in an in-app document viewer");
      await fireEvent.press(open);
      const preview = await view.findByTestId("protected-document-pdf");
      expect(preview.props.accessibilityLabel).toBe(opened.uri);
      expect(view.getByRole("header", { name: "lisno-estimate-estimate/client.pdf" })).toBeTruthy();
      expect(mockDownload).toHaveBeenCalledWith(expect.objectContaining({ path: "/client/estimates/estimate%2Fclient/pdf", maxBytes: 25 * 1024 * 1024 }));
      expect(opened.share).not.toHaveBeenCalled();
      expect(opened.release).not.toHaveBeenCalled();
      await fireEvent.press(view.getByRole("button", { name: "Close document viewer" }));
      await waitFor(() => expect(opened.release).toHaveBeenCalled());
      expect(opened.share).not.toHaveBeenCalled();
      expect(view.getByRole("button", { name: "Open PDF" })).toBeTruthy();
    });

    it("uses only the client PDF operation and route for a Client", async () => {
      const shared = artifact();
      mockDownload.mockReturnValue({ result: Promise.resolve(shared), cancel: jest.fn() });
      const { view } = await renderWith(<View>
        <View testID="client-denied"><ProjectDocuments projectId="project-lakeside" estimate={{ id: "estimate/denied", statusLabel: "Approved" }} session={session("client", [PDF])} /></View>
        <View testID="client-allowed"><ProjectDocuments projectId="project-harbour" estimate={{ id: "estimate/client", statusLabel: "Approved" }} session={session("client", [CLIENT_PDF])} /></View>
      </View>);
      expect(within(view.getByTestId("client-denied")).queryByRole("button", { name: "Export PDF" })).toBeNull();
      await fireEvent.press(within(view.getByTestId("client-allowed")).getByRole("button", { name: "Export PDF" }));
      await waitFor(() => expect(shared.share).toHaveBeenCalledWith({ cleanupAfterShare: true }));
      expect(mockDownload).toHaveBeenCalledWith(expect.objectContaining({ path: "/client/estimates/estimate%2Fclient/pdf" }));
    });

    it("shows a busy state while preparing and an inline error when the transfer fails", async () => {
      const pending = deferred<ReturnType<typeof artifact>>();
      mockDownload.mockReturnValue({ result: pending.promise, cancel: jest.fn() });
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={{ id: "estimate-a", statusLabel: "Approved" }} session={session("admin", [PDF])} />);

      await fireEvent.press(view.getByRole("button", { name: "Export PDF" }));
      const busy = view.getByRole("button", { name: "Export PDF" });
      expect(busy.props.accessibilityState).toEqual({ busy: true, disabled: true });
      await fireEvent.press(busy);
      expect(mockDownload).toHaveBeenCalledTimes(1);

      await act(async () => pending.reject(new Error("You do not have access to this estimate PDF.")));
      const error = await view.findByText("The estimate PDF could not be prepared.");
      expect(error.props.accessibilityLiveRegion).toBe("assertive");
      expect(view.getByRole("button", { name: "Export PDF" }).props.accessibilityState).toEqual({ busy: false, disabled: false });

      mockDownload.mockReturnValue({ result: Promise.reject("opaque failure"), cancel: jest.fn() });
      await fireEvent.press(view.getByRole("button", { name: "Export PDF" }));
      expect(await view.findByText("The estimate PDF could not be prepared.")).toBeTruthy();
      expect(view.queryByText("You do not have access to this estimate PDF.")).toBeNull();
    });
  });

  describe("approved design files", () => {
    it("is hidden without design read permission and never queries", async () => {
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={{ id: "estimate-a", statusLabel: "Approved" }} session={session("admin", [PDF, DOWNLOAD_DESIGN])} />);
      expect(view.getByText("Estimate PDF")).toBeTruthy();
      expect(view.queryByText("Approved design files")).toBeNull();
      expect(view.queryByText("No documents are available for your access.")).toBeNull();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("lists only approved versions using the shared design query URL and key", async () => {
      mockGet.mockResolvedValue(MIXED_VERSIONS);
      const staff = session("designer", [READ_DESIGNS]);
      const { view, client } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={staff} />);

      expect(await view.findByText("living-room.pdf")).toBeTruthy();
      expect(view.getByRole("header", { name: "Approved design files" })).toBeTruthy();
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith(DESIGN_URL, { signal: expect.anything() });
      expect(client.getQueryData(privateQueryKey({ environmentId: "env-test", userId: staff.user.id }, "design", "project", "project-lakeside"))).toBe(MIXED_VERSIONS);

      expect(view.getByLabelText("living-room.pdf, Version 3, Approved 05 Sep 2026")).toBeTruthy();
      expect(view.getByText("Version 3")).toBeTruthy();
      expect(view.getByText("Approved 05 Sep 2026")).toBeTruthy();
      // A version with neither filename nor number gets a neutral title, never a list position posing as a version.
      expect(view.getByLabelText("Design file, Version not recorded")).toBeTruthy();
      expect(view.queryByText(/^Design version \d/)).toBeNull();
      expect(view.getByText("Version —")).toBeTruthy();
      expect(view.queryByText("bedroom-rejected.pdf")).toBeNull();
      expect(view.queryByText("kitchen-pending.pdf")).toBeNull();
      expect(view.queryByText(/Approved not-a-date/)).toBeNull();
      expect(view.queryByRole("button", { name: "Download" })).toBeNull();
      expect(view.queryByText(/first 30 uploaded design versions/)).toBeNull();
    });

    it("gates Download on design.version.download and shares the version file", async () => {
      mockGet.mockResolvedValue(MIXED_VERSIONS);
      const living = artifact();
      mockDownload.mockImplementation(({ path }: { readonly path: string }) => ({
        result: path.includes("version-7") ? Promise.reject(new Error("The design file is no longer available.")) : Promise.resolve(living),
        cancel: jest.fn()
      }));
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("designer", [READ_DESIGNS, DOWNLOAD_DESIGN])} />);
      await view.findByText("living-room.pdf");

      const buttons = view.getAllByRole("button", { name: "Download" });
      expect(buttons).toHaveLength(2);
      expect(buttons[0]!.props.accessibilityHint).toBe("Downloads living-room.pdf and opens the share sheet");

      await fireEvent.press(buttons[0]!);
      await waitFor(() => expect(living.share).toHaveBeenCalledWith({ cleanupAfterShare: true }));
      expect(mockDownload).toHaveBeenLastCalledWith({ path: "/design-versions/version-3/download", fileName: "living-room.pdf", mimeType: "application/pdf", maxBytes: 50 * 1024 * 1024 });

      await fireEvent.press(view.getAllByRole("button", { name: "Download" })[1]!);
      const error = await view.findByText("The design could not be downloaded.");
      expect(error.props.accessibilityLiveRegion).toBe("assertive");
      expect(mockDownload).toHaveBeenLastCalledWith({ path: "/design-versions/version-7/download", fileName: "design-version-7", mimeType: "application/octet-stream", maxBytes: 50 * 1024 * 1024 });
      expect(view.getAllByText("The design could not be downloaded.")).toHaveLength(1);
    });

    it("opens an approved image with a temporary local URI and releases it on close", async () => {
      mockGet.mockResolvedValue(versionsPayload([{ id: "version-image", versionNumber: 1, originalFilename: "elevation.png", mimeType: "image/png", approvalStatus: "approved", clientVisible: true }]));
      const image = artifact();
      mockDownload.mockReturnValue({ result: Promise.resolve(image), cancel: jest.fn() });
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("client", [READ_DESIGNS, DOWNLOAD_DESIGN])} />);
      expect(await view.findByText("elevation.png")).toBeTruthy();
      await fireEvent.press(view.getByRole("button", { name: "Open" }));
      const preview = await view.findByTestId("protected-document-image");
      expect(preview.props.source).toEqual({ uri: image.uri });
      expect(mockDownload).toHaveBeenCalledWith(expect.objectContaining({ path: "/design-versions/version-image/download", mimeType: "image/png" }));
      expect(image.share).not.toHaveBeenCalled();
      await fireEvent.press(view.getByRole("button", { name: "Close document viewer" }));
      await waitFor(() => expect(image.release).toHaveBeenCalled());
    });

    it("closes and releases an open design when the signed-in account changes", async () => {
      mockGet.mockResolvedValueOnce(versionsPayload([
        { id: "version-old", originalFilename: "old-client-plan.png", mimeType: "image/png", approvalStatus: "approved", clientVisible: true }
      ])).mockResolvedValueOnce(versionsPayload([
        { id: "version-new", originalFilename: "new-client-plan.png", mimeType: "image/png", approvalStatus: "approved", clientVisible: true }
      ]));
      const oldFile = artifact();
      mockDownload.mockReturnValue({ result: Promise.resolve(oldFile), cancel: jest.fn() });
      const first = session("client", [READ_DESIGNS, DOWNLOAD_DESIGN], "client-first");
      const second = session("client", [READ_DESIGNS, DOWNLOAD_DESIGN], "client-second");
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={first} />);
      expect(await view.findByText("old-client-plan.png")).toBeTruthy();
      await fireEvent.press(view.getByRole("button", { name: "Open" }));
      expect(await view.findByTestId("protected-document-image")).toBeTruthy();

      await view.rerender(<ProjectDocuments projectId="project-lakeside" estimate={null} session={second} />);
      await waitFor(() => expect(oldFile.release).toHaveBeenCalledTimes(1));
      expect(view.queryByTestId("protected-document-image")).toBeNull();
      expect(await view.findByText("new-client-plan.png")).toBeTruthy();
      expect(view.queryByText("old-client-plan.png")).toBeNull();
      expect(mockDownload).toHaveBeenCalledTimes(1);
    });

    it("opens an approved PDF in-app and shares it only from the separate Download action", async () => {
      mockGet.mockResolvedValue(versionsPayload([{ id: "version-pdf", versionNumber: 5, originalFilename: "review.pdf", mimeType: "application/pdf", approvalStatus: "approved", clientVisible: true }]));
      const previewFile = artifact();
      const downloadFile = artifact();
      mockDownload.mockReturnValueOnce({ result: Promise.resolve(previewFile), cancel: jest.fn() })
        .mockReturnValueOnce({ result: Promise.resolve(downloadFile), cancel: jest.fn() });
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("client", [READ_DESIGNS, DOWNLOAD_DESIGN])} />);
      expect(await view.findByText("review.pdf")).toBeTruthy();
      const open = view.getByRole("button", { name: "Open" });
      expect(open.props.accessibilityHint).toBe("Opens review.pdf in an in-app document viewer");

      await fireEvent.press(open);
      expect(await view.findByTestId("protected-document-pdf")).toBeTruthy();
      expect(mockDownload).toHaveBeenCalledWith({ path: "/design-versions/version-pdf/download", fileName: "review.pdf", mimeType: "application/pdf", maxBytes: 50 * 1024 * 1024 });
      expect(previewFile.share).not.toHaveBeenCalled();
      expect(view.getByRole("header", { name: "review.pdf" })).toBeTruthy();
      await fireEvent.press(view.getByRole("button", { name: "Close document viewer" }));
      await waitFor(() => expect(previewFile.release).toHaveBeenCalled());
      expect(previewFile.share).not.toHaveBeenCalled();

      await fireEvent.press(view.getByRole("button", { name: "Download" }));
      await waitFor(() => expect(downloadFile.share).toHaveBeenCalledWith({ cleanupAfterShare: true }));
      expect(mockDownload).toHaveBeenCalledTimes(2);
    });

    it("shows only client-visible approved versions for a Client", async () => {
      mockGet.mockResolvedValue(versionsPayload([
        { id: "visible", versionNumber: 2, originalFilename: "shared-plan.pdf", mimeType: "application/pdf", approvalStatus: "approved", clientVisible: true },
        { id: "hidden", versionNumber: 3, originalFilename: "internal-plan.pdf", mimeType: "application/pdf", approvalStatus: "approved", clientVisible: false },
        { id: "pending", versionNumber: 4, originalFilename: "pending-plan.pdf", mimeType: "application/pdf", approvalStatus: "pending", clientVisible: true }
      ]));
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("client", [READ_DESIGNS, DOWNLOAD_DESIGN])} />);
      expect(await view.findByText("shared-plan.pdf")).toBeTruthy();
      expect(view.queryByText("internal-plan.pdf")).toBeNull();
      expect(view.queryByText("pending-plan.pdf")).toBeNull();
      expect(view.getAllByRole("button", { name: "Open" })).toHaveLength(1);
    });

    it("shows a loader while the design versions load", async () => {
      mockGet.mockReturnValue(new Promise(() => undefined));
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("designer", [READ_DESIGNS])} />);
      expect(view.getByRole("progressbar", { name: "Loading documents" })).toBeTruthy();
      expect(view.queryByText("No approved documents yet.")).toBeNull();
    });

    it("shows an empty state when nothing is approved", async () => {
      mockGet.mockResolvedValue(versionsPayload([{ id: "version-9", versionNumber: 9, originalFilename: "draft.pdf", approvalStatus: "pending" }]));
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("designer", [READ_DESIGNS])} />);
      expect(await view.findByText("No approved documents yet.")).toBeTruthy();
      expect(view.queryByText("draft.pdf")).toBeNull();
    });

    it("loads an approved file beyond the first page of versions", async () => {
      mockGet.mockResolvedValueOnce(versionsPayload([{ id: "version-1", versionNumber: 1, originalFilename: "plan.pdf", approvalStatus: "approved" }], true));
      mockGet.mockResolvedValueOnce({ items: [{ id: "version-31", versionNumber: 31, originalFilename: "later-plan.pdf", approvalStatus: "approved" }], pagination: { limit: 30, offset: 30, total: 31, hasMore: false } });
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("designer", [READ_DESIGNS])} />);
      expect(await view.findByText("plan.pdf")).toBeTruthy();
      await fireEvent.press(view.getByRole("button", { name: "Load more documents" }));
      expect(await view.findByText("later-plan.pdf")).toBeTruthy();
      expect(mockGet).toHaveBeenLastCalledWith("/projects/project-lakeside/design-versions?limit=30&offset=30");
      expect(view.queryByRole("button", { name: "Load more documents" })).toBeNull();
    });

    it("shows an error with Retry that refetches the design versions", async () => {
      mockGet.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(MIXED_VERSIONS);
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={session("designer", [READ_DESIGNS])} />);

      const error = await view.findByText("Approved documents could not be loaded.");
      expect(error.props.accessibilityLiveRegion).toBe("assertive");
      expect(mockGet).toHaveBeenCalledTimes(1);

      await fireEvent.press(view.getByRole("button", { name: "Retry" }));
      expect(await view.findByText("living-room.pdf")).toBeTruthy();
      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(mockGet).toHaveBeenLastCalledWith(DESIGN_URL, { signal: expect.anything() });
      expect(view.queryByText("Approved documents could not be loaded.")).toBeNull();
    });

    it("reads a cache seeded under the design workspace key without fetching", async () => {
      const staff = session("designer", [READ_DESIGNS], "user-designer-42");
      const client = makeClient(30_000);
      client.setQueryData(privateQueryKey({ environmentId: "env-test", userId: "user-designer-42" }, "design", "project", "project-lakeside"), versionsPayload([
        { id: "version-11", versionNumber: 11, originalFilename: "seeded-elevation.pdf", approvalStatus: "approved", approvedAt: "2026-01-02T00:00:00.000Z" }
      ]));
      const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={null} session={staff} />, client);

      expect(view.getByLabelText("seeded-elevation.pdf, Version 11, Approved 02 Jan 2026")).toBeTruthy();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("shares one request with DesignVersionWorkspace for the same project", async () => {
      mockGet.mockResolvedValue(MIXED_VERSIONS);
      const staff = session("designer", [READ_DESIGNS]);
      const { view } = await renderWith(
        <View>
          <DesignVersionWorkspace projectId="project-lakeside" session={staff} />
          <ProjectDocuments projectId="project-lakeside" estimate={null} session={staff} />
        </View>
      );

      expect(await view.findByText("Design versions")).toBeTruthy();
      expect(view.getAllByText("living-room.pdf").length).toBeGreaterThanOrEqual(2);
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith(DESIGN_URL, { signal: expect.anything() });
    });
  });

  it("wraps long names instead of truncating them", async () => {
    const longName = "a-very-long-approved-design-file-name-for-the-master-bedroom-and-walk-in-wardrobe-elevations-final.pdf";
    mockGet.mockResolvedValue(versionsPayload([{ id: "version-long", versionNumber: 5, originalFilename: longName, approvalStatus: "approved" }]));
    const { view } = await renderWith(<ProjectDocuments projectId="project-lakeside" estimate={{ id: "estimate-a", statusLabel: "Client approved with a very long status description" }} session={session("admin", [PDF, READ_DESIGNS, DOWNLOAD_DESIGN])} />);
    const title = await view.findByText(longName);
    for (const text of [title, view.getByText("Estimate PDF"), view.getByText("Client approved with a very long status description")]) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.ellipsizeMode).toBeUndefined();
    }
  });
});
