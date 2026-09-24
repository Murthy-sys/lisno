import { fireEvent, render, waitFor } from "@testing-library/react-native";

import type { PublicUser } from "../contracts/session";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { ProfileAvatar, initialsForName } from "./ProfileAvatar";

jest.mock("../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

const useRuntimeMock = jest.mocked(useConfiguredRuntime);

const baseUser: PublicUser = { id: "user-1", name: "Meera Priya Nair", email: "meera@example.test", role: "designer" };

function configureTransfers(result: Promise<{ uri: string; release: () => Promise<void> }>) {
  const download = jest.fn(() => ({ result, cancel: jest.fn() }));
  const register = jest.fn(() => () => undefined);
  useRuntimeMock.mockReturnValue({
    runtime: { transfers: { download }, cleanups: { register } }
  } as unknown as ReturnType<typeof useConfiguredRuntime>);
  return { download, register };
}

describe("ProfileAvatar", () => {
  let logSpies: jest.SpyInstance[];

  beforeEach(() => {
    logSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) => jest.spyOn(console, method));
  });

  afterEach(() => {
    for (const spy of logSpies) spy.mockRestore();
  });

  it("derives first and last initials", () => {
    expect(initialsForName("Meera Priya Nair")).toBe("MN");
    expect(initialsForName("  aditi ")).toBe("A");
    expect(initialsForName("")).toBe("");
  });

  it("shows decorative initials without downloading when the user has no photo", async () => {
    const { download } = configureTransfers(new Promise(() => undefined));
    const view = await render(<ProfileAvatar user={baseUser} size={24} testID="avatar" />);
    const avatar = view.getByTestId("avatar", { includeHiddenElements: true });
    expect(avatar.props.accessibilityElementsHidden).toBe(true);
    expect(avatar.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(view.getByText("MN", { includeHiddenElements: true })).toBeTruthy();
    expect(download).not.toHaveBeenCalled();
  });

  it("loads the versioned photo through the authenticated transfer manager without logging", async () => {
    const release = jest.fn(() => Promise.resolve());
    const { download, register } = configureTransfers(Promise.resolve({ uri: "file:///cache/avatar.jpg", release }));
    const view = await render(<ProfileAvatar user={{ ...baseUser, profilePhotoVersion: 3 }} size={96} testID="avatar" />);
    const photo = await waitFor(() => view.getByTestId("avatar-photo", { includeHiddenElements: true }));
    expect(photo.props.source).toEqual({ uri: "file:///cache/avatar.jpg" });
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ path: "/users/user-1/profile-photo?v=3", mimeType: "image/jpeg" }));
    expect(register).toHaveBeenCalledWith("profile-photo-cache", expect.any(Function), expect.any(Number));
    expect(view.queryByText("MN", { includeHiddenElements: true })).toBeNull();
    for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("falls back to initials when the photo fails to render", async () => {
    const release = jest.fn(() => Promise.resolve());
    configureTransfers(Promise.resolve({ uri: "file:///cache/broken.jpg", release }));
    const view = await render(<ProfileAvatar user={{ ...baseUser, profilePhotoVersion: 4 }} size={24} testID="avatar" />);
    const photo = await waitFor(() => view.getByTestId("avatar-photo", { includeHiddenElements: true }));
    await fireEvent(photo, "error");
    expect(view.getByText("MN", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId("avatar-photo", { includeHiddenElements: true })).toBeNull();
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it("falls back to initials when the download is denied", async () => {
    configureTransfers(Promise.reject(new Error("denied")));
    const view = await render(<ProfileAvatar user={{ ...baseUser, profilePhotoVersion: 5 }} size={24} testID="avatar" />);
    await waitFor(() => expect(view.getByText("MN", { includeHiddenElements: true })).toBeTruthy());
    expect(view.queryByTestId("avatar-photo", { includeHiddenElements: true })).toBeNull();
    for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
  });
});
