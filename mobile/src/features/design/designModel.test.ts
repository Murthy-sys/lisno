import { extractionLabel, isEditableExtraction, parseCropInput } from "./designModel";

describe("design model", () => {
  it("accepts only non-negative integer coordinates with a positive size", () => {
    expect(parseCropInput({ x: "0", y: "12", width: "400", height: "250" })).toEqual({ x: 0, y: 12, width: 400, height: 250 });
    expect(parseCropInput({ x: "-1", y: "0", width: "4", height: "4" })).toBeNull();
    expect(parseCropInput({ x: "0.5", y: "0", width: "4", height: "4" })).toBeNull();
    expect(parseCropInput({ x: "0", y: "0", width: "0", height: "4" })).toBeNull();
  });

  it("uses user-facing extraction state and restricts draft editing", () => {
    expect(extractionLabel("processing_failed")).toBe("Extraction failed");
    expect(extractionLabel("future_state")).toBe("future state");
    expect(isEditableExtraction("designer_review")).toBe(true);
    expect(isEditableExtraction("submitted")).toBe(false);
  });
});
