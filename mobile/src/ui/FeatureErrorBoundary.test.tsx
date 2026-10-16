import { fireEvent, render } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";

import { FeatureErrorBoundary } from "./FeatureErrorBoundary";

describe("feature render recovery", () => {
  const privateMessage = "synthetic-private-token=do-not-display; record=confidential";

  beforeEach(() => {
    // React reports deliberately thrown errors even when a boundary handles them.
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("shows accessible recovery actions without exposing the exception", async () => {
    function FailedFeature(): never { throw new Error(privateMessage); }
    const onLeave = jest.fn();
    const view = await render(<FeatureErrorBoundary onLeave={onLeave}><FailedFeature /></FeatureErrorBoundary>);

    expect(view.getByRole("header", { name: "This screen couldn't be displayed" })).toBeTruthy();
    expect(view.getByRole("alert")).toHaveTextContent("Try again to reopen it, or go back to another screen.");
    expect(view.getByText("Unsaved changes on this screen may be lost.")).toBeTruthy();
    expect(view.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(view.getByRole("button", { name: "Go back" })).toBeEnabled();
    expect(JSON.stringify(view.toJSON())).not.toContain(privateMessage);

    await fireEvent.press(view.getByRole("button", { name: "Go back" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("unmounts failed content and explicitly retries with fresh local state", async () => {
    const mounted = jest.fn();
    const unmounted = jest.fn();
    let fail = false;
    function Editor() {
      const [draft, setDraft] = useState("");
      useEffect(() => { mounted(); return unmounted; }, []);
      if (fail) throw new Error(privateMessage);
      return <TextInput accessibilityLabel="Draft" value={draft} onChangeText={setDraft} />;
    }
    const onLeave = jest.fn();
    const view = await render(<FeatureErrorBoundary onLeave={onLeave}><Editor /></FeatureErrorBoundary>);
    await fireEvent.changeText(view.getByLabelText("Draft"), "Unsaved edit");
    expect(view.getByLabelText("Draft")).toHaveProp("value", "Unsaved edit");

    fail = true;
    await view.rerender(<FeatureErrorBoundary onLeave={onLeave}><Editor /></FeatureErrorBoundary>);
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText("Draft")).toBeNull();

    fail = false;
    await fireEvent.press(view.getByRole("button", { name: "Try again" }));
    expect(view.getByLabelText("Draft")).toHaveProp("value", "");
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(view.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("contains repeated failures until an explicit retry succeeds", async () => {
    let fail = true;
    const attempted = jest.fn();
    function Feature() {
      attempted();
      if (fail) throw new Error(privateMessage);
      return <Text>Feature recovered</Text>;
    }
    const view = await render(<FeatureErrorBoundary onLeave={jest.fn()}><Feature /></FeatureErrorBoundary>);
    const initialAttempts = attempted.mock.calls.length;
    await fireEvent.press(view.getByRole("button", { name: "Try again" }));
    expect(attempted.mock.calls.length).toBeGreaterThan(initialAttempts);
    expect(view.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Go back" })).toBeTruthy();
    expect(view.queryByText("Feature recovered")).toBeNull();
    expect(JSON.stringify(view.toJSON())).not.toContain(privateMessage);

    const failedAttempts = attempted.mock.calls.length;
    fail = false;
    await view.rerender(<FeatureErrorBoundary onLeave={jest.fn()}><Feature /></FeatureErrorBoundary>);
    expect(attempted).toHaveBeenCalledTimes(failedAttempts);
    await fireEvent.press(view.getByRole("button", { name: "Try again" }));
    expect(view.getByText("Feature recovered")).toBeTruthy();
  });
});
