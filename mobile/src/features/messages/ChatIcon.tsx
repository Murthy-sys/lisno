import Svg, { Circle, Line, Path, Polyline } from "react-native-svg";

import { chatColors } from "./chatTheme";

export type ChatIconName =
  | "attach"
  | "back"
  | "camera"
  | "file"
  | "flag"
  | "mic"
  | "more"
  | "photo"
  | "refresh"
  | "send"
  | "smile"
  | "stop";

export function ChatIcon({ name, color = chatColors.muted, size = 22 }: {
  readonly name: ChatIconName;
  readonly color?: string;
  readonly size?: number;
}) {
  const common = { fill: "none", stroke: color, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.9 };
  return (
    <Svg accessibilityElementsHidden importantForAccessibility="no-hide-descendants" height={size} viewBox="0 0 24 24" width={size}>
      {name === "attach" ? <Path {...common} d="M8.4 12.7 15 6.1a3.2 3.2 0 0 1 4.5 4.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.3-8.3a2.9 2.9 0 0 1 4.1 4.1l-8.3 8.3a1.2 1.2 0 0 1-1.7-1.7l7.7-7.7" /> : null}
      {name === "back" ? <Polyline {...common} points="14.5 5 7.5 12 14.5 19" /> : null}
      {name === "camera" ? <><Path {...common} d="M4 7.5h3l1.5-2h7l1.5 2h3v11H4v-11Z" /><Circle {...common} cx="12" cy="13" r="3.5" /></> : null}
      {name === "file" ? <><Path {...common} d="M6.5 3.5h7l4 4v13h-11v-17Z" /><Polyline {...common} points="13.5 3.5 13.5 7.5 17.5 7.5" /><Line {...common} x1="9" x2="15" y1="12" y2="12" /><Line {...common} x1="9" x2="15" y1="16" y2="16" /></> : null}
      {name === "flag" ? <><Path {...common} d="M6 21V4" /><Path {...common} d="M6 5h9.5l-1.8 3.2 1.8 3.3H6" /></> : null}
      {name === "mic" ? <><Path {...common} d="M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Z" /><Path {...common} d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" /></> : null}
      {name === "more" ? <><Circle cx="12" cy="5" fill={color} r="1.4" /><Circle cx="12" cy="12" fill={color} r="1.4" /><Circle cx="12" cy="19" fill={color} r="1.4" /></> : null}
      {name === "photo" ? <><Path {...common} d="M4 5h16v14H4V5Z" /><Circle {...common} cx="9" cy="10" r="1.8" /><Path {...common} d="m5.5 17 4.2-4.3 3.1 3 2.2-2.2 3.5 3.5" /></> : null}
      {name === "refresh" ? <><Path {...common} d="M20 7v5h-5" /><Path {...common} d="M18.1 16A8 8 0 1 1 20 9" /></> : null}
      {name === "send" ? <Path {...common} d="m3 11 18-8-8 18-2-8-8-2Zm8 2 5-5" /> : null}
      {name === "smile" ? <><Circle {...common} cx="12" cy="12" r="9" /><Circle cx="9" cy="10" fill={color} r=".8" /><Circle cx="15" cy="10" fill={color} r=".8" /><Path {...common} d="M8.5 14.5c1.8 2 5.2 2 7 0" /></> : null}
      {name === "stop" ? <Path d="M7 7h10v10H7z" fill={color} /> : null}
    </Svg>
  );
}
