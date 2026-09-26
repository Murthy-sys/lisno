import { render } from "@testing-library/react-native";

import { ProjectDetailGlyph, type ProjectDetailGlyphName } from "./projectDetailIcons";
import type { ProjectDetailIcon } from "./projectDetailModel";

/** Keyed by every glyph name, so a new name without a test entry fails typecheck. */
const ALL: Record<ProjectDetailGlyphName, true> = {
  person: true, home: true, pin: true, calendar: true, calendarCheck: true, rupee: true, mail: true, phone: true,
  status: true, progress: true, clock: true, flag: true, arrow: true, version: true,
  coins: true, image: true, kebab: true, check: true, chevronUp: true, chevronDown: true,
  document: true, calculator: true, file: true, users: true, list: true, refresh: true, message: true
};
const NAMES = Object.keys(ALL) as ProjectDetailGlyphName[];

describe("ProjectDetailGlyph", () => {
  it.each(NAMES)("renders %s as a hidden decorative icon", async (name) => {
    const view = await render(<ProjectDetailGlyph name={name} />);
    const glyph = view.getByTestId(`glyph-${name}`, { includeHiddenElements: true });
    expect(glyph).toHaveProp("accessible", false);
    expect(glyph).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(glyph).toHaveProp("width", 18);
    const [group] = glyph.children;
    expect(typeof group === "string" ? 0 : group?.children.length).toBeGreaterThan(0);
    expect(view.queryByTestId(`glyph-${name}`)).toBeNull();
  });

  it("draws every model row icon", () => {
    // Fails typecheck if the model gains a row icon that has no glyph.
    const toGlyph = (icon: ProjectDetailIcon): ProjectDetailGlyphName => icon;
    expect(NAMES).toContain(toGlyph("calendarCheck"));
  });

  it("applies size overrides", async () => {
    const view = await render(<ProjectDetailGlyph name="coins" size={24} color="#123456" strokeWidth={2} />);
    const glyph = view.getByTestId("glyph-coins", { includeHiddenElements: true });
    expect(glyph).toHaveProp("width", 24);
    expect(glyph).toHaveProp("height", 24);
  });
});
