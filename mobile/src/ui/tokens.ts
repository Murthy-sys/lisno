export const colors = Object.freeze({
  primary: "#3d4a32",
  primaryPressed: "#2f3a26",
  primaryInk: "#f6f4ec",
  primarySoft: "#e8eddf",
  primaryBorder: "rgba(61,74,50,0.62)",
  shell: "#2f3a2a",
  shellRaised: "#3d4935",
  shellInk: "#eef0e6",
  shellMuted: "#c8cebd",
  shellSelected: "#46523e",
  accent: "#a9b89a",
  authCanvas: "#dfe5d8",
  authSurface: "#f8f6f0",
  // Compatibility aliases keep existing feature consumers on the shared palette.
  midnight: "#2f3a2a",
  midnightRaised: "#3d4935",
  violet: "#3d4a32",
  violetSoft: "#e8eddf",
  gold: "#6b7558",
  canvas: "#f6f4ec",
  surface: "#fbfaf6",
  surfaceMuted: "#eeeee5",
  ink: "#1f2a1c",
  inkMuted: "#5f6a58",
  border: "#d9dccf",
  borderStrong: "#929c86",
  success: "#18795c",
  successSoft: "#e9f3ec",
  danger: "#B42318",
  dangerPressed: "#8f1d13",
  dangerSoft: "#FFF0EE",
  warning: "#8a5b12",
  warningSoft: "#f5eee1",
  info: "#315ab8",
  infoSoft: "#edf1fa"
});

/** Translucent navigation surfaces keep content ink independent of layer opacity. */
export const chrome = Object.freeze({
  base: colors.shell,
  surface: "rgba(47,58,42,0.68)",
  opaque: colors.shell,
  sheenStart: "#20301f",
  sheenCenter: "#697d57",
  sheenEnd: colors.shell,
  line: "rgba(169,184,154,0.27)",
  highlight: "rgba(224,234,213,0.20)",
  control: "rgba(238,240,230,0.07)",
  selected: "rgba(169,184,154,0.18)",
  selectedBorder: colors.accent,
  ink: colors.shellInk,
  muted: colors.shellMuted,
  glassFill: "rgba(255,255,255,0.10)",
  glassBorder: "rgba(255,255,255,0.22)",
  glassSheen: "#ffffff",
  glassSheenTopOpacity: 0.14,
  glassSheenBottomOpacity: 0,
  glassOpaque: colors.shellRaised
});

export const spacing = Object.freeze({
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  huge: 48
});

export const radii = Object.freeze({
  control: 8,
  surface: 12,
  pill: 999
});

export const fonts = Object.freeze({
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  display: "Fraunces_500Medium"
});

export const typography = Object.freeze({
  pageTitle: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30 },
  sectionTitle: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 25 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  metadata: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  button: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 }
});
