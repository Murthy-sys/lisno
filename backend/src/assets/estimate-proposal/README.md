# Estimate proposal artwork and fonts

The six JPEG photographs were losslessly extracted from the user-supplied Lisno proposal reference on 2026-11-02. Only reusable interior imagery is stored here; the source PDF and customer text are not included. The existing Lisno SVG supplies the brand emblem/wordmark.

The reference embeds subset Futura BT Book, Medium, and Light Condensed Type 3 fonts. These are not complete reusable fonts and do not establish coverage for arbitrary future project text. This renderer uses the following openly licensed, packaged alternatives:

- **Jost Regular and Medium** for geometric body text. Source: https://github.com/google/fonts/tree/main/ofl/jost. Static weights 400/500 were instantiated from `Jost[wght].ttf` using FontTools. License: `Jost-OFL.txt` (SIL Open Font License 1.1).
- **Barlow Condensed Light** for condensed headings. Source: https://github.com/google/fonts/tree/main/ofl/barlowcondensed. Unmodified static font. License: `BarlowCondensed-OFL.txt` (SIL Open Font License 1.1).
- **Noto Sans Devanagari Regular** for currency and Devanagari fallback. Source: https://github.com/google/fonts/tree/main/ofl/notosansdevanagari. Static weight 400/width 100 was instantiated from the variable source. License: `NotoSansDevanagari-OFL.txt` (SIL Open Font License 1.1).

All font resources were obtained from the official Google Fonts repository on 2026-11-02. No operating-system font is required. The FontTools conversion utility was installed only in an external temporary QA environment and is not a runtime dependency.

Typography is a documented visual approximation, not an assertion of an exact Futura BT match. Unavailable glyphs must produce a controlled error rather than an unreadable document. Fonts and photographs are copied into the compiled backend assets by `copy-static-assets.mjs`.
