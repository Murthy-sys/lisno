import Svg, { Circle, Path } from "react-native-svg";

import type { RootTab } from "./registry";

export type NavigationIconName = "home" | "projects" | "design" | "procurement" | "finance" | "messages" | "more" | "notifications" | "person" | "sign-out" | "chat" | "chevron";

function iconForTab(tab: RootTab): NavigationIconName {
  if (tab.id === "more" || tab.id === "messages") return tab.id;
  if (tab.id === "landing") return "home";
  switch (tab.destination?.id) {
    case "projects": return "projects";
    case "design-plans": return "design";
    case "procurement": return "procurement";
    case "finance": return "finance";
    default: return "home";
  }
}

export function RootTabIcon({ tab, color, selected, size = 24 }: { readonly tab: RootTab; readonly color: string; readonly selected: boolean; readonly size?: number }) {
  return <NavigationIcon name={iconForTab(tab)} color={color} selected={selected} size={size} />;
}

export function NavigationIcon({ name, color, selected = false, size = 24 }: { readonly name: NavigationIconName; readonly color: string; readonly selected?: boolean; readonly size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={selected ? 2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {name === "home" ? <Path d="M3 10.5 12 3l9 7.5M5.5 9v11h4.2v-6.2h4.6V20h4.2V9" /> : null}
      {name === "projects" ? <Path d="M3.5 20V8h7v12M10.5 20V4h10v16M2 20h20M6.5 11.5h1M6.5 15h1M14 8h3M14 11.5h3M14 15h3" /> : null}
      {name === "design" ? <Path d="M11 4H4v16h16v-7M9 15l1-4L18 3l3 3-8 8-4 1ZM16 5l3 3M4 16h2M4 12h2M4 8h2" /> : null}
      {name === "procurement" ? <Path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4v4" /> : null}
      {name === "finance" ? <Path d="M5 3.5h14V21l-3-1.5-4 1.5-4-1.5L5 21V3.5ZM8.5 7h7M8.5 10.5h7M8.5 15h2M14 15h1.5" /> : null}
      {name === "messages" ? <Path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-6 3v-3a2 2 0 0 1-1-2V6a2 2 0 0 1 2-2ZM7 9h10M7 13h6" /> : null}
      {name === "more" ? <><Circle cx={5} cy={12} r={1.4} fill={color} stroke="none" /><Circle cx={12} cy={12} r={1.4} fill={color} stroke="none" /><Circle cx={19} cy={12} r={1.4} fill={color} stroke="none" /></> : null}
      {name === "notifications" ? <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /> : null}
      {name === "person" ? <><Circle cx={12} cy={8} r={3.6} /><Path d="M5 20a7 7 0 0 1 14 0" /></> : null}
      {name === "sign-out" ? <Path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8M10 12h10M17 9l3 3-3 3" /> : null}
      {name === "chat" ? <Path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-1-2V6a2 2 0 0 1 2-2Z" /> : null}
      {name === "chevron" ? <Path d="M9 6l6 6-6 6" /> : null}
    </Svg>
  );
}
