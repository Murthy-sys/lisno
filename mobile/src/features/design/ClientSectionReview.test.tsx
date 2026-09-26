import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { clientSectionReviewKey } from "../estimates/clientReviewApi";
import { ClientSectionReview } from "./ClientSectionReview";

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: () => ({
    environment: { environment: { id: "env-test" } },
    session: { status: "authenticated", session: { user: { id: "client-a" } } },
    runtime: { api: { authenticated: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) } } }
  })
}));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: () => mockInvalidate }));
jest.mock("../documents/ProtectedDocumentViewer", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    ProtectedDocumentViewer: ({ visible, source }: { readonly visible: boolean; readonly source: { readonly path: string } | null }) =>
      visible && source ? React.createElement(Text, { testID: "protected-section-image" }, source.path) : null
  };
});

const READ = "design.client_sections.read";
const DECIDE = "design.client_section_decision";
const IMAGE = "design.section_revision_image.read";

function session(permissions: readonly string[]): AuthenticatedSession {
  return {
    user: { id: "client-a", role: "client", name: "Client", email: "client@example.test" },
    authorization: { role: "client", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: [...permissions] }
  } as AuthenticatedSession;
}

function section(id: string, label: string, status: "submitted" | "approved" | "rejected" = "submitted", revisionNumber = 1, comment: string | null = null) {
  const revision = { id: `${id}-revision-${revisionNumber}`, sectionId: id, revisionNumber, reviewStatus: status, rejectionComment: comment };
  return { id, label, versionNumber: 2, revision, history: [revision] };
}

function review(projectId: string, sections: readonly ReturnType<typeof section>[]) {
  return {
    projectId,
    sections,
    progress: {
      approved: sections.filter((item) => item.revision.reviewStatus === "approved").length,
      rejected: sections.filter((item) => item.revision.reviewStatus === "rejected").length,
      awaitingReview: sections.filter((item) => item.revision.reviewStatus === "submitted").length,
      total: sections.length
    }
  };
}

const clients: QueryClient[] = [];
function makeClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return client;
}

async function renderWith(node: ReactElement, client = makeClient()) {
  const wrapper = ({ children }: { readonly children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { view: await render(node, { wrapper }), client };
}

describe("ClientSectionReview", () => {
  afterEach(() => {
    for (const client of clients.splice(0)) client.clear();
  });

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockInvalidate.mockReset();
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("isolates project data and clears unfinished decisions when the project changes", async () => {
    mockGet.mockImplementation(async (path: string) => path.includes("project-a")
      ? review("project-a", [section("section-a", "Aurora study")])
      : review("project-b", [section("section-b", "Harbour lounge")]));
    const clientSession = session([READ, DECIDE]);
    const { view, client } = await renderWith(<ClientSectionReview projectId="project-a" session={clientSession} />);
    expect(await view.findByRole("header", { name: "Aurora study" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Request changes" }));
    await fireEvent.changeText(view.getByLabelText("Changes needed"), "Revise the cabinet dimension.");

    await view.rerender(<ClientSectionReview projectId="project-b" session={clientSession} />);
    expect(await view.findByRole("header", { name: "Harbour lounge" })).toBeTruthy();
    expect(view.queryByText("Revise the cabinet dimension.")).toBeNull();
    expect(view.queryByRole("button", { name: "Send request" })).toBeNull();
    expect(mockGet).toHaveBeenCalledWith("/client/projects/project-b/design-sections", { signal: expect.anything() });
    expect(client.getQueryData(clientSectionReviewKey({ environmentId: "env-test", userId: "client-a" }, "project-a"))).toMatchObject({ projectId: "project-a" });
    expect(client.getQueryData(clientSectionReviewKey({ environmentId: "env-test", userId: "client-a" }, "project-b"))).toMatchObject({ projectId: "project-b" });
  });

  it("gates section reads, decisions, and protected previews by their separate operations", async () => {
    const denied = await renderWith(<ClientSectionReview projectId="project-a" session={session([DECIDE, IMAGE])} />);
    expect(denied.view.queryByTestId("client-section-review")).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
    await denied.view.unmount();

    mockGet.mockResolvedValue(review("project-a", [section("section-a", "Bedroom")]));
    const { view } = await renderWith(<ClientSectionReview projectId="project-a" session={session([READ])} />);
    expect(await view.findByRole("header", { name: "Bedroom" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Approve section" })).toBeNull();
    expect(view.queryByRole("button", { name: "Preview Bedroom" })).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("opens only the selected protected revision image through the encoded image path", async () => {
    mockGet.mockResolvedValue(review("project-a", [section("section/a", "Kitchen"), section("section-b", "Bedroom")]));
    const { view } = await renderWith(<ClientSectionReview projectId="project-a" session={session([READ, IMAGE])} />);
    expect(await view.findByRole("header", { name: "Kitchen" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Preview Kitchen" }));
    expect(view.getByTestId("protected-section-image").props.children).toBe("/design-section-revisions/section%2Fa-revision-1/image");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("sends the submitted revision and advances to the next submitted section after approval", async () => {
    let current = review("project-a", [section("section-a", "Kitchen"), section("section-b", "Living room")]);
    mockGet.mockImplementation(async () => current);
    mockPost.mockImplementation(async () => {
      current = review("project-a", [section("section-a", "Kitchen", "approved"), section("section-b", "Living room")]);
      return { revision: current.sections[0]!.revision, progress: current.progress };
    });
    const { view, client } = await renderWith(<ClientSectionReview projectId="project-a" session={session([READ, DECIDE])} />);
    expect(await view.findByRole("header", { name: "Kitchen" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Approve section" }));
    expect(view.getByRole("header", { name: "Approve Kitchen?" })).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Confirm approval" }));

    await waitFor(() => expect(view.getByRole("header", { name: "Living room" })).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith("/design-section-revisions/section-a-revision-1/decision", { version: 1, decision: "approved" });
    expect(mockInvalidate).toHaveBeenCalledWith("design-workflow-changed");
    expect(view.getByText(/Review saved. Now showing Living room/)).toBeTruthy();
    expect(view.getByLabelText("1 approved, 0 changes requested, 1 awaiting review, 2 total")).toBeTruthy();
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it("requires a trimmed change comment, sends it with the revision number, and shows completed history", async () => {
    let current = review("project-a", [section("section-a", "Kitchen", "submitted", 3)]);
    mockGet.mockImplementation(async () => current);
    mockPost.mockImplementation(async () => {
      current = review("project-a", [section("section-a", "Kitchen", "rejected", 3, "Move the sink to the east wall.")]);
      return { revision: current.sections[0]!.revision, progress: current.progress };
    });
    const { view, client } = await renderWith(<ClientSectionReview projectId="project-a" session={session([READ, DECIDE])} />);
    expect(await view.findByRole("header", { name: "Kitchen" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Request changes" }));
    await fireEvent.press(view.getByRole("button", { name: "Send request" }));
    expect(view.getByText("Explain what the designer should modify.")).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText("Changes needed"), "  Move the sink to the east wall.  ");
    await fireEvent.press(view.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(view.getByRole("header", { name: "Review complete" })).toBeTruthy());
    expect(mockPost).toHaveBeenCalledWith("/design-section-revisions/section-a-revision-3/decision", { version: 3, decision: "rejected", comment: "Move the sink to the east wall." });
    expect(view.getByText("Move the sink to the east wall.")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Request changes" })).toBeNull();
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it("reviews a newly submitted revision while retaining the prior change request in history", async () => {
    const previous = section("section-a", "Kitchen", "rejected", 1, "Keep the earlier cabinet depth.");
    const current = section("section-a", "Kitchen", "submitted", 2);
    mockGet.mockResolvedValue(review("project-a", [{ ...current, history: [...previous.history, ...current.history] }]));
    const { view } = await renderWith(<ClientSectionReview projectId="project-a" session={session([READ, DECIDE])} />);
    expect(await view.findByRole("header", { name: "Kitchen" })).toBeTruthy();
    expect(view.getByText("Design version 2 · Revision 2")).toBeTruthy();
    expect(view.getByText("Keep the earlier cabinet depth.")).toBeTruthy();
    expect(view.getByRole("button", { name: "Approve section" })).toBeTruthy();
  });

  it("treats a 409 as stale, refreshes the section, and never announces a saved decision", async () => {
    let current = review("project-a", [section("section-a", "Kitchen")]);
    mockGet.mockImplementation(async () => current);
    mockPost.mockImplementationOnce(async () => {
      current = review("project-a", [section("section-a", "Kitchen", "approved")]);
      throw new ApiError(409, "CONFLICT", "Changed");
    });
    const { view, client } = await renderWith(<ClientSectionReview projectId="project-a" session={session([READ, DECIDE])} />);
    expect(await view.findByRole("header", { name: "Kitchen" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "Approve section" }));
    await fireEvent.press(view.getByRole("button", { name: "Confirm approval" }));

    expect(await view.findByText(/This section changed/)).toBeTruthy();
    await waitFor(() => expect(view.getByRole("header", { name: "Review complete" })).toBeTruthy());
    expect(view.queryByText(/Review saved/)).toBeNull();
    expect(view.queryByRole("button", { name: "Confirm approval" })).toBeNull();
    expect(mockInvalidate).not.toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it("shows independent empty and completed states", async () => {
    mockGet.mockResolvedValueOnce(review("project-empty", []));
    const empty = await renderWith(<ClientSectionReview projectId="project-empty" session={session([READ])} />);
    expect(await empty.view.findByRole("header", { name: "No sections ready for review" })).toBeTruthy();
    await empty.view.unmount();

    mockGet.mockResolvedValueOnce(review("project-done", [section("section-a", "Kitchen", "approved")]));
    const done = await renderWith(<ClientSectionReview projectId="project-done" session={session([READ])} />);
    expect(await done.view.findByRole("header", { name: "Review complete" })).toBeTruthy();
    expect(done.view.getByRole("header", { name: "Kitchen" })).toBeTruthy();
    expect(done.view.queryByRole("button", { name: "Approve section" })).toBeNull();
  });
});
