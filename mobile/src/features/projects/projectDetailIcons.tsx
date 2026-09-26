import type { JSX, ReactNode } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { colors } from "../../ui/tokens";

export type ProjectDetailGlyphName =
  // row / fact icons (must match the model's ProjectDetailIcon union exactly as a subset)
  | "person" | "home" | "pin" | "calendar" | "calendarCheck" | "rupee" | "mail" | "phone"
  | "status" | "progress" | "clock" | "flag" | "arrow" | "version"
  // UI glyphs
  | "coins" | "image" | "kebab" | "check" | "chevronUp" | "chevronDown"
  | "document" | "calculator" | "file" | "users" | "list" | "refresh" | "message";

interface Stroke {
  readonly fill: "none";
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeLinecap: "round";
  readonly strokeLinejoin: "round";
}

const CALENDAR = "M3.5 10H20.5M8 3V7M16 3V7";
const PAGE = "M6 3H14L19 8V21H6Z";
const PAGE_FOLD = "M14 3V8H19";

/** Glyph bodies on a 24-unit grid; `s` is the shared stroke, `c` the colour for small filled dots. */
const GLYPHS: Record<ProjectDetailGlyphName, (s: Stroke, c: string) => ReactNode> = {
  person: (s) => <><Circle cx={12} cy={8} r={4} {...s} /><Path d="M4.5 20.5C5.3 16.8 8.3 14.5 12 14.5C15.7 14.5 18.7 16.8 19.5 20.5" {...s} /></>,
  home: (s) => <Path d="M3.5 11L12 4L20.5 11M5.5 9.5V20H18.5V9.5M10 20V14.5H14V20" {...s} />,
  pin: (s) => <><Path d="M12 21S5 14.8 5 9.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" {...s} /><Circle cx={12} cy={9.5} r={2.5} {...s} /></>,
  calendar: (s) => <><Rect x={3.5} y={5} width={17} height={15.5} rx={1.5} {...s} /><Path d={CALENDAR} {...s} /></>,
  calendarCheck: (s) => <><Rect x={3.5} y={5} width={17} height={15.5} rx={1.5} {...s} /><Path d={`${CALENDAR}M9 15L11 17L15 13`} {...s} /></>,
  rupee: (s) => <Path d="M6 3.5H18M6 8.5H18M6 13.5H9M9 13.5C15.7 13.5 15.7 3.5 9 3.5M6 13.5L14.5 21" {...s} />,
  mail: (s) => <><Rect x={3} y={5} width={18} height={14} rx={2} {...s} /><Path d="M3.5 7L12 13L20.5 7" {...s} /></>,
  phone: (s) => <Path d="M6.5 3.5H9.5L11 8L9 9.5A11 11 0 0 0 14.5 15L16 13L20.5 14.5V17.5A2 2 0 0 1 18.5 19.5A16 16 0 0 1 4.5 5.5A2 2 0 0 1 6.5 3.5Z" {...s} />,
  status: (s) => <><Circle cx={12} cy={12} r={9} {...s} /><Path d="M8.5 12.2L10.9 14.6L15.7 9.6" {...s} /></>,
  progress: (s) => <Path d="M4 3.5V20H20.5M7.5 15.5L11.3 11.2L14.3 14L19.5 8M15.5 8H19.5V12" {...s} />,
  clock: (s) => <><Circle cx={12} cy={12} r={9} {...s} /><Path d="M12 7V12L15.5 14" {...s} /></>,
  flag: (s) => <Path d="M5.5 21V4M5.5 4.5H16.5L14.5 8.25L16.5 12H5.5" {...s} />,
  arrow: (s) => <Path d="M4 12H20M14 6L20 12L14 18" {...s} />,
  version: (s) => <Path d="M12 3.5L20.5 8L12 12.5L3.5 8ZM3.5 12L12 16.5L20.5 12M3.5 16L12 20.5L20.5 16" {...s} />,
  coins: (s) => <><Circle cx={9} cy={9} r={6} {...s} /><Path d="M16.2 9.1A6 6 0 1 1 9.1 16.2M8 7H9V11" {...s} /></>,
  image: (s) => <><Rect x={3.5} y={4.5} width={17} height={15} rx={2} {...s} /><Circle cx={9} cy={10} r={1.8} {...s} /><Path d="M3.5 17.5L8.5 12.5L13 17L16 14L20.5 18.5" {...s} /></>,
  kebab: (_s, c) => <><Circle cx={12} cy={5} r={1.6} fill={c} /><Circle cx={12} cy={12} r={1.6} fill={c} /><Circle cx={12} cy={19} r={1.6} fill={c} /></>,
  check: (s) => <Path d="M5 12.5L9.5 17L19 7.5" {...s} />,
  chevronUp: (s) => <Path d="M6 15L12 9L18 15" {...s} />,
  chevronDown: (s) => <Path d="M6 9L12 15L18 9" {...s} />,
  document: (s) => <><Path d={PAGE} {...s} /><Path d={`${PAGE_FOLD}M9 12.5H16M9 16H14`} {...s} /></>,
  calculator: (s, c) => <>
    <Rect x={5} y={3} width={14} height={18} rx={2} {...s} />
    <Rect x={8} y={6} width={8} height={3.5} rx={0.6} {...s} />
    {[9, 12, 15].flatMap((cx) => [13, 17].map((cy) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={0.95} fill={c} />))}
  </>,
  file: (s) => <><Path d={PAGE} {...s} /><Path d={PAGE_FOLD} {...s} /></>,
  users: (s) => <><Circle cx={9} cy={8} r={3.5} {...s} /><Path d="M3 20C3.6 16.6 6 14.5 9 14.5S14.4 16.6 15 20M15.5 4.8A3.5 3.5 0 0 1 15.5 11.2M17.5 14.8C19.4 15.5 20.7 17.3 21 20" {...s} /></>,
  list: (s) => <><Path d="M3.5 7L5.3 8.8L8.5 5.6M12 7H20.5M12 17H20.5" {...s} /><Rect x={4} y={14.75} width={4.5} height={4.5} rx={1} {...s} /></>,
  refresh: (s) => <Path d="M20 12A8 8 0 1 1 17.65 6.34L20 8.5M20 4V8.5H15.5" {...s} />,
  message: (s) => <Path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18.5A1.5 1.5 0 0 1 20 5.5V15.5A1.5 1.5 0 0 1 18.5 17H9L4 21Z" {...s} />
};

/** Decorative project-detail line icon (24-unit grid), always hidden from assistive technology. */
export function ProjectDetailGlyph({ name, size = 18, color = colors.primary, strokeWidth = 1.6 }: {
  readonly name: ProjectDetailGlyphName;
  readonly size?: number;
  readonly color?: string;
  readonly strokeWidth?: number;
}): JSX.Element {
  const stroke: Stroke = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <Svg testID={`glyph-${name}`} width={size} height={size} viewBox="0 0 24 24" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {GLYPHS[name](stroke, color)}
    </Svg>
  );
}
