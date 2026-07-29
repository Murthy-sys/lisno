from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

output = "output/pdf/lisno-demo-logins.pdf"
document = SimpleDocTemplate(
    output,
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=18 * mm,
    bottomMargin=18 * mm,
)
styles = getSampleStyleSheet()
title = ParagraphStyle(
    "LisnoTitle",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=23,
    leading=28,
    textColor=colors.HexColor("#17203D"),
    spaceAfter=6 * mm,
)
body = ParagraphStyle(
    "LisnoBody",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10.5,
    leading=15,
    textColor=colors.HexColor("#3D4663"),
)
note = ParagraphStyle(
    "LisnoNote",
    parent=body,
    fontSize=9,
    leading=13,
    textColor=colors.HexColor("#5E6785"),
)

rows = [
    ["Role", "Email", "Password"],
    ["Estimator / Sales", "sales@lisno.example", "LisnoDemo2026!"],
    ["Designer", "ananya@lisno.example", "LisnoDemo2026!"],
    ["Design Manager", "aarav@lisno.example", "LisnoDemo2026!"],
    ["Client", "client@aurora.example", "LisnoDemo2026!"],
]
table = Table(rows, colWidths=[48 * mm, 69 * mm, 48 * mm], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17203D")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 10),
    ("LEADING", (0, 0), (-1, -1), 14),
    ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F7F6FC")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#F7F6FC"), colors.white]),
    ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#202945")),
    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D9D8E8")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
]))

story = [
    Paragraph("Lisno demo logins", title),
    Paragraph("Use the Estimator / Sales account to review the new lead workspace.", body),
    Spacer(1, 8 * mm),
    table,
    Spacer(1, 8 * mm),
    Paragraph("These are local demo accounts for development and review only. Do not use them in a production deployment.", note),
]
document.build(story)
