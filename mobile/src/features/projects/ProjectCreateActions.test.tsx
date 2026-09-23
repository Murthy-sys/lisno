import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { AUTHORIZATION_POLICY_VERSION, type Role } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useModalBackdrop } from "../../ui/AppModalBackdrop";
import { ProjectCreateAction } from "./ProjectCreateActions";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../ui/AppModalBackdrop", () => ({ useModalBackdrop: jest.fn() }));
const mockNavigationGuard = { setBlocked: jest.fn() };
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => mockNavigationGuard }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }));
jest.mock("../onboarding/useReducedMotion", () => ({ useReducedMotion: () => false }));

const runtimeMock = jest.mocked(useConfiguredRuntime);
const apiGet = jest.fn();
const apiPost = jest.fn();
const clients: QueryClient[] = [];

function sessionFor(role: Role, permissions: AuthenticatedSession["authorization"]["permissions"]): AuthenticatedSession {
  return {
    user: { id: `${role}-1`, name: "Test operator", email: "operator@example.test", role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions }
  };
}

function runtimeFor(session: AuthenticatedSession, environmentId = "test-environment", environmentGeneration = 0, sessionGeneration = 0) {
  return {
    environment: { environment: { id: environmentId }, generation: environmentGeneration },
    session: { status: "authenticated", session, generation: sessionGeneration },
    runtime: { api: { authenticated: { get: apiGet, post: apiPost } } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>;
}

async function harness(session: AuthenticatedSession) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity }
    }
  });
  clients.push(client);
  runtimeMock.mockReturnValue(runtimeFor(session));
  const view = await render(
    <QueryClientProvider client={client}>
      <ProjectCreateAction session={session} />
    </QueryClientProvider>
  );
  return { client, view };
}

const projectFields = {
  "Project / property name": "  Lakeside Villa  ",
  "Property type": "Residential",
  Location: "Bengaluru",
  "Client name": "New client",
  "Client email": "new.client@example.test",
  "Client mobile": "9990001112",
  "Minimum budget": "1500000",
  "Maximum budget": "2700000",
  "Next action": "Arrange a site visit",
  "Next action time (ISO 8601)": "2026-10-02T09:00:00Z"
};

async function fillInitiation(view: Awaited<ReturnType<typeof render>>) {
  for (const [label, value] of Object.entries(projectFields)) {
    await fireEvent.changeText(view.getByLabelText(label), value);
  }
  await fireEvent.press(await view.findByRole("radio"));
}

// Capture the handlers before React renders pending state, as two queued native
// events can arrive in the same turn. Normal fireEvent flushes between events.
function pressHandler(button: ReturnType<Awaited<ReturnType<typeof render>>["getByRole"]>): () => void {
  let fiber = button.unstable_fiber;
  while (fiber) {
    if (typeof fiber.memoizedProps?.onPress === "function") return fiber.memoizedProps.onPress;
    fiber = fiber.return;
  }
  throw new Error("The button has no press handler.");
}

beforeEach(() => {
  jest.clearAllMocks();
  apiGet.mockReset().mockResolvedValue({ items: [{ id: "assigned-person", name: "Assigned colleague" }] });
  apiPost.mockReset().mockResolvedValue({ id: "new-project" });
});

afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});

describe("Project creation entry action", () => {
  it.each(["client", "admin", "designer"] as const)("does not show an unauthorized %s action or load options", async (role) => {
    const { view } = await harness(sessionFor(role, []));
    expect(view.queryByRole("button")).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", "projects.initiate", "Initiate project", "Project / property name"],
    ["designer", "projects.create", "Create project", "Project name"]
  ] as const)("opens the %s modal and retains its draft after cancellation", async (role, permission, label, field) => {
    const { view } = await harness(sessionFor(role, [permission]));
    const trigger = view.getByRole("button", { name: label });
    expect(trigger.props.accessibilityHint).toBe("Start a new project and bring your vision to life.");
    expect(view.getByText("Start a new project and bring your vision to life.")).toBeTruthy();
    expect(apiGet).not.toHaveBeenCalled();

    await fireEvent.press(trigger);
    expect(view.getByRole("header", { name: label })).toBeTruthy();
    expect(view.getByTestId("project-creation-modal").props).toMatchObject({ visible: true, transparent: true, presentationStyle: "overFullScreen", statusBarTranslucent: true, navigationBarTranslucent: true });
    expect(view.getByTestId("project-creation-panel").props.accessibilityViewIsModal).toBe(true);
    expect(view.getByTestId("project-creation-fields").props.keyboardShouldPersistTaps).toBe("handled");
    expect(useModalBackdrop).toHaveBeenLastCalledWith(true);
    expect(mockNavigationGuard.setBlocked).toHaveBeenLastCalledWith(true);
    await fireEvent.changeText(view.getByLabelText(field), "Retained draft");
    await fireEvent.press(view.getByRole("button", { name: "Cancel" }));
    expect(view.queryByLabelText(field)).toBeNull();
    expect(useModalBackdrop).toHaveBeenLastCalledWith(false);
    expect(mockNavigationGuard.setBlocked).toHaveBeenLastCalledWith(false);
    expect(apiPost).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole("button", { name: label }));
    expect(view.getByLabelText(field).props.value).toBe("Retained draft");
    if (role === "designer") {
      expect(apiGet).toHaveBeenCalledWith("/organization/managers?search=&limit=20&offset=0", expect.any(Object));
    }
  });

  it.each([
    ["admin", "/admin/estimators", "estimatorId"],
    ["super_admin", "/admin/estimators", "estimatorId"],
    ["estimator_sales", "/admin/sales-managers", "salesManagerId"]
  ] as const)("uses the authorized assignment contract for %s and refreshes only that identity", async (role, optionPath, assignmentField) => {
    const session = sessionFor(role, ["projects.initiate"]);
    const { client, view } = await harness(session);
    const currentScope = ["test-environment", session.user.id];
    for (const family of ["projects", "dashboard", "leads"]) {
      client.setQueryData([...currentScope, family, "list"], { retained: true });
    }
    const otherIdentityKey = ["test-environment", "other-user", "projects", "list"];
    client.setQueryData(otherIdentityKey, { retained: true });

    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    await fillInitiation(view);
    expect(apiGet).toHaveBeenCalledWith(`${optionPath}?search=&limit=20&offset=0`, expect.any(Object));
    await fireEvent.press(view.getByRole("button", { name: "Initiate" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/admin/projects", {
      clientName: "New client",
      clientEmail: "new.client@example.test",
      clientMobile: "9990001112",
      projectName: "Lakeside Villa",
      location: "Bengaluru",
      propertyType: "Residential",
      budgetMin: 1500000,
      budgetMax: 2700000,
      nextAction: "Arrange a site visit",
      nextActionAt: "2026-10-02T09:00:00.000Z",
      [assignmentField]: "assigned-person"
    });
    await waitFor(() => expect(view.queryByLabelText("Project / property name")).toBeNull());
    for (const family of ["projects", "dashboard", "leads"]) {
      expect(client.getQueryState([...currentScope, family, "list"])?.isInvalidated).toBe(true);
    }
    expect(client.getQueryState(otherIdentityKey)?.isInvalidated).toBe(false);
  });

  it("keeps the form open and does not submit an incomplete project", async () => {
    const { view } = await harness(sessionFor("super_admin", ["projects.initiate"]));
    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    await fireEvent.press(view.getByRole("button", { name: "Initiate" }));
    expect(await view.findByText("Complete every field, choose an active assignee, enter a valid budget range and next-action time.")).toBeTruthy();
    expect(view.getByLabelText("Project / property name")).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("preserves the Designer creation payload and closes the modal after saving", async () => {
    const session = sessionFor("designer", ["projects.create"]);
    const { view } = await harness(session);
    await fireEvent.press(view.getByRole("button", { name: "Create project" }));
    for (const [label, value] of Object.entries({
      "Project name": "  Studio residence  ",
      Location: "Chennai",
      "Client name": "Studio client",
      "Client email": "studio.client@example.test",
      "Client mobile": "9990002223",
      "Client address": "1 Studio Road",
      "Additional Designer IDs (optional)": "designer-2, designer-1, designer-2",
      "Planned start (ISO 8601)": "2026-10-01T09:00:00Z",
      "Planned end (ISO 8601)": "2026-10-30T09:00:00Z"
    })) await fireEvent.changeText(view.getByLabelText(label), value);
    await fireEvent.press(await view.findByRole("radio"));
    await fireEvent.press(view.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/projects", {
      name: "Studio residence", location: "Chennai", clientName: "Studio client",
      clientEmail: "studio.client@example.test", clientMobile: "9990002223", clientAddress: "1 Studio Road",
      assignedDesignerIds: ["designer-1", "designer-2"], managerId: "assigned-person",
      plannedStartAt: "2026-10-01T09:00:00.000Z", plannedEndAt: "2026-10-30T09:00:00.000Z"
    });
    await waitFor(() => expect(view.queryByLabelText("Project name")).toBeNull());
  });

  it.each(["close", "backdrop", "hardware back"] as const)("dismisses with %s and preserves the unsaved draft", async (action) => {
    const { view } = await harness(sessionFor("admin", ["projects.initiate"]));
    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    await fireEvent.changeText(view.getByLabelText("Project / property name"), "Unsaved villa");
    if (action === "hardware back") {
      await act(() => view.getByTestId("project-creation-modal").props.onRequestClose());
    } else {
      await fireEvent.press(view.getByRole("button", { name: action === "close" ? "Close project form" : "Dismiss project form" }));
    }
    expect(view.queryByRole("header", { name: "Initiate project" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    expect(view.getByLabelText("Project / property name").props.value).toBe("Unsaved villa");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("blocks same-tick duplicate submissions and all dismissal while the request is pending", async () => {
    let finish!: (value: unknown) => void;
    apiPost.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { view } = await harness(sessionFor("admin", ["projects.initiate"]));
    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    await fillInitiation(view);
    const submit = pressHandler(view.getByRole("button", { name: "Initiate" }));
    const close = pressHandler(view.getByRole("button", { name: "Close project form" }));
    const cancel = pressHandler(view.getByRole("button", { name: "Cancel" }));
    const dismiss = pressHandler(view.getByRole("button", { name: "Dismiss project form" }));
    const back = view.getByTestId("project-creation-modal").props.onRequestClose;
    await act(() => { submit(); submit(); close(); cancel(); dismiss(); back(); });
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(view.getByRole("header", { name: "Initiate project" })).toBeTruthy();
    expect(view.getByLabelText("Project / property name").props.editable).toBe(false);
    for (const name of ["Initiate", "Cancel", "Close project form", "Dismiss project form"]) {
      expect(view.getByRole("button", { name }).props.accessibilityState.disabled).toBe(true);
    }
    await act(() => finish({ id: "new-project" }));
    await waitFor(() => expect(view.queryByLabelText("Project / property name")).toBeNull());
    expect(mockNavigationGuard.setBlocked).toHaveBeenLastCalledWith(false);
  });

  it("retains data after a failed save and allows a retry", async () => {
    apiPost.mockRejectedValueOnce(new Error("Project could not be saved. Try again."));
    const { view } = await harness(sessionFor("super_admin", ["projects.initiate"]));
    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    await fillInitiation(view);
    await fireEvent.press(view.getByRole("button", { name: "Initiate" }));
    expect(await view.findByText("Project could not be saved. Try again.")).toBeTruthy();
    expect(view.getByLabelText("Project / property name").props.value).toBe(projectFields["Project / property name"]);
    await fireEvent.press(view.getByRole("button", { name: "Initiate" }));
    await waitFor(() => expect(view.queryByLabelText("Project / property name")).toBeNull());
    expect(apiPost).toHaveBeenCalledTimes(2);
  });

  it.each(["environment", "environment generation", "session generation", "identity", "role"] as const)("clears drafts when the %s changes", async (change) => {
    const session = sessionFor("admin", ["projects.initiate"]);
    const { client, view } = await harness(session);
    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    await fireEvent.changeText(view.getByLabelText("Project / property name"), "Private draft");
    const nextSession = change === "identity"
      ? { ...session, user: { ...session.user, id: "another-admin" } }
      : change === "role" ? sessionFor("super_admin", ["projects.initiate"]) : session;
    runtimeMock.mockReturnValue(runtimeFor(nextSession, change === "environment" ? "another-environment" : "test-environment", change === "environment generation" ? 1 : 0, change === "session generation" ? 1 : 0));
    await view.rerender(<QueryClientProvider client={client}><ProjectCreateAction session={nextSession} /></QueryClientProvider>);
    expect(view.queryByLabelText("Project / property name")).toBeNull();
    expect(mockNavigationGuard.setBlocked).toHaveBeenLastCalledWith(false);
    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    expect(view.getByLabelText("Project / property name").props.value).toBe("");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("lets the form scroll through every assignee instead of clipping a long list", async () => {
    apiGet.mockResolvedValueOnce({ items: Array.from({ length: 20 }, (_, index) => ({ id: `person-${index}`, name: `Colleague ${index + 1}` })) });
    const { view } = await harness(sessionFor("admin", ["projects.initiate"]));
    await fireEvent.press(view.getByRole("button", { name: "Initiate project" }));
    await view.findByText("Colleague 20");
    expect(view.getAllByRole("radio")).toHaveLength(20);
    await fireEvent.press(view.getByText("Colleague 20"));
    expect(view.getByText("Selected: Colleague 20")).toBeTruthy();
  });
});
