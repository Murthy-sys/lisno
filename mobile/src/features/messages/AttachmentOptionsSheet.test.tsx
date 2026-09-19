import { fireEvent, render, within } from "@testing-library/react-native";
import { AccessibilityInfo, Dimensions, Pressable, Text, View } from "react-native";
import * as ReactNative from "react-native";
import {
  AttachmentOptionsSheet,
  type AttachmentOptionsSheetProps
} from "./AttachmentOptionsSheet";

function sheetProps(overrides: Partial<AttachmentOptionsSheetProps> = {}): AttachmentOptionsSheetProps {
  return {
    visible: true,
    compact: true,
    onRequestClose: jest.fn(),
    onChoosePhoto: jest.fn(),
    onTakePhoto: jest.fn(),
    onChooseFile: jest.fn(),
    ...overrides
  };
}

const initialWindow = Dimensions.get("window");
const initialScreen = Dimensions.get("screen");

function setWindow(width: number, fontScale: number) {
  Dimensions.set({
    window: { ...initialWindow, width, fontScale },
    screen: { ...initialScreen, width, fontScale }
  });
}

describe("AttachmentOptionsSheet", () => {
  beforeEach(() => setWindow(360, 1));
  afterAll(() => Dimensions.set({ window: initialWindow, screen: initialScreen }));

  it("presents the three accessible sources in the approved order", async () => {
    const view = await render(<AttachmentOptionsSheet {...sheetProps()} />);
    const panel = view.getByTestId("attachment-options-panel");
    const actions = within(panel).getAllByRole("button");

    expect(actions.map((action) => action.props.accessibilityLabel)).toEqual([
      "Choose a photo",
      "Take a photo",
      "Choose a file"
    ]);
    expect(within(panel).getByText("Photo")).toBeVisible();
    expect(within(panel).getByText("Camera")).toBeVisible();
    expect(within(panel).getByText("File")).toBeVisible();
    expect(within(panel).queryByText("Add to your message")).toBeNull();
    expect(within(panel).queryByText("Choose where your attachment comes from.")).toBeNull();
    expect(view.getByTestId("attachment-options-actions")).toHaveStyle({
      flexDirection: "row",
      gap: 4
    });
    for (const action of actions) {
      expect(action).toHaveStyle({ minWidth: 80, minHeight: 72 });
    }
  });

  it("reports Photo, Camera, and File choices through separate callbacks", async () => {
    const onChoosePhoto = jest.fn();
    const onTakePhoto = jest.fn();
    const onChooseFile = jest.fn();
    const view = await render(
      <AttachmentOptionsSheet
        {...sheetProps({ onChoosePhoto, onTakePhoto, onChooseFile })}
      />
    );

    await fireEvent.press(view.getByRole("button", { name: "Choose a photo" }));
    await fireEvent.press(view.getByRole("button", { name: "Take a photo" }));
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));

    expect(onChoosePhoto).toHaveBeenCalledTimes(1);
    expect(onTakePhoto).toHaveBeenCalledTimes(1);
    expect(onChooseFile).toHaveBeenCalledTimes(1);
  });

  it("dismisses from the backdrop and the Android modal Back callback", async () => {
    const onRequestClose = jest.fn();
    const view = await render(<AttachmentOptionsSheet {...sheetProps({ onRequestClose })} />);

    await fireEvent.press(view.getByLabelText("Close attachment options", { includeHiddenElements: true }));
    view.container.queryAll((instance) => instance.type === "Modal")[0]?.props.onRequestClose();

    expect(onRequestClose).toHaveBeenCalledTimes(2);
  });

  it("disables unavailable sources and locks every source while busy", async () => {
    const onChoosePhoto = jest.fn();
    const onTakePhoto = jest.fn();
    const onChooseFile = jest.fn();
    const props = sheetProps({
      photoAvailable: false,
      onChoosePhoto,
      onTakePhoto,
      onChooseFile
    });
    const view = await render(<AttachmentOptionsSheet {...props} />);

    const photo = view.getByRole("button", { name: "Choose a photo" });
    expect(photo).toBeDisabled();
    expect(photo.props.accessibilityHint).toBe("Photo is unavailable for this conversation.");
    await fireEvent.press(photo);
    expect(onChoosePhoto).not.toHaveBeenCalled();

    await view.rerender(<AttachmentOptionsSheet {...props} busy busySource="camera" />);
    const camera = view.getByRole("button", { name: "Take a photo" });
    expect(camera.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(view.getByRole("button", { name: "Choose a file" })).toBeDisabled();
    await fireEvent.press(camera);
    await fireEvent.press(view.getByRole("button", { name: "Choose a file" }));
    expect(onTakePhoto).not.toHaveBeenCalled();
    expect(onChooseFile).not.toHaveBeenCalled();
    expect(view.getByText("Opening your device picker…")).toBeVisible();
  });

  it("supports a whole-surface disabled state without disabling dismissal", async () => {
    const onRequestClose = jest.fn();
    const onChoosePhoto = jest.fn();
    const view = await render(
      <AttachmentOptionsSheet
        {...sheetProps({ disabled: true, onChoosePhoto, onRequestClose })}
      />
    );

    const photo = view.getByRole("button", { name: "Choose a photo" });
    expect(photo.props.accessibilityState).toEqual({ busy: false, disabled: true });
    await fireEvent.press(photo);
    await fireEvent.press(view.getByLabelText("Close attachment options", { includeHiddenElements: true }));

    expect(onChoosePhoto).not.toHaveBeenCalled();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("uses a phone modal and a bounded non-modal expanded composition", async () => {
    const props = sheetProps();
    const view = await render(<AttachmentOptionsSheet {...props} />);

    expect(view.container.queryAll((instance) => instance.type === "Modal")).toHaveLength(1);
    expect(view.getByTestId("attachment-options-panel")).toHaveStyle({
      width: "100%",
      maxWidth: 320,
      alignSelf: "center",
      borderRadius: 18,
      paddingHorizontal: 8,
      paddingVertical: 12
    });
    for (const label of ["Photo", "Camera", "File"]) {
      expect(view.getByText(label).props.numberOfLines).toBeUndefined();
    }

    await view.rerender(<AttachmentOptionsSheet {...props} compact={false} />);
    expect(view.container.queryAll((instance) => instance.type === "Modal")).toHaveLength(0);
    expect(view.getByTestId("attachment-options-expanded-anchor")).toHaveStyle({
      width: "100%",
      flexDirection: "row",
      alignItems: "flex-start",
      zIndex: 20
    });
    expect(view.getByTestId("attachment-options-panel")).toHaveStyle({
      width: "100%",
      maxWidth: 320
    });
  });

  it("reflows to 48 dp horizontal rows for large text or very narrow windows", async () => {
    setWindow(320, 2);
    const view = await render(<AttachmentOptionsSheet {...sheetProps()} />);

    expect(view.getByTestId("attachment-options-actions")).toHaveStyle({
      flexDirection: "column"
    });
    for (const action of within(view.getByTestId("attachment-options-panel")).getAllByRole("button")) {
      expect(action).toHaveStyle({
        width: "100%",
        minWidth: 48,
        minHeight: 48,
        flexDirection: "row"
      });
    }
  });

  it("dismisses from an outside thread-pane tap without blocking the conversation list", async () => {
    const onRequestClose = jest.fn();
    const onChooseConversation = jest.fn();
    const view = await render(
      <View>
        <Pressable accessibilityLabel="Open another conversation" accessibilityRole="button" onPress={onChooseConversation}>
          <Text>Villa</Text>
        </Pressable>
        <AttachmentOptionsSheet {...sheetProps({ compact: false, onRequestClose })} />
      </View>
    );

    expect(view.container.queryAll((instance) => instance.type === "Modal")).toHaveLength(0);
    const outsidePress = view.getByTestId("attachment-options-expanded-outside-press");
    expect(outsidePress).toHaveStyle({ minWidth: 48, flex: 1, alignSelf: "stretch" });
    await fireEvent.press(outsidePress);
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByRole("button", { name: "Open another conversation" }));
    expect(onChooseConversation).toHaveBeenCalledTimes(1);
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("requests initial Photo focus and restores the paperclip focus after closing", async () => {
    const onRestoreFocus = jest.fn();
    const props = sheetProps({ onRestoreFocus });
    const nodeHandle = jest.spyOn(ReactNative, "findNodeHandle").mockReturnValue(42);
    const focus = jest.spyOn(AccessibilityInfo, "setAccessibilityFocus").mockImplementation(() => undefined);
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };

    try {
      const view = await render(<AttachmentOptionsSheet {...props} />);
      view.container.queryAll((instance) => instance.type === "Modal")[0]?.props.onShow();
      expect(focus).toHaveBeenCalledTimes(1);

      await view.rerender(<AttachmentOptionsSheet {...props} visible={false} />);
      expect(onRestoreFocus).toHaveBeenCalledTimes(1);
    } finally {
      global.requestAnimationFrame = originalRequestAnimationFrame;
      nodeHandle.mockRestore();
      focus.mockRestore();
    }
  });
});
