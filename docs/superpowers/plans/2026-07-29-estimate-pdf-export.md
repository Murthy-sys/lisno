# Estimate PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, immediate PDF downloads for every estimator/sales-owned estimate and every client-visible estimate, with Lisno branding, a per-page watermark, and full line-item pricing.

**Architecture:** A dedicated backend `EstimatePdfService` generates an in-memory A4 document from authorized persisted estimate and lead data. Role-specific routes enforce estimator ownership or client email/status visibility, while a reusable frontend download component places per-estimate export actions in the sales card header and expanded client card header.

**Tech Stack:** TypeScript, Express, Mongoose, PDFKit, Sharp, React, TanStack Query, Vitest, Supertest, Testing Library, pdfjs-dist, Poppler

## Global Constraints

- Estimator/sales may export every estimate they own, including `draft`.
- Client export is limited to an exact case-insensitive lead-email match and statuses `sent_to_client`, `client_changes_requested`, or `client_approved`.
- Unauthorized, missing, and non-client-visible estimates return `404 ESTIMATE_NOT_FOUND`.
- Generate from persisted backend data only; never accept browser-supplied document content.
- Use `pdfkit`, existing `sharp`, and `@types/pdfkit`; do not add Puppeteer or a browser runtime.
- Use the real Lisno logo in the header and a low-opacity diagonal Lisno logo watermark behind content on every page.
- Use `INR`, not `₹`, in generated PDF text.
- Include included line items only, grouped by catalogue section, with description, room, specification, quantity/unit, unit rate, and line total.
- Include subtotal, GST at 18%, final total, status, version, generated date, standard terms, and `Page X of Y`.
- Generate in memory and return an attachment; do not persist generated PDFs.
- Sales places **Export as PDF** in every saved-estimate card header.
- Client places **Export as PDF** in the estimate card header only while that card is expanded.
- Loading and errors are scoped by estimate ID.

---

### Task 1: PDF generation service and brand/catalogue assets

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/src/assets/lisno-logo.svg`
- Create: `backend/src/domain/estimate-pdf-catalogue.ts`
- Create: `backend/scripts/copy-static-assets.mjs`
- Create: `backend/scripts/sync-estimate-pdf-catalogue.ts`
- Create: `backend/src/services/estimate-pdf.service.ts`
- Create: `backend/tests/estimate-pdf.test.ts`

**Interfaces:**
- Consumes: the existing estimate catalogue values from `frontend/src/features/leads/estimateBuilderCatalogue.ts` and logo bytes from `frontend/public/lisno-logo.svg`
- Produces:

```ts
export interface EstimatePdfLine {
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  rate: number;
  quantity: number;
  included: boolean;
  amount: number;
}

export interface EstimatePdfInput {
  id: string;
  version: number;
  status: string;
  propertyType: string;
  subtotal: number;
  gst: number;
  total: number;
  lineItems: EstimatePdfLine[];
  lead: {
    clientName: string;
    clientEmail: string;
    projectName: string;
    location: string;
  };
}

export interface EstimatePdfResult {
  bytes: Buffer;
  filename: string;
}

export interface EstimatePdfService {
  generate(input: EstimatePdfInput): Promise<EstimatePdfResult>;
}

export function createEstimatePdfService(options?: {
  now?: () => Date;
  logoSvg?: Buffer;
}): EstimatePdfService;
```

- `estimate-pdf-catalogue.ts` exports:

```ts
export interface EstimatePdfCatalogueEntry {
  sectionId: string;
  sectionLabel: string;
  description: string;
}

export const estimatePdfCatalogue: ReadonlyMap<string, EstimatePdfCatalogueEntry>;
```

- Every catalogue row ID currently exported by `estimateBuilderSections` must exist in `estimatePdfCatalogue`; the PDF uses the raw `catalogueId` only as a defensive fallback for legacy unknown IDs.

- [ ] **Step 1: Install the reliable PDF dependency**

Run:

```bash
cd backend
npm install pdfkit
npm install --save-dev @types/pdfkit pdfjs-dist
```

Expected: `pdfkit` appears under `dependencies`, `@types/pdfkit` and `pdfjs-dist` appear under `devDependencies`, and the lockfile changes.

- [ ] **Step 2: Copy the exact Lisno brand asset**

Copy `frontend/public/lisno-logo.svg` to `backend/src/assets/lisno-logo.svg`, then verify:

```bash
cmp frontend/public/lisno-logo.svg backend/src/assets/lisno-logo.svg
```

Expected: exit code `0`.

Create `backend/scripts/copy-static-assets.mjs` so the compiled service can load the same asset:

```js
import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/assets/", import.meta.url), { recursive: true });
await cp(
  new URL("../src/assets/lisno-logo.svg", import.meta.url),
  new URL("../dist/assets/lisno-logo.svg", import.meta.url)
);
```

Change the backend build script to:

```json
"build": "tsc && node scripts/copy-static-assets.mjs"
```

- [ ] **Step 3: Add failing PDF service tests**

Create a deterministic fixture with:

- `id: "estimate-pdf-1"`
- `version: 3`
- `status: "sent_to_client"`
- project `Aurora Villa`
- client `Aurora Homes`
- one included `FC01` line
- one excluded `FL01` line
- enough repeated included lines to force at least two pages in a separate pagination test

Test:

```ts
const service = createEstimatePdfService({
  now: () => new Date("2026-07-29T12:00:00.000Z"),
  logoSvg: readFileSync(new URL("../src/assets/lisno-logo.svg", import.meta.url))
});
const result = await service.generate(fixture);

expect(result.filename).toBe("lisno-aurora-villa-estimate-v3.pdf");
expect(result.bytes.subarray(0, 5).toString()).toBe("%PDF-");
```

Also assert the backend and frontend logo buffers are equal:

```ts
expect(
  readFileSync(new URL("../src/assets/lisno-logo.svg", import.meta.url))
).toEqual(
  readFileSync(new URL("../../frontend/public/lisno-logo.svg", import.meta.url))
);
```

Use `pdfjs-dist` in the test to load `result.bytes`, concatenate every page's text content, and assert the extracted text includes:

```text
Interior Estimate
Aurora Villa
Aurora Homes
False ceiling - main area
Living room
INR 95
INR 9,500
Subtotal
GST @ 18%
Final total
Valid for 30 days
Page 1 of
```

Assert the excluded flooring line does not appear. Assert the long fixture yields at least two pages and contains repeated `Description`, `Room`, `Qty`, `Unit rate`, and `Line total` headings.

- [ ] **Step 4: Run the service test and verify RED**

Run:

```bash
cd backend
npm test -- tests/estimate-pdf.test.ts
```

Expected: FAIL because `createEstimatePdfService` and the backend asset/catalogue do not exist.

- [ ] **Step 5: Implement the catalogue lookup**

Create `backend/scripts/sync-estimate-pdf-catalogue.ts`:

```ts
import { writeFile } from "node:fs/promises";

import { estimateBuilderSections } from "../../frontend/src/features/leads/estimateBuilderCatalogue.ts";

const entries = estimateBuilderSections.flatMap((section) =>
  section.rows.map((row) => [
    row.id,
    {
      sectionId: section.id,
      sectionLabel: section.label,
      description: row.description.replaceAll("—", "-").replaceAll("–", "-")
    }
  ])
);

const source = `export interface EstimatePdfCatalogueEntry {
  sectionId: string;
  sectionLabel: string;
  description: string;
}

export const estimatePdfCatalogue: ReadonlyMap<string, EstimatePdfCatalogueEntry> =
  new Map(${JSON.stringify(entries, null, 2)});
`;

await writeFile(
  new URL("../src/domain/estimate-pdf-catalogue.ts", import.meta.url),
  source
);
```

Run:

```bash
cd backend
npx tsx scripts/sync-estimate-pdf-catalogue.ts
```

Add a test that imports `estimateBuilderSections` and asserts every row ID resolves in `estimatePdfCatalogue`. This locks the generated backend mapping to the frontend catalogue.

- [ ] **Step 6: Implement PDFKit generation**

Implement these isolated helpers in `estimate-pdf.service.ts`:

```ts
function safeFilenamePart(value: string): string;
function formatInr(value: number): string;
function statusLabel(status: string): string;
function collectDocument(doc: PDFKit.PDFDocument): Promise<Buffer>;
function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void;
function drawWatermark(doc: PDFKit.PDFDocument, logo: Buffer): void;
function drawTableHeader(doc: PDFKit.PDFDocument): void;
function drawLineRow(doc: PDFKit.PDFDocument, line: EstimatePdfLine): void;
```

Implementation requirements:

- Construct `new PDFDocument({ size: "A4", margins: { top: 54, right: 42, bottom: 54, left: 42 }, bufferPages: true, autoFirstPage: false })`.
- Convert SVG to PNG once per service instance with:

```ts
const logoPng = await sharp(logoSvg).png().toBuffer();
```

- When `logoSvg` is omitted, load `new URL("../assets/lisno-logo.svg", import.meta.url)`. This resolves under `src/assets` in development and under the copied `dist/assets` path in production.
- Add pages through one helper that draws the watermark first, then header content.
- Calculate wrapped row height with `doc.heightOfString`; call `ensureSpace` before drawing the row.
- If a group continues after `ensureSpace` adds a page, redraw its group label and column headers.
- After content is complete, use `bufferedPageRange()` and `switchToPage()` to draw `Page X of Y`.
- Use `doc.opacity(0.055)` for the watermark, restore opacity to `1`, and keep content readable.
- Return `collectDocument(doc)` bytes and a sanitized filename.

- [ ] **Step 7: Run the service tests and verify GREEN**

Run:

```bash
cd backend
npm test -- tests/estimate-pdf.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/assets/lisno-logo.svg backend/src/domain/estimate-pdf-catalogue.ts backend/scripts/copy-static-assets.mjs backend/scripts/sync-estimate-pdf-catalogue.ts backend/src/services/estimate-pdf.service.ts backend/tests/estimate-pdf.test.ts
git commit -m "feat: generate branded estimate pdfs"
```

### Task 2: Role-authorized PDF download endpoints

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/src/routes/leads.ts`
- Create: `backend/tests/estimate-pdf-routes.test.ts`

**Interfaces:**
- Consumes: `EstimatePdfService.generate(input: EstimatePdfInput): Promise<EstimatePdfResult>` from Task 1
- Produces:
  - `GET /api/v1/estimates/:estimateId/pdf`
  - `GET /api/v1/client/estimates/:estimateId/pdf`
  - Optional `AppDependencies.estimatePdfService?: EstimatePdfService` for deterministic route tests

- [ ] **Step 1: Write failing route authorization tests**

Create a fake service:

```ts
const generate = vi.fn(async () => ({
  bytes: Buffer.from("%PDF-1.7\n%%EOF"),
  filename: "lisno-aurora-villa-estimate-v1.pdf"
}));
```

Inject it through `createApp`. Spy on Mongoose model lookups and assert:

1. Sales draft export queries:

```ts
{ _id: "estimate-draft", ownerId: "user-estimator-sales" }
```

and returns status `200`, `application/pdf`, an attachment filename, and `%PDF-`.

2. A missing/foreign sales estimate returns:

```json
{
  "error": {
    "code": "ESTIMATE_NOT_FOUND",
    "message": "Estimate not found."
  }
}
```

3. Client export looks up a lead by estimate `leadId` plus:

```ts
{
  clientEmail: {
    $regex: "^client@lisno\\.example$",
    $options: "i"
  }
}
```

4. Client-visible statuses succeed; `draft`, foreign-email, and missing estimates all return the same `404 ESTIMATE_NOT_FOUND`.

5. `generate` receives persisted estimate fields plus persisted lead fields, not request body data.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/estimate-pdf-routes.test.ts
```

Expected: FAIL with `404` because the routes are not registered.

- [ ] **Step 3: Inject the service**

Extend dependencies:

```ts
export interface AppDependencies {
  estimatePdfService?: EstimatePdfService;
}
```

Create the real service once in `createApp`:

```ts
const estimatePdfService =
  dependencies.estimatePdfService ?? createEstimatePdfService();
```

Pass it to:

```ts
createLeadsRouter(authService, leadService, estimatePdfService)
```

- [ ] **Step 4: Implement sales authorization and response**

In `createLeadsRouter`, add:

```ts
router.get(
  "/estimates/:estimateId/pdf",
  protectedRoute,
  allowed,
  async (req, res, next) => {
    try {
      const estimate = await EstimateModel.findOne({
        _id: req.params.estimateId,
        ownerId: req.authenticatedUser!.id
      }).lean();
      if (!estimate) {
        throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
      }
      const lead = await LeadModel.findById(estimate.leadId).lean();
      if (!lead) {
        throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
      }
      const pdf = await estimatePdf.generate(toEstimatePdfInput(estimate, lead));
      res
        .set("Content-Type", "application/pdf")
        .set("Content-Disposition", `attachment; filename="${pdf.filename}"`)
        .send(pdf.bytes);
    } catch (error) {
      next(error);
    }
  }
);
```

- [ ] **Step 5: Implement client authorization**

Use a constant:

```ts
const clientVisibleEstimateStatuses = [
  "sent_to_client",
  "client_changes_requested",
  "client_approved"
] as const;
```

The client route first finds the estimate by ID and visible status, then finds the lead by ID and escaped exact email regex. Any missing result returns the same `ESTIMATE_NOT_FOUND`.

- [ ] **Step 6: Run backend tests**

Run:

```bash
cd backend
npm test -- tests/estimate-pdf-routes.test.ts tests/estimate-pdf.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/app.ts backend/src/routes/leads.ts backend/tests/estimate-pdf-routes.test.ts
git commit -m "feat: authorize estimate pdf downloads"
```

### Task 3: Reusable authenticated browser download

**Files:**
- Create: `frontend/src/components/ui/DownloadButton.tsx`
- Create: `frontend/src/components/ui/DownloadButton.test.tsx`
- Modify: `frontend/src/features/leads/leadsApi.ts`
- Modify: `frontend/src/features/estimates/estimateWorkflowApi.ts`

**Interfaces:**
- Consumes: existing `apiClient.getBlob(path)`
- Produces:

```ts
export interface DownloadButtonProps {
  label: string;
  loadingLabel: string;
  fallbackFilename: string;
  getFile: () => Promise<{ blob: Blob; filename: string | undefined }>;
  className?: string;
  onBusyChange?: (busy: boolean) => void;
}

export function DownloadButton(props: DownloadButtonProps): JSX.Element;
export const downloadEstimatePdf = (estimateId: string) =>
  apiClient.getBlob(`/estimates/${encodeURIComponent(estimateId)}/pdf`);
export const downloadClientEstimatePdf = (estimateId: string) =>
  apiClient.getBlob(`/client/estimates/${encodeURIComponent(estimateId)}/pdf`);
```

- [ ] **Step 1: Write failing component tests**

Test with `URL.createObjectURL`, `URL.revokeObjectURL`, and `HTMLAnchorElement.prototype.click` spies:

- Button renders `Export as PDF` with a decorative download icon.
- First click changes text to `Preparing PDF...` and disables only this button.
- A second click while pending does not call `getFile` again.
- Success assigns the server filename to `anchor.download`, clicks it, removes the anchor, and revokes the object URL.
- Missing server filename uses `fallbackFilename`.
- Failure renders `PDF export failed. Try again.` with `role="alert"` and restores the button.
- Clicking again after failure retries.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/components/ui/DownloadButton.test.tsx
```

Expected: FAIL because `DownloadButton` does not exist.

- [ ] **Step 3: Implement `DownloadButton`**

Follow the existing `FilePreview` download pattern, but isolate it:

```tsx
const [busy, setBusy] = useState(false);
const [error, setError] = useState<string | null>(null);

const download = async () => {
  if (busy) return;
  setBusy(true);
  onBusyChange?.(true);
  setError(null);
  try {
    const { blob, filename } = await getFile();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename ?? fallbackFilename;
    document.body.append(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 0);
  } catch {
    setError("PDF export failed. Try again.");
  } finally {
    setBusy(false);
    onBusyChange?.(false);
  }
};
```

Render a `Download` icon from `lucide-react`, `aria-hidden="true"`.

- [ ] **Step 4: Add role-specific API functions**

Add the exact functions from the Interfaces section to `leadsApi.ts` and `estimateWorkflowApi.ts`.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/components/ui/DownloadButton.test.tsx src/api/client.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/DownloadButton.tsx frontend/src/components/ui/DownloadButton.test.tsx frontend/src/features/leads/leadsApi.ts frontend/src/features/estimates/estimateWorkflowApi.ts
git commit -m "feat: add authenticated pdf download control"
```

### Task 4: Sales and client export buttons

**Files:**
- Modify: `frontend/src/features/leads/LeadDashboard.tsx`
- Create: `frontend/src/features/leads/LeadDashboard.pdf.test.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.tsx`
- Modify: `frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes:
  - `DownloadButton`
  - `downloadEstimatePdf(estimateId)`
  - `downloadClientEstimatePdf(estimateId)`
- Produces: no new cross-task API

- [ ] **Step 1: Write failing sales UI tests**

Mock one `draft` and one `sent_to_client` saved estimate. Assert:

- Both card headers contain `Export as PDF`.
- Clicking the draft button requests `/api/v1/estimates/estimate-draft/pdf` with the bearer token.
- Clicking does not navigate away.
- While the draft request is pending, the sent estimate's export remains enabled.
- A failed response displays `PDF export failed. Try again.` only in the affected card.

- [ ] **Step 2: Write failing client UI tests**

Extend `EstimateReviewPanel.collapsible.test.tsx`:

- Before expansion, no client `Export as PDF` button exists.
- After expanding Aurora Villa, its header contains one export button and Cedar Loft still has none.
- Clicking requests `/api/v1/client/estimates/estimate-ready/pdf` with the bearer token.
- Collapsing Aurora Villa removes its export control.
- Completed client estimates receive the same export control when expanded.

- [ ] **Step 3: Run UI tests and verify RED**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/leads/LeadDashboard.pdf.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx
```

Expected: FAIL because neither view renders export controls.

- [ ] **Step 4: Add sales header export**

Restructure the saved card header without changing its content:

```tsx
<div className="saved-estimate-card__top">
  <span className="estimate-status">{statusLabel}</span>
  <strong>{money(estimate.total)}</strong>
  <DownloadButton
    className="button button--secondary"
    label="Export as PDF"
    loadingLabel="Preparing PDF..."
    fallbackFilename={`lisno-${estimate.id}.pdf`}
    getFile={() => downloadEstimatePdf(estimate.id)}
  />
</div>
```

If the three-column header becomes cramped, keep status and total in a compact summary wrapper and place the export button as the header's second grid area.

- [ ] **Step 5: Add expanded client header export**

Inside the client header, render:

```tsx
{clientExpanded ? (
  <DownloadButton
    className="button button--secondary estimate-review-card__export"
    label="Export as PDF"
    loadingLabel="Preparing PDF..."
    fallbackFilename={`lisno-${estimate.id}.pdf`}
    getFile={() => downloadClientEstimatePdf(estimate.id)}
  />
) : null}
```

Keep the semantic `h3`, disclosure button, `aria-expanded`, and `aria-controls` behavior unchanged. Ensure the export button does not toggle or collapse the panel.

- [ ] **Step 6: Add responsive styles**

Add explicit header layout selectors:

```css
.saved-estimate-card__top {
  flex-wrap: wrap;
}

.estimate-review-card__export {
  justify-self: end;
}
```

At `max-width: 640px`, give project name, total, export, and disclosure controls deliberate rows. The export and disclosure buttons must not collide at 320px; each interactive control has at least 44px height.

- [ ] **Step 7: Run UI tests and typecheck**

Run:

```bash
cd frontend
VITE_API_URL=/api/v1 npm test -- src/features/leads/LeadDashboard.pdf.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/client/ClientDashboard.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/leads/LeadDashboard.tsx frontend/src/features/leads/LeadDashboard.pdf.test.tsx frontend/src/features/estimates/EstimateReviewPanel.tsx frontend/src/features/estimates/EstimateReviewPanel.collapsible.test.tsx frontend/src/styles/index.css
git commit -m "feat: export estimate pdfs from the ui"
```

### Task 5: Visual PDF QA and complete verification

**Files:**
- Create: `backend/scripts/render-estimate-pdf.ts`
- Create temporarily: `output/pdf/lisno-estimate-sample.pdf`
- Create temporarily: `tmp/pdfs/lisno-estimate-sample-*.png`

**Interfaces:**
- Consumes: `createEstimatePdfService` from Task 1
- Produces: a deterministic representative PDF for visual inspection

- [ ] **Step 1: Add the deterministic render script**

The script constructs an estimate with:

- A long project name.
- At least three catalogue sections.
- Wrapped descriptions and specifications.
- Enough rows for at least three pages.
- Deterministic generated date `2026-07-29T12:00:00.000Z`.

It calls:

```ts
const result = await createEstimatePdfService({
  now: () => new Date("2026-07-29T12:00:00.000Z")
}).generate(fixture);
```

and writes `result.bytes` to `output/pdf/lisno-estimate-sample.pdf`.

- [ ] **Step 2: Generate and validate the PDF structure**

Run:

```bash
mkdir -p output/pdf tmp/pdfs
cd backend
npx tsx scripts/render-estimate-pdf.ts
pdfinfo ../output/pdf/lisno-estimate-sample.pdf
pdftotext ../output/pdf/lisno-estimate-sample.pdf -
```

Expected:

- A4 page size.
- At least three pages.
- Extracted project/client, line-item, totals, GST, terms, and page-number text.
- No `₹` character.

- [ ] **Step 3: Render every page and inspect**

Run:

```bash
pdftoppm -png output/pdf/lisno-estimate-sample.pdf tmp/pdfs/lisno-estimate-sample
```

Inspect every generated PNG. Verify:

- Crisp header logo.
- A subtle diagonal logo watermark on every page.
- No watermark interference with line text.
- No clipped, overlapped, or missing-glyph text.
- Repeated table headings after page breaks.
- Aligned numeric columns.
- Clear final-total hierarchy.
- Terms and `Page X of Y` footers.

If any defect exists, amend only the PDF layout service, regenerate, and repeat this step before continuing.

- [ ] **Step 4: Run complete verification**

Run:

```bash
cd backend
npm test
npm run typecheck
npm run build

cd ../frontend
VITE_API_URL=/api/v1 npm test
npm run typecheck
npm run build

cd ..
git diff --check
git status --short
```

Expected: every command exits successfully. Existing non-failing MSW logging or Vite chunk-size advisories must be documented, not mistaken for failures.

- [ ] **Step 5: Review final scope**

Run:

```bash
git diff --stat HEAD~4..HEAD
git diff --name-status HEAD~4..HEAD
```

Confirm the branch contains only:

- PDF dependencies and lockfile.
- Backend logo/catalogue/service/routes/tests/render script.
- Frontend download component/API/UI/tests/styles.
- No generated sample PDF or rendered PNG files.

- [ ] **Step 6: Remove generated files and commit the render script**

Remove the generated verification files:

```bash
rm output/pdf/lisno-estimate-sample.pdf
rm tmp/pdfs/lisno-estimate-sample-*.png
```

Then commit only the reproducible render script:

```bash
git add backend/scripts/render-estimate-pdf.ts
git commit -m "test: add estimate pdf visual fixture"
```
