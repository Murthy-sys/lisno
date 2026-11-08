import type { EstimateTierComparison } from "./estimate-tier-comparison.service.js";
import { comparisonColors, comparisonPage, formatComparisonPaise, type ComparisonPdf } from "./estimate-tier-comparison-pdf-layout.js";

interface Cell {
  value: string;
  x: number;
  width: number;
  size?: number;
  font?: "body" | "medium";
  color?: string;
  numeric?: boolean;
  lines?: string[];
  align?: "right";
}

export function drawComparisonBoq(pdf: ComparisonPdf, comparison: EstimateTierComparison) {
  const { doc } = pdf;
  const { left, right, contentWidth, bottom } = comparisonPage;
  const colors = comparisonColors;
  const serialWidth = 23, itemWidth = 186, unitWidth = 34;
  const itemX = left + serialWidth, unitX = itemX + itemWidth, optionsX = unitX + unitWidth;
  const optionWidth = (right - optionsX) / comparison.tiers.length;
  const qtyWidth = optionWidth * .22, rateWidth = optionWidth * .34;
  const amountWidth = optionWidth - qtyWidth - rateWidth;
  const headingHeight = 21, labelHeight = 17, sectionHeight = 17;
  const rowInset = 4, lineHeight = 10.5, subtotalHeight = 26;
  const sectionName = comparison.subBasketName ?? "Direct items";

  function startPage() {
    const top = pdf.interiorPage("BILL OF QUANTITIES · SIDE BY SIDE", comparison.mainBasketName);
    doc.rect(left, top, contentWidth, headingHeight + labelHeight).fill(colors.neutral);
    const labelY = top + headingHeight + 4;
    pdf.text("Sl", left + 5, labelY, serialWidth - 10, { font: "medium", size: 7.5 });
    pdf.text("Item", itemX + 5, labelY, itemWidth - 10, { font: "medium", size: 7.5 });
    pdf.text("Unit", unitX + 4, labelY, unitWidth - 8, { font: "medium", size: 7.5 });
    comparison.tiers.forEach((tier, index) => {
      const x = optionsX + index * optionWidth;
      doc.rect(x, top, optionWidth, headingHeight).fill(index === 0 ? colors.ink : index % 2 ? colors.coolHeader : colors.warm);
      const title = index === 0 ? tier.label : `Option ${index} · ${tier.label}`;
      pdf.text(title, x + 4, top + 5, optionWidth - 8, {
        font: "heading", size: 10, color: index === 0 ? colors.paper : colors.ink, align: "center"
      });
      const labelStyle = { font: "medium", size: 7.5, align: "right" } as const;
      pdf.text("Qty", x + 3, labelY, qtyWidth - 6, labelStyle);
      pdf.text("Rate", x + qtyWidth + 3, labelY, rateWidth - 6, labelStyle);
      pdf.text("Amount", x + qtyWidth + rateWidth + 3, labelY, amountWidth - 6, labelStyle);
    });
    const sectionY = top + headingHeight + labelHeight;
    doc.rect(left, sectionY, contentWidth, sectionHeight).fill(colors.section);
    pdf.text("A", left + 5, sectionY + 4, serialWidth - 10, { font: "medium", size: 8, color: colors.gold });
    pdf.text(sectionName, itemX + 5, sectionY + 4, right - itemX - 10, { font: "medium", size: 8.5 });
    const rowTop = sectionY + sectionHeight;
    doc.moveTo(left, rowTop).lineTo(right, rowTop).lineWidth(.6).strokeColor(colors.gold).stroke();
    return rowTop;
  }

  let y = startPage();
  const pageRowCapacity = bottom - y;
  const linesByTier = comparison.tiers.map(tier => new Map(tier.lines.map(line => [line.mainLineId, line])));
  for (const [index, line] of (comparison.tiers[0]?.lines ?? []).entries()) {
    const cells: Cell[] = [
      { value: `A${index + 1}`, x: left, width: serialWidth, size: 7.5, numeric: true },
      { value: line.name, x: itemX, width: itemWidth, size: 8.5, font: "medium" },
      { value: line.uomName, x: unitX, width: unitWidth, size: 7.5 }
    ];
    linesByTier.forEach((byId, tierIndex) => {
      const priced = byId.get(line.mainLineId);
      const x = optionsX + tierIndex * optionWidth;
      cells.push({ value: String(priced?.quantity ?? line.quantity), x, width: qtyWidth, numeric: true, align: "right" });
      if (!priced || priced.amountPaise === null) {
        cells.push({ value: `Incomplete\n${priced?.unavailableReason ?? "Price unavailable"}`, x: x + qtyWidth,
          width: rateWidth + amountWidth, size: 7.5, color: colors.muted });
      } else {
        const componentRate = priced.ratePaise === null;
        cells.push({ value: componentRate ? "Selected components" : formatComparisonPaise(priced.ratePaise), x: x + qtyWidth,
          width: rateWidth, size: componentRate ? 7.5 : 8, numeric: !componentRate, align: "right",
          ...(componentRate ? { lines: ["Selected", "components"] } : {}) });
        cells.push({ value: formatComparisonPaise(priced.amountPaise), x: x + qtyWidth + rateWidth, width: amountWidth,
          font: "medium", numeric: true, align: "right" });
      }
    });
    const laidOut = cells.map(cell => {
      const inset = cell.numeric ? 3 : 5;
      const width = cell.width - inset * 2;
      const size = cell.size ?? 8;
      return { ...cell, x: cell.x + inset, width, size,
        lines: cell.lines ?? (cell.numeric ? [cell.value] : pdf.wrap(cell.value, width, cell.font, size)) };
    });
    const rowLines = Math.max(...laidOut.map(cell => cell.lines.length));
    const rowHeight = rowLines * lineHeight + rowInset * 2;
    if (rowHeight <= pageRowCapacity && y + rowHeight > bottom) y = startPage();
    for (let offset = 0; offset < rowLines;) {
      if (y + rowInset * 2 + lineHeight > bottom) y = startPage();
      const count = Math.min(rowLines - offset, Math.floor((bottom - y - rowInset * 2) / lineHeight));
      const height = count * lineHeight + rowInset * 2;
      comparison.tiers.forEach((_tier, tierIndex) => {
        const fill = tierIndex % 2 === 0 ? colors.warm : colors.cool;
        doc.rect(optionsX + tierIndex * optionWidth, y, optionWidth, height).fill(fill);
      });
      laidOut.forEach((cell, cellIndex) => {
        const lines = cell.lines.slice(offset, offset + count);
        if (offset > 0 && cellIndex === 0) lines.push(cell.value);
        if (offset > 0 && cellIndex === 1 && !lines.length) lines.push("(continued)");
        lines.forEach((value, lineIndex) => pdf.text(value, cell.x, y + rowInset + lineIndex * lineHeight, cell.width, cell));
      });
      y += height;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(.45).strokeColor(colors.rule).stroke();
      offset += count;
    }
  }
  if (y + subtotalHeight > bottom) y = startPage();
  doc.rect(left, y, contentWidth, subtotalHeight).fill(colors.subtotal);
  pdf.text("Sub-basket subtotal", itemX + 5, y + 4, optionsX - itemX - 10, { font: "medium", size: 8.5 });
  pdf.text("Excluding GST", itemX + 5, y + 15, optionsX - itemX - 10, { size: 7, color: colors.muted });
  comparison.tiers.forEach((tier, index) => pdf.text(formatComparisonPaise(tier.subtotalPaise),
    optionsX + index * optionWidth + 3, y + 8, optionWidth - 6, { font: "medium", size: 9, align: "right" }));
}
