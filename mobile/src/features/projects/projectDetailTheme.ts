import { colors } from "../../ui/tokens";

/** Shared measurements and tints for the Project Details page, derived from the theme tokens. */
export const projectDetailTheme = Object.freeze({
  /** Outer cards: summary, value, section, estimate, team, documents and tasks panels. */
  cardRadius: 12,
  /** Bordered row containers inside a card, thumbnails and tab cells. */
  innerRadius: 10,
  /** Square chip behind a card's leading icon. */
  iconChipSize: 40,
  iconChip: colors.primarySoft,
  /** Sage tint of the value card: `primarySoft` lifted halfway toward the paper surface. */
  valueTint: "#f2f4ec",
  valueBorder: "#dfe5d4",
  /** Initials mark behind a team member's letter. */
  personMark: colors.primarySoft,
  /** Row, fact and tab icon size. */
  glyph: 18,
  /** Gap between stacked page blocks. */
  blockGap: 14,
  /** Minimum touch target. */
  touch: 44,
  /** Maximum width of the centered project detail column (see RecordDetailScreen). */
  pageMaxWidth: 860
});
