import { render } from "@testing-library/react-native";
import { Text } from "react-native";

import { AppModalBackdrop, useModalBackdrop } from "./AppModalBackdrop";

let mockReducedTransparency = false;
jest.mock("./ChromeSurface", () => ({ useReducedTransparency: () => mockReducedTransparency }));

function ModalOwner({ visible }: { readonly visible: boolean }) {
  useModalBackdrop(visible);
  return null;
}

function Fixture({ first = false, second = false }: { readonly first?: boolean; readonly second?: boolean }) {
  return <AppModalBackdrop><Text>Projects background</Text><ModalOwner visible={first} /><ModalOwner visible={second} /></AppModalBackdrop>;
}

describe("AppModalBackdrop", () => {
  beforeEach(() => { mockReducedTransparency = false; });

  it("activates native blur only while open and hides the underlying accessibility tree", async () => {
    const view = await render(<Fixture />);
    expect(view.queryByTestId("app-modal-blur", { includeHiddenElements: true })).toBeNull();
    expect(view.getByText("Projects background")).toBeTruthy();
    await view.rerender(<Fixture first />);
    const blur = view.getByTestId("app-modal-blur", { includeHiddenElements: true });
    expect(blur.props.blurMethod).toBe("dimezisBlurView");
    expect(blur.props.blurTarget).toBeDefined();
    expect(view.queryByText("Projects background")).toBeNull();
    expect(view.getByTestId("app-modal-background", { includeHiddenElements: true }).props.importantForAccessibility).toBe("no-hide-descendants");
    await view.rerender(<Fixture />);
    expect(view.queryByTestId("app-modal-blur", { includeHiddenElements: true })).toBeNull();
    expect(view.getByText("Projects background")).toBeTruthy();
  });

  it("keeps the background blocked until every modal releases it", async () => {
    const view = await render(<Fixture first second />);
    await view.rerender(<Fixture second />);
    expect(view.getByTestId("app-modal-blur", { includeHiddenElements: true })).toBeTruthy();
    await view.rerender(<Fixture />);
    expect(view.queryByTestId("app-modal-blur", { includeHiddenElements: true })).toBeNull();
  });

  it("releases a backdrop when the owning form is unmounted", async () => {
    const view = await render(<AppModalBackdrop><ModalOwner visible /></AppModalBackdrop>);
    await view.rerender(<AppModalBackdrop><Text>New owner</Text></AppModalBackdrop>);
    expect(view.queryByTestId("app-modal-blur", { includeHiddenElements: true })).toBeNull();
    expect(view.getByText("New owner")).toBeTruthy();
  });

  it("uses an opaque themed surface when reduced transparency is enabled", async () => {
    mockReducedTransparency = true;
    const view = await render(<Fixture first />);
    expect(view.queryByTestId("app-modal-blur", { includeHiddenElements: true })).toBeNull();
    expect(view.getByTestId("app-modal-opaque-backdrop", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText("Projects background")).toBeNull();
  });
});
