import { colors, fonts, radii, spacing, typography } from "../../ui/tokens";

export const dashboardColors = Object.freeze({
  canvas: colors.canvas,
  canvasDeep: colors.surfaceMuted,
  stage: colors.surface,
  stageRaised: colors.surfaceMuted,
  stageEdge: colors.border,
  stageLine: colors.border,
  text: colors.ink,
  textMuted: colors.inkMuted,
  textDim: colors.inkMuted,
  primaryInk: colors.primaryInk,
  sage: "#5F806C",
  sand: "#C8AA7C",
  stone: "#9AA09C",
  blue: "#607FA8",
  violet: colors.primary,
  violetBright: colors.primary,
  violetDeep: colors.primarySoft,
  cyan: "#607FA8",
  gold: "#C8AA7C",
  goldSoft: colors.warningSoft,
  success: colors.success,
  warning: colors.warning,
  danger: "#B65E57",
  dangerInk: colors.danger,
  dangerSoft: colors.dangerSoft,
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
  ...typography,
  regular: fonts.regular,
  medium: fonts.medium,
  semibold: fonts.semibold,
  bold: fonts.bold
});

export const dashboardRadii = radii;

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
