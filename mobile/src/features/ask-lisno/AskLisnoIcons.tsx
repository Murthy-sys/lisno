import { View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { LisnoIcon } from "../../ui/brand";
import { askLisnoColors } from "./askLisnoStyles";

export type AskLisnoIconName = "back" | "folder" | "progress" | "costs" | "team" | "paperclip" | "photo" | "send";

export function AskLisnoIcon({ name, size = 22, color = askLisnoColors.green }: { readonly name: AskLisnoIconName; readonly size?: number; readonly color?: string }) {
  const line = { fill: "none", stroke: color, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {name === "back" ? <Path {...line} d="m12 5-7 7 7 7M5 12h14" /> : null}
    {name === "folder" ? <Path {...line} d="M3 6.5h6l2 2h10v11H3V6.5Z" /> : null}
    {name === "progress" ? <Path {...line} strokeWidth={2.3} d="M5 19v-5M10 19V8M15 19V4M20 19V10" /> : null}
    {name === "costs" ? <><Rect {...line} x={5} y={2.5} width={14} height={19} rx={1.5} /><Path {...line} d="M8 7h8M8.5 11h1M14.5 11h1M8.5 15h1M14.5 15h1M8.5 18h1M14.5 18h1" /></> : null}
    {name === "team" ? <Path {...line} d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2ZM7 9h10M7 13h7" /> : null}
    {name === "paperclip" ? <Path {...line} d="m9 15 7-7a2 2 0 0 0-3-3l-8 8a4 4 0 0 0 6 6l9-9a6 6 0 0 0-8-8L3 11" /> : null}
    {name === "photo" ? <><Rect {...line} x={3} y={3} width={18} height={18} rx={2} /><Circle {...line} cx={8} cy={8} r={1.6} /><Path {...line} d="m4 18 6-6 4 4 3-3 4 4" /></> : null}
    {name === "send" ? <Path {...line} d="m4 4 17 8-17 8 4-8-4-8Zm4 8h13" /> : null}
  </Svg>;
}

/** The shared splash artwork includes transparent padding around the existing gold mark. */
export function AskLisnoMark({ size = 32 }: { readonly size?: number }) {
  return <View accessible={false} style={{ width: size, height: size, overflow: "hidden", alignItems: "center", justifyContent: "center" }}><LisnoIcon size={size * 1.85} /></View>;
}
