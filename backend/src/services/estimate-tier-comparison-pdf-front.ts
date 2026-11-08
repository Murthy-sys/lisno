import {
  type ComparisonPdf,
  comparisonColors as colors,
  comparisonPage as page,
  formatComparisonPaise
} from "./estimate-tier-comparison-pdf-layout.js";
import type { EstimateTierComparison } from "./estimate-tier-comparison.service.js";

function tierEyebrow(tier: EstimateTierComparison["tiers"][number], index: number): string {
  return tier.modeTier === "current" ? "CURRENT MODE" : `OPTION ${index}`;
}

export function drawComparisonCover(pdf: ComparisonPdf, comparison: EstimateTierComparison): void {
  const split = 335;
  const leftMargin = 39;
  const leftWidth = split - leftMargin * 2;
  const copyX = 385.5;
  const copyWidth = page.width - copyX - 51;
  const scope = comparison.subBasketName ? `${comparison.mainBasketName} / ${comparison.subBasketName}` : comparison.mainBasketName;
  const scopeLines = pdf.wrap(scope, copyWidth, "body", 11);

  pdf.doc.rect(0, 0, page.width, page.height).fill(colors.paper);
  pdf.doc.rect(split, 0, page.width - split, page.height).fill(colors.ink);
  pdf.doc.image(pdf.logo, (split - 108) / 2, 33, { fit: [108, 56], align: "center", valign: "center" });
  pdf.text("LISNO.CO.IN", leftMargin, 91, leftWidth, { size: 7, align: "center", spacing: 1.6 });
  pdf.doc.save().rect(leftMargin, 114, leftWidth, 370).clip()
    .image(pdf.coverPhoto, leftMargin, 114, { cover: [leftWidth, 370], align: "center", valign: "center" })
    .restore();
  pdf.text("Illustrative interior", leftMargin, 492, leftWidth, { size: 8, align: "center", color: colors.muted });

  pdf.text("ESTIMATE PROPOSAL · TIER OPTIONS", copyX, 56, copyWidth, { font: "medium", size: 8, color: colors.goldLight, spacing: 2 });
  pdf.text("Tier", copyX, 80, copyWidth, { font: "heading", size: 39, color: colors.paper });
  pdf.text("comparison", copyX, 121, copyWidth, { font: "heading", size: 39, color: colors.paper });
  pdf.doc.moveTo(copyX, 188).lineTo(copyX + 73, 188).strokeColor(colors.goldLight).lineWidth(0.7).stroke();
  pdf.text(comparison.roomName, copyX, 207, copyWidth, { font: "heading", size: 20, color: colors.paper });
  scopeLines.slice(0, 2).forEach((line, index) => {
    const label = index === 1 && scopeLines.length > 2 ? `${line}…` : line;
    pdf.text(label, copyX, 235 + index * 14, copyWidth, { size: 11, color: colors.coolHeader });
  });

  const boxGap = 15;
  const boxWidth = (copyWidth - boxGap) / 2;
  comparison.tiers.forEach((tier, index) => {
    const x = copyX + (index % 2) * (boxWidth + boxGap);
    const y = 277 + Math.floor(index / 2) * 70;
    pdf.doc.rect(x, y, boxWidth, 59).strokeColor("#504a68").lineWidth(0.7).stroke();
    pdf.text(tierEyebrow(tier, index), x + 11, y + 9, boxWidth - 22, { size: 7, color: colors.goldLight, spacing: 1.4 });
    pdf.text(tier.label, x + 11, y + 21, boxWidth - 22, { font: "heading", size: 17, color: colors.paper });
    pdf.text(formatComparisonPaise(tier.subtotalPaise), x + 11, y + 41, boxWidth - 22, { size: 10, color: colors.coolHeader });
  });

  pdf.doc.moveTo(copyX, 496).lineTo(copyX + copyWidth, 496).strokeColor("#504a68").lineWidth(0.6).stroke();
  const fields = [
    { label: "ROOM", value: comparison.roomName },
    { label: "SCOPE", value: comparison.subBasketName ?? comparison.mainBasketName },
    { label: "ESTIMATE", value: comparison.estimateVersion === null ? "Current selection" : `Version ${comparison.estimateVersion}` }
  ];
  const fieldWidth = (copyWidth - 24) / fields.length;
  fields.forEach((field, index) => {
    const x = copyX + index * (fieldWidth + 12);
    pdf.text(field.label, x, 508, fieldWidth, { size: 7, color: colors.goldLight, spacing: 1.3 });
    pdf.text(field.value, x, 521, fieldWidth, { size: 9, color: colors.paper });
  });
  pdf.text("Lisno India Private Limited · Amounts in INR, excluding GST", copyX, 550, copyWidth, { size: 7.5, color: colors.coolHeader });
}

export function drawComparisonOverview(pdf: ComparisonPdf, comparison: EstimateTierComparison): void {
  const top = pdf.interiorPage("TIER OPTIONS", "Same scope, different tiers");
  const cardWidth = 231.5;
  const cardHeight = 168;
  const cardGap = 17;
  comparison.tiers.forEach((tier, index) => {
    const x = page.left + (index % 2) * (cardWidth + cardGap);
    const y = top + Math.floor(index / 2) * (cardHeight + cardGap);
    const current = tier.modeTier === "current";
    const foreground = current ? colors.paper : colors.ink;
    const secondary = current ? colors.coolHeader : colors.muted;
    const priced = tier.lines.filter(line => line.amountPaise !== null).length;
    const contentX = x + 17;
    const contentWidth = cardWidth - 34;

    pdf.doc.rect(x, y, cardWidth, cardHeight).fill(current ? colors.ink : colors.cool);
    pdf.text(tierEyebrow(tier, index), contentX, y + 16, contentWidth, { size: 7.8, color: current ? colors.goldLight : colors.gold, spacing: 1.7 });
    pdf.text(tier.label, contentX, y + 31, contentWidth, { font: "heading", size: 23, color: foreground });
    pdf.text(`${priced} of ${tier.lines.length} lines priced`, contentX, y + 66, contentWidth, { size: 9.5, color: secondary });
    pdf.doc.moveTo(contentX, y + 91).lineTo(contentX + contentWidth, y + 91)
      .strokeColor(current ? "#504a68" : colors.rule).lineWidth(0.6).stroke();
    pdf.text(formatComparisonPaise(tier.subtotalPaise), contentX, y + 107, contentWidth,
      { font: "medium", size: 20, color: current ? colors.goldLight : colors.ink });
    pdf.text("Subtotal in INR · excluding GST", contentX, y + 139, contentWidth, { size: 8, color: secondary });
  });

  const chartX = 536;
  const chartWidth = page.right - chartX;
  const modeTotal = comparison.tiers.find(tier => tier.modeTier === "current")?.subtotalPaise ?? null;
  const maxSubtotal = Math.max(0, ...comparison.tiers.map(tier => tier.subtotalPaise ?? 0));
  pdf.text("WHERE THE DIFFERENCE SITS", chartX, top + 4, chartWidth, { font: "medium", size: 8.1, spacing: 1.4 });
  pdf.text("Subtotals in INR, excluding GST", chartX, top + 19, chartWidth, { size: 8.4, color: colors.muted });
  comparison.tiers.forEach((tier, index) => {
    const y = top + 44 + index * 61;
    const subtotal = tier.subtotalPaise;
    pdf.text(tier.label, chartX, y, chartWidth * 0.38, { font: "medium", size: 9.2 });
    pdf.text(formatComparisonPaise(subtotal), chartX + chartWidth * 0.4, y, chartWidth * 0.6, { font: "medium", size: 9.2, align: "right" });
    pdf.doc.rect(chartX, y + 15, chartWidth, 13).fill(colors.section);
    if (subtotal !== null && subtotal > 0 && maxSubtotal > 0) {
      pdf.doc.rect(chartX, y + 15, chartWidth * (subtotal / maxSubtotal), 13)
        .fill(tier.modeTier === "current" ? colors.ink : colors.coolHeader);
    }
    if (subtotal !== null && modeTotal !== null && tier.modeTier !== "current") {
      const difference = BigInt(subtotal) - BigInt(modeTotal);
      const signed = difference > 0n ? `+${formatComparisonPaise(difference)}` : formatComparisonPaise(difference);
      pdf.text(`${signed} vs current Mode`, chartX, y + 34, chartWidth, { size: 8, color: colors.muted });
    } else if (subtotal === null) {
      pdf.text("Subtotal unavailable", chartX, y + 34, chartWidth, { size: 8, color: colors.muted });
    } else if (tier.modeTier === "current") {
      pdf.text("Current estimate selections", chartX, y + 34, chartWidth, { size: 8, color: colors.muted });
    }
  });

  const noteY = top + 292;
  pdf.doc.rect(chartX, noteY, chartWidth, 61).fill(colors.section);
  pdf.doc.rect(chartX, noteY, 0.8, 61).fill(colors.gold);
  pdf.text("About the comparison", chartX + 12, noteY + 10, chartWidth - 24, { font: "heading", size: 12 });
  pdf.text("Mode uses the current estimate selections.", chartX + 12, noteY + 30, chartWidth - 24, { size: 8, color: colors.muted });
  pdf.text("A subtotal requires a price for every line.", chartX + 12, noteY + 43, chartWidth - 24, { size: 8, color: colors.muted });
}
