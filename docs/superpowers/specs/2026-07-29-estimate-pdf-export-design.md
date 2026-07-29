# Estimate PDF Export Design

## Goal

Allow estimator/sales users and clients to download a polished Lisno estimate as a PDF directly from the estimate card.

Estimator/sales users may export every estimate they own, including drafts. Clients may export only estimates already visible to their authenticated client account.

## User Experience

### Estimator/sales

Every saved estimate card header includes an **Export as PDF** button. Drafts, estimates in approval, estimates sent to the client, change requests, and approved estimates are all exportable as long as the authenticated estimator/sales user owns the estimate.

Selecting the button:

1. Starts an authenticated download request.
2. Shows an in-progress state and disables that estimate's export button.
3. Downloads the response without navigating away from the page.
4. Uses a descriptive filename such as `lisno-project-test-estimate-v1.pdf`.
5. Shows an inline, retryable error if authorization, networking, or PDF generation fails.

### Client

Each client estimate card header includes an **Export as PDF** button while that card is expanded. It sits beside the expanded-state control rather than inside the line-item content. The export control is available for every estimate returned by the client estimate endpoint, including estimates awaiting a decision, change-requested estimates, and approved estimate history.

Selecting the button follows the same authenticated, immediate-download behavior as the estimator/sales view. Collapsing the card hides its export control with the rest of the estimate details.

## Authorization

The backend is the sole authority for determining whether an estimate may be exported.

Two protected endpoints keep role-specific lookup rules explicit:

- `GET /api/v1/estimates/:estimateId/pdf`
  - Requires the `estimator_sales` role.
  - Finds the estimate by ID and authenticated `ownerId`.
  - Allows every workflow status, including `draft`.
- `GET /api/v1/client/estimates/:estimateId/pdf`
  - Requires the `client` role.
  - Finds the estimate only when its lead email matches the authenticated user's email case-insensitively.
  - Requires a client-visible status: `sent_to_client`, `client_changes_requested`, or `client_approved`.

An inaccessible estimate returns the same not-found response regardless of whether it does not exist or belongs to another user. This prevents estimate-ID probing.

The PDF is generated from persisted estimate and lead data after authorization. Browser-supplied estimate data is never used as document content.

## PDF Content

The document uses A4 portrait pages with consistent margins and the following content:

### Header

- Lisno logo.
- Document title: `Interior Estimate`.
- Estimate identifier.
- Estimate version.
- Human-readable workflow status.
- Generated date.

### Project and client information

- Project name.
- Client name.
- Client email.
- Location.
- Property type.

### Full included line-item breakdown

Line items are grouped using the existing estimate catalogue sections. Excluded line items do not appear.

Each group contains a table with:

- Description.
- Room.
- Specification.
- Quantity and unit.
- Unit rate.
- Line total.

Rates and totals use `INR` rather than the rupee symbol so the standard embedded PDF font cannot produce a missing-glyph square.

Long descriptions wrap within their cells. Rows are never clipped at page boundaries. When a table continues on another page, its group label and column headers are repeated.

### Totals and terms

- Subtotal.
- GST at 18%.
- Final total including GST.
- Standard terms:
  - Valid for 30 days.
  - Rates are subject to material market changes.
  - Final scope depends on site measurement.
  - GST is applied as shown.

### Per-page elements

- A low-opacity diagonal Lisno logo watermark centered behind the document content.
- Page number in `Page X of Y` format.
- A small Lisno footer.

The watermark must remain clearly recognizable without reducing table readability.

## Brand Assets

The export service uses the real Lisno SVG currently stored at `frontend/public/lisno-logo.svg`.

To avoid runtime coupling between deployed frontend and backend directories, a backend-owned copy is added under `backend/src/assets/lisno-logo.svg`. The two copies must be byte-identical when introduced, and a test guards against accidental divergence while both packages remain in this repository.

At generation time, the existing `sharp` dependency rasterizes the SVG into a transparent PNG buffer. The PNG is embedded once and reused for the header and watermark on every page.

## PDF Generation Architecture

Add a dedicated `EstimatePdfService` responsible for document creation. It accepts an authorized, fully loaded estimate-and-lead input and returns:

```ts
interface EstimatePdfResult {
  bytes: Buffer;
  filename: string;
}
```

The service has no authentication or database responsibility. This keeps layout logic isolated and testable.

Use:

- `pdfkit` for document creation, automatic text flow, page buffering, images, and streaming-compatible output.
- Existing `sharp` for SVG-to-PNG conversion.
- `@types/pdfkit` for TypeScript types.

The service prepares the logo buffer before document layout begins and draws the watermark as the first element on every page, behind later content. It buffers pages so it can add the `Page X of Y` footer after content pagination is known. Generation occurs in memory; no permanent server PDF file is written.

The routes:

1. Authenticate and authorize the role.
2. Fetch the estimate and lead using the role-specific ownership rule.
3. Call `EstimatePdfService`.
4. Return:
   - `Content-Type: application/pdf`
   - `Content-Disposition: attachment; filename="<sanitized-name>"`
   - The PDF bytes.

Filenames use lowercase safe characters and hyphens. Missing or unusual project names fall back to the estimate ID.

## Frontend Download Architecture

Add an estimate PDF download function to the existing estimate API modules. It reuses the authenticated blob-download support already used for design files and respects the filename returned through `Content-Disposition`.

The estimator/sales saved-estimate header calls the sales endpoint. The expanded client estimate header calls the client endpoint.

Loading and errors are scoped by estimate ID so one export does not disable every card. Object URLs created for the download are revoked after use.

Buttons use the existing primary/secondary button system and include a download icon with an accessible text label. Error text is exposed as an alert and identifies the estimate whose download failed.

## Error Handling

- Unknown, unauthorized, or non-client-visible estimate: `404 ESTIMATE_NOT_FOUND`.
- PDF generation failure: existing centralized error handling returns a safe server error without exposing internals.
- Frontend download failure: retain the current page and show `PDF export failed. Try again.`
- Repeated clicks while an estimate is generating are ignored by disabling that estimate's button.

## Testing

### Backend authorization and response tests

- Estimator/sales can export an owned draft.
- Estimator/sales can export an owned submitted estimate.
- Estimator/sales cannot export another estimator's estimate.
- Client can export each client-visible status linked to their exact email.
- Client cannot export a draft.
- Client cannot export an estimate linked to another email.
- Responses contain PDF content type and a sanitized attachment filename.
- The body starts with a valid PDF signature.

### PDF content tests

Use a deterministic generation date and representative estimate fixture.

- Extracted text includes project and client details.
- Extracted text includes every included line item and excludes unchecked items.
- Extracted text includes quantity, unit rate, line total, subtotal, GST, final total, status, version, and terms.
- A long fixture produces multiple pages with page numbers and repeated table headings.
- The backend and frontend Lisno SVG assets are byte-identical.

### Frontend tests

- Sales export is available on draft and submitted saved-estimate cards.
- Client export is available in the estimate card header only while that card is expanded.
- Each button requests the correct role-specific endpoint.
- The authenticated blob is downloaded with the server-provided filename.
- Per-estimate loading prevents duplicate clicks without disabling other cards.
- A failed download shows a retryable alert.

### Visual verification

Generate a representative multi-page PDF under `tmp/pdfs/`, render every page to PNG with Poppler, and inspect:

- Logo clarity.
- Watermark opacity and placement on every page.
- Table alignment and wrapping.
- Page-break behavior and repeated headings.
- Totals hierarchy.
- Terms, footer, and page numbering.
- Absence of clipped text, overlaps, missing glyph boxes, or unreadable content.

Final implementation evidence may retain a representative PDF under `output/pdf/` only when useful for user review; temporary render files are removed after verification.

## Out of Scope

- Editing estimate content inside the PDF.
- Emailing or permanently storing generated PDFs.
- Batch exporting multiple estimates.
- Custom client branding.
- Digital signatures.
- Exporting excluded line items.
