import { scaffoldNavigationMode } from "./scaffoldLayout";

describe("adaptive app scaffold navigation mode", () => {
  it("preserves the existing 600dp rail breakpoint by default", () => {
    expect(scaffoldNavigationMode(599)).toBe("tabs");
    expect(scaffoldNavigationMode(600)).toBe("rail");
  });

  it("keeps messaging navigation below an 840dp rail breakpoint", () => {
    expect(scaffoldNavigationMode(600, 840)).toBe("tabs");
    expect(scaffoldNavigationMode(839, 840)).toBe("tabs");
    expect(scaffoldNavigationMode(840, 840)).toBe("rail");
  });

  it("uses immersive chrome only below its independent threshold", () => {
    expect(scaffoldNavigationMode(599, 840, 600)).toBe("immersive");
    expect(scaffoldNavigationMode(600, 840, 600)).toBe("tabs");
    expect(scaffoldNavigationMode(840, 840, 600)).toBe("rail");
  });
});
