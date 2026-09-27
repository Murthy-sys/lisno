import { useState } from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { emptyAnnotationDocument, type AnnotationDocumentV1, type AnnotationElementV1 } from "../../platform/annotations/document";
import { NativeAnnotationEditor } from "./NativeAnnotationEditor";

jest.mock("react-native-svg", () => {
  const React = require("react") as typeof import("react");
  const { View, Text } = require("react-native") as typeof import("react-native");
  const shape = (props: object) => React.createElement(View, props);
  return {
    __esModule: true, default: shape, Circle: shape, Ellipse: shape, Image: shape,
    Line: shape, Path: shape, Polyline: shape, Rect: shape, Text
  };
});

const source = "file:///private/tmp/plan-page.png";

function ControlledEditor({ onChange, readOnly = false, initial = emptyAnnotationDocument(2000, 1000), sharedAnnotations = [] }: {
  readonly onChange?: (next: AnnotationDocumentV1) => void;
  readonly readOnly?: boolean;
  readonly initial?: AnnotationDocumentV1;
  readonly sharedAnnotations?: readonly AnnotationElementV1[];
}) {
  const [value, setValue] = useState(initial);
  return <NativeAnnotationEditor imageUri={source} imageWidth={2000} imageHeight={1000}
    value={value} readOnly={readOnly} sharedAnnotations={sharedAnnotations}
    onChange={(next) => { setValue(next); onChange?.(next); }} />;
}

describe("native annotation editor", () => {
  it("adds a mark without dragging, then supports undo and redo", async () => {
    const onChange = jest.fn();
    const view = await render(<ControlledEditor onChange={onChange} />);
    await fireEvent.press(view.getByLabelText("Rectangle tool"));
    await fireEvent.press(view.getByLabelText("Add rectangle at center without dragging"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      elements: [expect.objectContaining({ type: "rectangle", x: 0.4, y: 0.4, width: 0.2, height: 0.2 })]
    }));
    expect(view.getByText("Annotations (1)")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Undo annotation"));
    expect(view.getByText("Annotations (0)")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Redo annotation"));
    expect(view.getByText("Annotations (1)")).toBeTruthy();
  });

  it("draws with a one-finger gesture and keeps navigation separate", async () => {
    const onChange = jest.fn();
    const view = await render(<ControlledEditor onChange={onChange} />);
    const stage = view.getByLabelText("Drawing annotation canvas");
    await fireEvent(stage, "layout", { nativeEvent: { layout: { width: 300, height: 320 } } });
    await fireEvent.press(view.getByLabelText("Rectangle tool"));
    await fireEvent(stage, "responderGrant", { nativeEvent: { locationX: 60, locationY: 115, touches: [{ locationX: 60, locationY: 115 }] } });
    await fireEvent(stage, "responderMove", { nativeEvent: { locationX: 180, locationY: 190, touches: [{ locationX: 180, locationY: 190 }] } });
    await fireEvent(stage, "responderRelease", { nativeEvent: { locationX: 180, locationY: 190, touches: [] } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].elements[0]).toMatchObject({ type: "rectangle", x: 0.2, y: 0.2, width: 0.4, height: 0.5 });
    await fireEvent.press(view.getByLabelText("Pan tool"));
    await fireEvent.press(view.getByLabelText("Zoom in"));
    await fireEvent(stage, "responderGrant", { nativeEvent: { locationX: 120, locationY: 140, touches: [{ locationX: 120, locationY: 140 }] } });
    await fireEvent(stage, "responderMove", { nativeEvent: { locationX: 150, locationY: 150, touches: [{ locationX: 150, locationY: 150 }] } });
    await fireEvent(stage, "responderRelease", { nativeEvent: { locationX: 150, locationY: 150, touches: [] } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("cancels a one-finger mark when a second finger starts pinch navigation", async () => {
    const onChange = jest.fn();
    const view = await render(<ControlledEditor onChange={onChange} />);
    const stage = view.getByLabelText("Drawing annotation canvas");
    await fireEvent(stage, "layout", { nativeEvent: { layout: { width: 300, height: 320 } } });
    await fireEvent.press(view.getByLabelText("Freehand tool"));
    await fireEvent(stage, "responderGrant", { nativeEvent: { locationX: 60, locationY: 115, touches: [{ locationX: 60, locationY: 115 }] } });
    await fireEvent(stage, "responderMove", { nativeEvent: { locationX: 80, locationY: 130,
      touches: [{ locationX: 80, locationY: 130 }, { locationX: 160, locationY: 160 }] } });
    await fireEvent(stage, "responderMove", { nativeEvent: { locationX: 90, locationY: 120,
      touches: [{ locationX: 90, locationY: 120 }, { locationX: 190, locationY: 170 }] } });
    await fireEvent(stage, "responderRelease", { nativeEvent: { locationX: 90, locationY: 120, touches: [] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("creates and edits text with named controls", async () => {
    const onChange = jest.fn();
    const view = await render(<ControlledEditor onChange={onChange} />);
    await fireEvent.press(view.getByLabelText("Text tool"));
    await fireEvent.press(view.getByLabelText("Add text at center without dragging"));
    await fireEvent.changeText(view.getByLabelText("Annotation text"), "Raise the wall");
    await fireEvent.press(view.getByLabelText("Save text annotation"));
    expect(onChange.mock.calls[0][0].elements[0]).toMatchObject({ type: "text", text: "Raise the wall" });
    await fireEvent.press(view.getByLabelText("Edit text annotation"));
    await fireEvent.changeText(view.getByLabelText("Annotation text"), "Lower the wall");
    await fireEvent.press(view.getByLabelText("Save text annotation"));
    expect(onChange.mock.calls[1][0].elements[0]).toMatchObject({ type: "text", text: "Lower the wall" });
  });

  it("offers all V1 drawing tools and lets a selected mark move and be removed", async () => {
    const onChange = jest.fn();
    const view = await render(<ControlledEditor onChange={onChange} />);
    for (const tool of ["Ellipse", "Arrow", "Freehand"] as const) {
      await fireEvent.press(view.getByLabelText(`${tool} tool`));
      await fireEvent.press(view.getByLabelText(`Add ${tool.toLowerCase()} at center without dragging`));
    }
    const latest = onChange.mock.calls.at(-1)?.[0] as AnnotationDocumentV1;
    expect(latest.elements.map((element) => element.type)).toEqual(["ellipse", "arrow", "freehand"]);
    await fireEvent.press(view.getByLabelText("Move annotation right"));
    expect(onChange.mock.calls.at(-1)?.[0].elements[2].points[0].x).toBeGreaterThan(0.4);
    await fireEvent.press(view.getByLabelText("Remove selected annotation"));
    expect(onChange.mock.calls.at(-1)?.[0].elements.map((element: { type: string }) => element.type)).toEqual(["ellipse", "arrow"]);
  });

  it("shows submitted marks read only with accessible inspection and 44 dp controls", async () => {
    const initial: AnnotationDocumentV1 = {
      ...emptyAnnotationDocument(2000, 1000),
      elements: [{ id: "mark", type: "text", x: 0.5, y: 0.5, text: "Change door", color: "#B42318", strokeWidth: 4 }]
    };
    const onChange = jest.fn();
    const view = await render(<ControlledEditor initial={initial} readOnly onChange={onChange} />);
    expect(view.queryByLabelText("Rectangle tool")).toBeNull();
    expect(view.getByLabelText("Text annotation 1: Change door")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Text annotation 1: Change door"));
    expect(onChange).not.toHaveBeenCalled();
    const zoomIn = view.getByLabelText("Zoom in");
    expect(StyleSheet.flatten(zoomIn.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it("cannot edit a submitted mark that shares an ID with a draft mark", async () => {
    const draft: AnnotationElementV1 = { id: "same-id", type: "text", x: 0.2, y: 0.2, text: "Draft", color: "#B42318", strokeWidth: 4 };
    const submitted: AnnotationElementV1 = { ...draft, x: 0.8, text: "Submitted" };
    const view = await render(<ControlledEditor initial={{ ...emptyAnnotationDocument(2000, 1000), elements: [draft] }} sharedAnnotations={[submitted]} />);
    await fireEvent.press(view.getByLabelText("Submitted Text annotation 1: Submitted"));
    expect(view.queryByLabelText("Remove selected annotation")).toBeNull();
    expect(view.getByLabelText("Submitted Text annotation 1: Submitted").props.accessibilityState).toMatchObject({ selected: true });
  });
});
