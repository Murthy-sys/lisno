import { colors, fonts, spacing } from "../../ui/tokens";

export const dashboardColors = Object.freeze({
  canvas: "#F7F6F1",
  canvasDeep: "#EFEEE8",
  stage: "#FFFFFF",
  stageRaised: "#FBFAF7",
  stageEdge: "#E4E1DA",
  stageLine: "#ECE9E2",
  text: "#171B2D",
  textMuted: "#626A7D",
  textDim: "#848A97",
  sage: "#5F806C",
  sand: "#C8AA7C",
  stone: "#9AA09C",
  blue: "#607FA8",
  violet: "#5F806C",
  violetBright: "#496856",
  violetDeep: "#DDE9E1",
  cyan: "#607FA8",
  gold: "#C8AA7C",
  goldSoft: "#F5EFE5",
  success: "#496856",
  warning: "#8A6742",
  danger: "#B65E57",
  unavailable: "#9AA09C",
  sageSoft: "#EDF3EF",
  sandSoft: "#F5EFE5",
  blueSoft: "#EDF2F7",
  plum: "#866C98",
  plumSoft: "#F2EDF5",
  scrim: "rgba(23, 27, 45, 0.46)",
  lightSurface: colors.surface,
  lightInk: colors.ink,
  lightMuted: colors.inkMuted,
  lightBorder: colors.border
});

export const dashboardTypography = Object.freeze({
  regular: fonts.regular,
  medium: fonts.medium,
  semibold: fonts.semibold,
  bold: fonts.bold
});

export const dashboardSpacing = Object.freeze({
  ...spacing,
  scene: 18,
  section: 28
});

export const dashboardLayout = Object.freeze({
  maxWidth: 1120,
  tabletBreakpoint: 760,
  widePhoneBreakpoint: 520,
  compactWidth: 370,
  heroPhoneHeight: 278,
  heroTabletHeight: 320,
  trendHeight: 246,
  moduleHeight: 250
});

export const dashboardShadow = Object.freeze({
  shadowColor: "#34433A",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 4
});
