import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";

import { chatColors } from "./chatTheme";

export function ChatWallpaper() {
  return (
    <Svg
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
    >
      <Defs>
        <Pattern id="lisno-chat-pattern" patternUnits="userSpaceOnUse" width="180" height="180">
          <Path
            d="M17 31h22v17H25l-8 7V31zm98 81h23v18h-15l-8 6v-24zM87 17l9 9-9 9-9-9zM137 40l10 17h-20zM24 147l12-3 3 12-12 3zM90 77h18m-9-9v18M144 161l7-7 7 7m-7-7v17M47 68l8 5-8 5m8-5H39"
            fill="none"
            stroke="#897F72"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.1}
            strokeWidth={1.2}
          />
          <Circle cx="75" cy="153" fill="none" r="8" stroke="#897F72" strokeOpacity={0.1} strokeWidth={1.2} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={chatColors.canvas} />
      <Rect width="100%" height="100%" fill="url(#lisno-chat-pattern)" />
    </Svg>
  );
}
