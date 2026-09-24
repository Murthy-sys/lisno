import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { PublicUser } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { capturePhoto, pickImage, releaseSelectedAsset, TransferHttpError } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ProfileScreen } from "./ProfileScreen";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() }
}));

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: jest.fn()
}));

jest.mock("../../navigation/AdaptiveAppScaffold", () => ({
  AdaptiveAppScaffold: ({ children }: { readonly children: import("react").ReactNode }) => {
    const React = jest.requireActual("react") as typeof import("react");
    const { View } = jest.requireActual("react-native") as typeof import("react-native");
    return React.createElement(View, null, children);
  }
}));

jest.mock("../../navigation/ProfileAvatar", () => ({
  ProfileAvatar: ({ user, size }: { readonly user: { readonly profilePhotoVersion?: number }; readonly size: number }) => {
    const React = jest.requireActual("react") as typeof import("react");
    const { Text } = jest.requireActual("react-native") as typeof import("react-native");
    return React.createElement(Text, null, `avatar:${size}:${user.profilePhotoVersion ?? "none"}`);
  }
}));

jest.mock("../../platform/files", () => ({
  ...jest.requireActual("../../platform/files"),
  pickImage: jest.fn(),
  capturePhoto: jest.fn(),
  releaseSelectedAsset: jest.fn(async () => undefined)
}));

const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const pickImageMock = jest.mocked(pickImage);
const capturePhotoMock = jest.mocked(capturePhoto);

const baseUser: PublicUser = {
  id: "user-1",
  name: "Asha Rao",
  email: "asha@example.test",
  role: "designer"
};

const asset = {
  uri: "file:///cache/avatar.jpg",
  name: "avatar.jpg",
  mimeType: "image/jpeg",
  size: 2048,
  width: 512,
  height: 512
};

function setup(options: { readonly user?: PublicUser; readonly permissions?: readonly string[] } = {}) {
  const user = options.user ?? baseUser;
  const upload = jest.fn();
  const remove = jest.fn();
  const replaceUser = jest.fn(() => true);
  useConfiguredRuntimeMock.mockReturnValue({
    configured: true,
    booted: true,
    runtime: {
      session: { replaceUser },
      transfers: { upload },
      api: { authenticated: { delete: remove } }
    },
    environment: {
      environment: { id: "remote:https://api.example.test/api/v1" },
      generation: 0,
      status: "ready"
    },
    session: {
      status: "authenticated",
      generation: 4,
      failure: null,
      session: {
        user,
        authorization: {
          role: user.role,
          policyVersion: AUTHORIZATION_POLICY_VERSION,
          permissions: options.permissions ?? ["identity.self.read", "identity.self.profile_photo.manage"]
        }
      }
    },
    initializationError: null,
    retryRestore: jest.fn()
  } as never);
  return { upload, remove, replaceUser };
}

describe("ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the read-only name, email, role, and a 96pt avatar", async () => {
    setup();
    await render(<ProfileScreen />);

    expect(screen.getByRole("header", { name: "Profile" })).toBeTruthy();
    expect(screen.getByLabelText("Name, Asha Rao")).toBeTruthy();
    expect(screen.getByLabelText("Email, asha@example.test")).toBeTruthy();
    expect(screen.getByLabelText("Role, Designer")).toBeTruthy();
    expect(screen.getByText("avatar:96:none")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("hides photo actions without the profile-photo permission", async () => {
    setup({ permissions: ["identity.self.read"] });
    await render(<ProfileScreen />);
    expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
  });

  it("picks a square-cropped library photo, uploads it, and updates the session user", async () => {
    const { upload, replaceUser } = setup();
    const updated = { ...baseUser, profilePhotoVersion: 1 };
    pickImageMock.mockResolvedValueOnce({ status: "selected", asset });
    upload.mockReturnValueOnce({
      result: Promise.resolve({ user: updated }),
      cancel: jest.fn()
    });

    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Add photo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    await waitFor(() => expect(replaceUser).toHaveBeenCalledWith(updated));
    expect(pickImageMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxBytes: 5 * 1024 * 1024 }),
      expect.objectContaining({ userId: "user-1", sessionGeneration: 4 }),
      { squareCrop: true }
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0]).toMatchObject({
      path: "/auth/me/profile-photo",
      method: "PUT",
      fieldName: "photo",
      fileUri: asset.uri
    });
    expect(await screen.findByText("Profile photo updated.")).toBeTruthy();
    expect(releaseSelectedAsset).toHaveBeenCalledWith(asset);
  });

  it("uses the camera with a square crop when chosen", async () => {
    const { upload } = setup();
    capturePhotoMock.mockResolvedValueOnce({ status: "permission-denied-temporary" });

    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Add photo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Take photo" }));

    expect(await screen.findByText(/Camera access is needed/u)).toBeTruthy();
    expect(capturePhotoMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), { squareCrop: true });
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("makes no request when the pick is cancelled", async () => {
    const { upload, replaceUser } = setup();
    pickImageMock.mockResolvedValueOnce({ status: "cancelled" });

    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Add photo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy());
    expect(upload).not.toHaveBeenCalled();
    expect(replaceUser).not.toHaveBeenCalled();
  });

  it("shows a friendly error and retries the same photo", async () => {
    const { upload, replaceUser } = setup();
    const updated = { ...baseUser, profilePhotoVersion: 1 };
    pickImageMock.mockResolvedValueOnce({ status: "selected", asset });
    upload
      .mockImplementationOnce(() => ({
        result: Promise.reject(new TransferHttpError(413, "PROFILE_PHOTO_TOO_LARGE", "raw server text")),
        cancel: jest.fn()
      }))
      .mockImplementationOnce(() => ({ result: Promise.resolve({ user: updated }), cancel: jest.fn() }));

    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Add photo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    expect(await screen.findByText("That photo is larger than 5 MB. Choose a smaller photo.")).toBeTruthy();
    expect(screen.queryByText("raw server text")).toBeNull();
    expect(replaceUser).not.toHaveBeenCalled();
    expect(releaseSelectedAsset).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(replaceUser).toHaveBeenCalledWith(updated));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][0]).toMatchObject({ fileUri: asset.uri });
    expect(pickImageMock).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation before removing the photo with DELETE", async () => {
    const { remove, replaceUser } = setup({ user: { ...baseUser, profilePhotoVersion: 3 } });
    remove.mockResolvedValueOnce({ user: baseUser });

    await render(<ProfileScreen />);
    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
    expect(remove).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Confirm remove" }));

    await waitFor(() => expect(replaceUser).toHaveBeenCalledWith(baseUser));
    expect(remove).toHaveBeenCalledWith("/auth/me/profile-photo", undefined, expect.objectContaining({ signal: expect.anything() }));
    expect(await screen.findByText("Profile photo removed.")).toBeTruthy();
  });

  it("shows an error and retries a failed removal", async () => {
    const { remove, replaceUser } = setup({ user: { ...baseUser, profilePhotoVersion: 3 } });
    remove
      .mockRejectedValueOnce(new ApiError(409, "PROFILE_PHOTO_CONFLICT", "raw"))
      .mockResolvedValueOnce({ user: baseUser });

    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Confirm remove" }));

    expect(await screen.findByText("Your photo was changed at the same time. Try again.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(replaceUser).toHaveBeenCalledWith(baseUser));
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
