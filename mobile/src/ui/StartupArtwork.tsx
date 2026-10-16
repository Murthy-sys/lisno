import Svg, { G, Path, Rect } from "react-native-svg";

import { colors } from "./tokens";

export type StartupMotifKind = "interior" | "plan" | "structure" | "tools";

export function StartupMotif({ kind, size }: { readonly kind: StartupMotifKind; readonly size: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={colors.shellInk}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {kind === "interior" ? (
        <>
          <Path d="M18 57V48a5 5 0 0 1 5-5h34a5 5 0 0 1 5 5v9M18 72v7M62 72v7" />
          <Path d="M18 57h-5v15h54V57h-5v8H18V57ZM40 44v20" />
          <Path d="M71 39h20l-5-16H76l-5 16ZM81 39v40M74 79h14" />
          <Path d="M24 59h10M46 59h10M10 84h81" stroke={colors.accent} strokeWidth={1.4} />
        </>
      ) : null}
      {kind === "plan" ? (
        <>
          <Path d="M56 84H16V16h68v68H72M50 16v32h34M16 48h16M48 48h2v36" />
          <Path d="M32 48V32a16 16 0 0 1 16 16M56 84V68a16 16 0 0 1 16 16" stroke={colors.accent} strokeWidth={1.4} />
          <Rect x={23} y={23} width={18} height={18} strokeWidth={1.4} />
          <Path d="M23 29h18M29 23v6M61 26h14v12H61zM23 61h17v13H23z" stroke={colors.accent} strokeWidth={1.4} />
          <Path d="M26 12h14M26 20h14M88 58v15M80 58v15" stroke={colors.accent} strokeWidth={1.4} />
        </>
      ) : null}
      {kind === "structure" ? (
        <>
          <Path d="M18 38h46l19-16H37L18 38ZM18 38v42h46l19-16V22M64 38v42M41 38v42M74 30v42" />
          <Path d="M18 59h46l19-16M41 38l19-16" />
          <Path d="M13 86h53l22-19M24 45h11M47 45h11M24 66h11M47 66h11" stroke={colors.accent} strokeWidth={1.4} />
        </>
      ) : null}
      {kind === "tools" ? (
        <>
          <G rotation={-15} origin="27,52">
            <Rect x={20} y={18} width={14} height={66} />
            <Path d="M20 28h7M20 38h5M20 48h7M20 58h5M20 68h7M20 78h5" stroke={colors.accent} strokeWidth={1.4} />
          </G>
          <G rotation={18} origin="68,52">
            <Path d="M68 16 86 54H50l18-38ZM68 54v10" />
            <Rect x={63.5} y={64} width={9} height={20} rx={2} />
            <Path d="M68 29v17M64 76h8" stroke={colors.accent} strokeWidth={1.4} />
          </G>
        </>
      ) : null}
    </Svg>
  );
}
