export type ScaffoldNavigationMode = "immersive" | "rail" | "tabs";

export function scaffoldNavigationMode(
  width: number,
  railBreakpoint = 600,
  immersiveBelowWidth?: number
): ScaffoldNavigationMode {
  if (immersiveBelowWidth !== undefined && width < immersiveBelowWidth) return "immersive";
  return width >= railBreakpoint ? "rail" : "tabs";
}
