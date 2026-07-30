# Bounded Variable-Page Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project and estimate extraction accept any PDF from one through 50 pages while enforcing one authoritative set of byte, page, text, image, drawing, transport, and processing limits, producing exactly one full-page drawing per estimate-design source page, and avoiding duplicate full-page images.

**Architecture:** The backend owns one typed `ExtractionLimits` value, uses it for request validation and persistence preflight, and includes both the source size and the complete limits object in every claim. The Python worker treats the claimed limits as authoritative, streams sources into a bounded temporary file, opens each PDF once, validates page count before touching embedded text, and accounts for every generated artifact and drawing. Every estimate-design page resolves one bounded title-cell candidate and emits exactly one full-page `imageSource: "page"` section; a missing or ambiguous title emits one explicit unidentified/Misc-capable drawing instead of falling through to multi-region cropping. The backend continues to accept legacy `imageBase64` sections while reusing the already-decoded and already-stored page artifact for the new representation.

**Tech Stack:** Node.js 20+, TypeScript 5, Express 5, Zod 3, Mongoose 9, Sharp, Vitest/Supertest, Python 3.11, PyMuPDF, Pillow, pytest.

## Global Constraints

- Execute this plan after `docs/superpowers/plans/2026-07-30-production-estimate-design-mapping-misc.md` and `docs/superpowers/plans/2026-07-30-idempotent-extraction-completion.md`; it consumes truthful mapping tuples plus the stable `complete(job_id, result_id, pages)` signature and receipt contract.
- Default maximum source bytes: `26214400`.
- Default maximum pages: `50`.
- Default maximum rendered pixels per page: `40000000`.
- Default maximum embedded-text words per page: `20000`.
- Default maximum sections per page: `500`.
- Default maximum drawings per job: `500`.
- Default maximum decoded bytes per page or section image: `26214400`.
- Default maximum aggregate decoded image output per job: `41943040`.
- Default maximum completion request body bytes: `67108864`.
- Default maximum processing seconds per job: `900`.
- These defaults are also immutable application safety ceilings. Environment overrides may lower a limit but cannot raise it; raising a ceiling requires a reviewed code change and release.
- Both job records persist the exact `ExtractionLimits` snapshot used for their current claim. Completion validates against that snapshot, not a possibly changed process environment.
- The worker JSON parser always uses the immutable 64 MiB ceiling and records exact raw body bytes. Same-result replay is decided from the minimal `resultId` before snapshot-specific body/schema validation; a first completion is then validated against its claim snapshot.
- Page-count validation occurs immediately after `fitz.open` and before any `page.get_text`, rendering, OCR, or PNG encoding.
- Every embedded-text read, page render, OCR call, and PNG encode checks the job deadline before and after work; embedded-word iteration checks it at least every 256 words.
- A one-page PDF, variable-page PDF, 50-page PDF, the approved first-six-page regression subset, and the full supplied 34-page PDF all use the same PDF iterator. There is no six-page or 34-page production branch.
- A 51-page PDF fails before embedded text or rendering.
- Section and drawing limits reject excess output; they do not silently truncate a valid-looking result.
- Every new-worker `estimate_design` source page emits exactly one section, its crop is the complete page, and its image representation is `imageSource: "page"`. This applies to PDF pages and image/multi-frame pages.
- Estimate title extraction uses one embedded title-cell candidate when uniquely available, otherwise one bounded title-band OCR pass. A missing or ambiguous result becomes `Unidentified drawing — page <n>` with zero title confidence and a null/Misc mapping proposal; it never falls through to full-page region detection or multiple crops.
- Multi-section extraction remains valid for `project_design`. During backend-first staged rollout, the backend also accepts a prior-worker estimate page with zero through `maxSectionsPerPage` all-`imageBase64` sections; the zero-section case is a narrow legacy exception because the deployed worker can emit no recognized title. It rejects mixed legacy/page-backed sections and more than one page-backed estimate section.
- A full-page title-cell section serializes `imageSource: "page"` without `imageBase64`. The backend accepts both this representation and the prior `imageBase64` representation during staged rollout.
- `imageSource: "page"` is valid only when the section crop is exactly `{ x: 0, y: 0, width: page.width, height: page.height }`.
- Backend completion validates all counts, dimensions, crops, decoded image sizes, and aggregate output bytes before storing an artifact or opening a transaction.
- Mongo completion uses one ordered `insertMany` call per bounded collection: at most 50 pages, 500 drawings/sections, and 500 revisions.
- Preserve current extraction status, mapping, annotation, revision, and client-review behavior.
- Do not add S3 or staged-artifact reconciliation, worker idempotency/retry/backoff changes, mapping/Misc UI changes, migrations, health probes, logging, metrics, or tracing in this plan.

## File Map

- `backend/src/config/extraction-limits.ts`: owns the backend `ExtractionLimits` type, exact defaults, environment conversion, and immutable public claim payload.
- `backend/src/config/env.ts`: parses the ten `OCR_MAX_*`/processing environment values using the exact defaults above.
- `backend/.env.example`: lists all ten backend-owned limit variables and exact defaults.
- `backend/src/server.ts`: converts the parsed environment into one `ExtractionLimits` object.
- `backend/src/app.ts`: injects that object into the worker router, worker service, and estimate-design service.
- `backend/src/routes/extraction-worker.ts`: builds dynamic Zod schemas from the limits and applies the exact completion-body parser limit.
- `backend/src/services/extraction-worker.service.ts`: publishes source size/limits, prevalidates project results, reuses page artifacts, and constructs bounded project completion writes.
- `backend/src/services/estimate-design.service.ts`: prevalidates estimate results, reuses page artifacts, and persists bounded estimate completion writes.
- `backend/src/repositories/mongo.ts`: replaces per-document project completion loops with ordered bounded bulk inserts.
- `ocr-worker/src/lisno_ocr/contracts.py`: owns the claimed Python `ExtractionLimits`, claim source size, and the backward-compatible section image union.
- `ocr-worker/src/lisno_ocr/worker.py`: parses authoritative claim limits, streams bounded downloads, applies the claimed deadline, and enforces completion-body bytes.
- `ocr-worker/src/lisno_ocr/extractor.py`: owns the one-open PDF iterator and all per-page/job extraction accounting.
- `ocr-worker/src/lisno_ocr/title_block.py`: computes bounded embedded-title candidates with heuristic confidence below `1.0`.
- `ocr-worker/src/lisno_ocr/image_formats.py`: applies claimed page/pixel/deadline bounds to non-PDF multi-frame sources.
- `ocr-worker/pyproject.toml`: registers the `private_fixture` pytest marker; normal tests exclude it and release verification selects it explicitly.
- `OCR_PRIVATE_ESTIMATE_PDF`: local-only path to the supplied 34-page PDF (10,844,504 bytes, SHA-256 `f4e96363f04c89d32bf90fefdbcd23deba1737d1bea789a73da857236c926660`). The PDF and its derived six-page subset are never committed.
- `backend/README.md` and `ocr-worker/README.md`: document backend-owned limits and the new claim/section wire contract.

---

### Task 1: Establish the authoritative limits and claim contract

**Files:**
- Create: `backend/src/config/extraction-limits.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/.env.example`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/models/DesignExtractionJob.ts`
- Modify: `backend/src/models/EstimateDesignExtractionJob.ts`
- Modify: `backend/src/repositories/types.ts`
- Modify: `backend/src/repositories/memory.ts`
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `ocr-worker/src/lisno_ocr/contracts.py`
- Modify: `ocr-worker/src/lisno_ocr/worker.py`
- Test: `backend/tests/config.test.ts`
- Test: `backend/tests/server.test.ts`
- Test: `backend/tests/extraction-worker.test.ts`
- Test: `backend/tests/repository.test.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/estimate-design-extraction.test.ts`
- Test: `ocr-worker/tests/test_worker.py`

**Interfaces:**
- Produces the backend type `ExtractionLimits` and constant `DEFAULT_EXTRACTION_LIMITS`.
- Produces `MAXIMUM_EXTRACTION_LIMITS`; every default equals its immutable ceiling, while tests/configuration may inject lower positive values.
- Produces `extractionLimitsFromEnvironment(environment): ExtractionLimits`.
- Adds top-level `sourceSizeBytes: number` and `limits: ExtractionLimits` to both `ClaimedProjectExtractionJob` and `ClaimedEstimateExtractionJob`; keep the existing project `source.sizeBytes` field for prior workers.
- Produces the Python dataclass `ExtractionLimits` and adds `source_size_bytes: int` plus `limits: ExtractionLimits` to `ClaimedJob`.
- Adds required `extractionLimits` to newly claimed project and estimate job records; legacy records may be null only until their next claim.
- The backend claim JSON uses the exact camel-case keys shown below; the worker does not read extraction bounds from local `OCR_MAX_*` variables.

- [ ] **Step 1: Write failing backend default/config tests**

Add these imports and assertions to `backend/tests/config.test.ts`:

```ts
import {
  DEFAULT_EXTRACTION_LIMITS,
  extractionLimitsFromEnvironment
} from "../src/config/extraction-limits.js";

it("loads the exact production extraction defaults", () => {
  const environment = loadEnvironment({
    JWT_SECRET: "runtime-secret-with-at-least-32-characters",
    OCR_WORKER_TOKEN
  });

  expect(extractionLimitsFromEnvironment(environment)).toEqual({
    maxSourceBytes: 26_214_400,
    maxPages: 50,
    maxPagePixels: 40_000_000,
    maxTextWordsPerPage: 20_000,
    maxSectionsPerPage: 500,
    maxDrawingsPerJob: 500,
    maxDecodedImageBytes: 26_214_400,
    maxOutputBytes: 41_943_040,
    maxCompletionBodyBytes: 67_108_864,
    maxProcessingSeconds: 900
  });
  expect(Object.isFrozen(DEFAULT_EXTRACTION_LIMITS)).toBe(true);
});

it("accepts positive extraction overrides and rejects zero", () => {
  const base = {
    JWT_SECRET: "runtime-secret-with-at-least-32-characters",
    OCR_WORKER_TOKEN
  };
  expect(
    extractionLimitsFromEnvironment(
      loadEnvironment({ ...base, OCR_MAX_PDF_PAGES: "12" })
    ).maxPages
  ).toBe(12);
  expect(() =>
    loadEnvironment({ ...base, OCR_MAX_DRAWINGS_PER_JOB: "0" })
  ).toThrow();
  expect(() =>
    loadEnvironment({ ...base, OCR_MAX_PDF_PAGES: "51" })
  ).toThrow();
  expect(() =>
    loadEnvironment({
      ...base,
      OCR_MAX_COMPLETION_BODY_BYTES: "67108865"
    })
  ).toThrow();
});
```

Update the fixture in `backend/tests/server.test.ts` with all ten numeric fields, then assert `appFactory` receives the converted object:

```ts
expect(appFactory).toHaveBeenCalledWith(
  expect.objectContaining({
    repository,
    extractionLimits: {
      maxSourceBytes: 26_214_400,
      maxPages: 50,
      maxPagePixels: 40_000_000,
      maxTextWordsPerPage: 20_000,
      maxSectionsPerPage: 500,
      maxDrawingsPerJob: 500,
      maxDecodedImageBytes: 26_214_400,
      maxOutputBytes: 41_943_040,
      maxCompletionBodyBytes: 67_108_864,
      maxProcessingSeconds: 900
    }
  })
);
```

- [ ] **Step 2: Run the backend config tests and verify they fail**

Run:

```bash
cd backend
npm test -- --run tests/config.test.ts tests/server.test.ts
```

Expected: FAIL because `extraction-limits.ts`, the ten parsed environment properties, and the `extractionLimits` app dependency do not exist.

- [ ] **Step 3: Implement the backend limits module and environment conversion**

Create `backend/src/config/extraction-limits.ts`:

```ts
export interface ExtractionLimits {
  maxSourceBytes: number;
  maxPages: number;
  maxPagePixels: number;
  maxTextWordsPerPage: number;
  maxSectionsPerPage: number;
  maxDrawingsPerJob: number;
  maxDecodedImageBytes: number;
  maxOutputBytes: number;
  maxCompletionBodyBytes: number;
  maxProcessingSeconds: number;
}

export const MAXIMUM_EXTRACTION_LIMITS: Readonly<ExtractionLimits> =
  Object.freeze({
    maxSourceBytes: 26_214_400,
    maxPages: 50,
    maxPagePixels: 40_000_000,
    maxTextWordsPerPage: 20_000,
    maxSectionsPerPage: 500,
    maxDrawingsPerJob: 500,
    maxDecodedImageBytes: 26_214_400,
    maxOutputBytes: 41_943_040,
    maxCompletionBodyBytes: 67_108_864,
    maxProcessingSeconds: 900
  });

export const DEFAULT_EXTRACTION_LIMITS = MAXIMUM_EXTRACTION_LIMITS;

export interface ExtractionLimitEnvironment {
  OCR_MAX_SOURCE_BYTES: number;
  OCR_MAX_PDF_PAGES: number;
  OCR_MAX_PAGE_PIXELS: number;
  OCR_MAX_TEXT_WORDS_PER_PAGE: number;
  OCR_MAX_SECTIONS_PER_PAGE: number;
  OCR_MAX_DRAWINGS_PER_JOB: number;
  OCR_MAX_DECODED_IMAGE_BYTES: number;
  OCR_MAX_OUTPUT_BYTES: number;
  OCR_MAX_COMPLETION_BODY_BYTES: number;
  OCR_MAX_PROCESSING_SECONDS: number;
}

export function extractionLimitsFromEnvironment(
  environment: ExtractionLimitEnvironment
): ExtractionLimits {
  return assertExtractionLimitsWithinCeilings({
    maxSourceBytes: environment.OCR_MAX_SOURCE_BYTES,
    maxPages: environment.OCR_MAX_PDF_PAGES,
    maxPagePixels: environment.OCR_MAX_PAGE_PIXELS,
    maxTextWordsPerPage: environment.OCR_MAX_TEXT_WORDS_PER_PAGE,
    maxSectionsPerPage: environment.OCR_MAX_SECTIONS_PER_PAGE,
    maxDrawingsPerJob: environment.OCR_MAX_DRAWINGS_PER_JOB,
    maxDecodedImageBytes: environment.OCR_MAX_DECODED_IMAGE_BYTES,
    maxOutputBytes: environment.OCR_MAX_OUTPUT_BYTES,
    maxCompletionBodyBytes: environment.OCR_MAX_COMPLETION_BODY_BYTES,
    maxProcessingSeconds: environment.OCR_MAX_PROCESSING_SECONDS
  });
}

export function assertExtractionLimitsWithinCeilings(
  value: ExtractionLimits
): Readonly<ExtractionLimits> {
  const integerKeys = new Set<keyof ExtractionLimits>([
    "maxSourceBytes", "maxPages", "maxPagePixels", "maxTextWordsPerPage",
    "maxSectionsPerPage", "maxDrawingsPerJob", "maxDecodedImageBytes",
    "maxOutputBytes", "maxCompletionBodyBytes"
  ]);
  for (const key of Object.keys(MAXIMUM_EXTRACTION_LIMITS) as Array<
    keyof ExtractionLimits
  >) {
    const candidate = value[key];
    if (
      !Number.isFinite(candidate) ||
      (integerKeys.has(key) && !Number.isInteger(candidate)) ||
      candidate <= 0 ||
      candidate > MAXIMUM_EXTRACTION_LIMITS[key]
    ) {
      throw new Error(`Invalid extraction limit: ${key}.`);
    }
  }
  return Object.freeze({ ...value });
}
```

In `backend/src/config/env.ts`, import `MAXIMUM_EXTRACTION_LIMITS` and add `.max(...)` to every positive parser:

```ts
OCR_MAX_SOURCE_BYTES: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxSourceBytes)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxSourceBytes),
OCR_MAX_PDF_PAGES: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxPages)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxPages),
OCR_MAX_PAGE_PIXELS: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxPagePixels)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxPagePixels),
OCR_MAX_TEXT_WORDS_PER_PAGE: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxTextWordsPerPage)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxTextWordsPerPage),
OCR_MAX_SECTIONS_PER_PAGE: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxSectionsPerPage)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxSectionsPerPage),
OCR_MAX_DRAWINGS_PER_JOB: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxDrawingsPerJob)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxDrawingsPerJob),
OCR_MAX_DECODED_IMAGE_BYTES: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxDecodedImageBytes)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxDecodedImageBytes),
OCR_MAX_OUTPUT_BYTES: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxOutputBytes)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxOutputBytes),
OCR_MAX_COMPLETION_BODY_BYTES: z.coerce.number().int().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxCompletionBodyBytes)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxCompletionBodyBytes),
OCR_MAX_PROCESSING_SECONDS: z.coerce.number().positive()
  .max(MAXIMUM_EXTRACTION_LIMITS.maxProcessingSeconds)
  .default(MAXIMUM_EXTRACTION_LIMITS.maxProcessingSeconds)
```

Replace the obsolete partial limit block in `backend/.env.example` with all ten backend-owned values:

```dotenv
OCR_MAX_SOURCE_BYTES=26214400
OCR_MAX_PDF_PAGES=50
OCR_MAX_PAGE_PIXELS=40000000
OCR_MAX_TEXT_WORDS_PER_PAGE=20000
OCR_MAX_SECTIONS_PER_PAGE=500
OCR_MAX_DRAWINGS_PER_JOB=500
OCR_MAX_DECODED_IMAGE_BYTES=26214400
OCR_MAX_OUTPUT_BYTES=41943040
OCR_MAX_COMPLETION_BODY_BYTES=67108864
OCR_MAX_PROCESSING_SECONDS=900
```

Document beside the block that configuration may lower but not raise these compiled safety ceilings.

Call `assertExtractionLimitsWithinCeilings` for explicit `AppDependencies.extractionLimits` too, so dependency injection cannot bypass production ceilings.

In `backend/src/server.ts`, pass exactly one converted value:

```ts
extractionLimits: extractionLimitsFromEnvironment(env)
```

In `backend/src/app.ts`, add `extractionLimits?: ExtractionLimits` to `AppDependencies`, resolve it once with `dependencies.extractionLimits ?? DEFAULT_EXTRACTION_LIMITS`, and pass that same object to `createEstimateDesignService`, `createExtractionWorkerService`, and `createExtractionWorkerRouter`.

- [ ] **Step 4: Write failing claim-contract tests**

In `backend/tests/extraction-worker.test.ts`, extend both the project and estimate claim assertions:

```ts
expect(claimed?.body.data).toMatchObject({
  sourceSizeBytes: 245_760,
  limits: DEFAULT_EXTRACTION_LIMITS
});
```

```ts
expect(first.body.data).toMatchObject({
  kind: "estimate_design",
  sourceSizeBytes: 42,
  limits: DEFAULT_EXTRACTION_LIMITS
});
```

In `ocr-worker/tests/test_worker.py`, add a shared exact payload:

```python
LIMITS_PAYLOAD = {
    "maxSourceBytes": 26_214_400,
    "maxPages": 50,
    "maxPagePixels": 40_000_000,
    "maxTextWordsPerPage": 20_000,
    "maxSectionsPerPage": 500,
    "maxDrawingsPerJob": 500,
    "maxDecodedImageBytes": 26_214_400,
    "maxOutputBytes": 41_943_040,
    "maxCompletionBodyBytes": 67_108_864,
    "maxProcessingSeconds": 900,
}
```

Add `sourceSizeBytes` and `limits` to both fake claim responses, then assert:

```python
assert claimed.source_size_bytes == 245_760
assert claimed.limits == ExtractionLimits(
    max_source_bytes=26_214_400,
    max_pages=50,
    max_page_pixels=40_000_000,
    max_text_words_per_page=20_000,
    max_sections_per_page=500,
    max_drawings_per_job=500,
    max_decoded_image_bytes=26_214_400,
    max_output_bytes=41_943_040,
    max_completion_body_bytes=67_108_864,
    max_processing_seconds=900.0,
)
```

Add a malformed-contract test:

```python
def test_api_claim_rejects_missing_authoritative_limits():
    class MissingLimitsApi(WorkerApi):
        def _request_json(self, *_args, **_kwargs):
            return 200, {
                "data": {
                    "id": "job-1",
                    "claimToken": "claim-1",
                    "sourceUrl": "/source",
                    "source": {
                        "filename": "plan.pdf",
                        "mimeType": "application/pdf",
                    },
                    "sourceSizeBytes": 100,
                    "leaseDurationMs": 300_000,
                }
            }

    with pytest.raises(ResultRejectedError, match="limits"):
        MissingLimitsApi(settings()).claim()
```

- [ ] **Step 5: Run the claim tests and verify they fail**

Run:

```bash
cd backend
npm test -- --run tests/extraction-worker.test.ts
cd ../ocr-worker
.venv/bin/python -m pytest tests/test_worker.py -q
```

Expected: backend FAIL because claims omit `sourceSizeBytes`/`limits`; worker FAIL because `ExtractionLimits` and the two `ClaimedJob` fields do not exist.

- [ ] **Step 6: Implement the claim wire contract**

In `ocr-worker/src/lisno_ocr/contracts.py`, add:

```python
@dataclass(frozen=True, slots=True)
class ExtractionLimits:
    max_source_bytes: int
    max_pages: int
    max_page_pixels: int
    max_text_words_per_page: int
    max_sections_per_page: int
    max_drawings_per_job: int
    max_decoded_image_bytes: int
    max_output_bytes: int
    max_completion_body_bytes: int
    max_processing_seconds: float
```

Add required `source_size_bytes` and `limits` fields to `ClaimedJob`. In `ocr-worker/src/lisno_ocr/worker.py`, parse every field with `_required_positive_number`, converting integer fields only after rejecting booleans and non-integers:

```python
def _extraction_limits(value: Any) -> ExtractionLimits:
    if not isinstance(value, dict):
        raise ResultRejectedError(
            "The backend worker response omitted extraction limits."
        )

    def positive_int(field: str) -> int:
        number = _required_positive_number(value, field)
        if not number.is_integer():
            raise ResultRejectedError(
                f"The backend worker response used an invalid {field}."
            )
        return int(number)

    return ExtractionLimits(
        max_source_bytes=positive_int("maxSourceBytes"),
        max_pages=positive_int("maxPages"),
        max_page_pixels=positive_int("maxPagePixels"),
        max_text_words_per_page=positive_int("maxTextWordsPerPage"),
        max_sections_per_page=positive_int("maxSectionsPerPage"),
        max_drawings_per_job=positive_int("maxDrawingsPerJob"),
        max_decoded_image_bytes=positive_int("maxDecodedImageBytes"),
        max_output_bytes=positive_int("maxOutputBytes"),
        max_completion_body_bytes=positive_int("maxCompletionBodyBytes"),
        max_processing_seconds=_required_positive_number(
            value, "maxProcessingSeconds"
        ),
    )
```

In both backend claim branches return:

```ts
sourceSizeBytes: job.upload.sizeBytes,
limits: extractionLimits
```

and:

```ts
sourceSizeBytes: version.sizeBytes,
limits: extractionLimits
```

Keep the project `source.sizeBytes` field unchanged. Remove `max_pdf_pages`, `max_page_pixels`, `max_output_bytes`, and `max_processing_seconds` from `WorkerSettings`; `run_worker` will consume the corresponding values from each `ClaimedJob.limits`.

Pass the current limits into both atomic claim operations and persist the complete snapshot on the claimed job in the same update/transaction that writes its claim token and lease. Project `claimExtractionJobById` gains the limits argument; estimate `claimWorkerJob` receives it from the extraction worker service. Add repository tests proving a lower snapshot is stored, returned, and unchanged throughout that claim's heartbeat/completion. Completion of a legacy active job with no snapshot falls back to the current ceiling-validated limits once for rollout compatibility.

- [ ] **Step 7: Run the contract tests and commit**

Run:

```bash
cd backend
npm test -- --run tests/config.test.ts tests/server.test.ts tests/extraction-worker.test.ts
npm run typecheck
cd ../ocr-worker
.venv/bin/python -m pytest tests/test_worker.py -q
```

Expected: PASS.

```bash
git add backend/src/config/extraction-limits.ts backend/src/config/env.ts backend/.env.example backend/src/server.ts backend/src/app.ts backend/src/models/DesignExtractionJob.ts backend/src/models/EstimateDesignExtractionJob.ts backend/src/repositories/types.ts backend/src/repositories/memory.ts backend/src/repositories/mongo.ts backend/src/services/extraction-worker.service.ts backend/src/services/estimate-design.service.ts backend/tests/config.test.ts backend/tests/server.test.ts backend/tests/repository.test.ts backend/tests/mongo-repository.test.ts backend/tests/extraction-worker.test.ts backend/tests/estimate-design-extraction.test.ts ocr-worker/src/lisno_ocr/contracts.py ocr-worker/src/lisno_ocr/worker.py ocr-worker/tests/test_worker.py
git commit -m "feat: publish authoritative extraction limits"
```

---

### Task 2: Bound source downloads and completion transport

**Files:**
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/routes/extraction-worker.ts`
- Modify: `backend/tests/extraction-worker.test.ts`
- Modify: `ocr-worker/src/lisno_ocr/worker.py`
- Modify: `ocr-worker/tests/test_worker.py`

**Interfaces:**
- `WorkerApi._download_source(source_url, suffix, claim_token, expected_bytes, maximum_bytes) -> Path` streams in `64 * 1024` byte chunks and never materializes the whole source.
- A claim whose `sourceSizeBytes` exceeds `limits.maxSourceBytes` fails before `urlopen`.
- A response `Content-Length` above the cap fails before reading; an absent or false header cannot bypass the running byte counter.
- A completed download must be non-empty and exactly equal to `sourceSizeBytes`.
- `WorkerApi._request_json(self, method: str, path: str, body: dict[str, Any] | None = None, claim_token: str | None = None, maximum_body_bytes: int | None = None) -> tuple[int, dict[str, Any]]` rejects an encoded completion body above the claimed cap before `urlopen`.
- The backend parser uses the immutable `MAXIMUM_EXTRACTION_LIMITS.maxCompletionBodyBytes`, records `request.extractionBodyBytes` in `verify`, and maps a hard-ceiling `entity.too.large` to HTTP 413 with safe code `EXTRACTION_RESULT_TOO_LARGE`. The completion service applies a claimed job's lower snapshot limit only after same-result replay/conflict inspection.

- [ ] **Step 1: Write failing worker download tests**

Add a small claimed-limit factory in `ocr-worker/tests/test_worker.py` using `dataclasses.replace`, then add:

```python
def test_download_rejects_claimed_source_size_before_opening_network(monkeypatch):
    claimed = replace(
        job(),
        source_size_bytes=6,
        limits=replace(job().limits, max_source_bytes=5),
    )
    opened = []
    monkeypatch.setattr(
        "lisno_ocr.worker.urlopen",
        lambda *_args, **_kwargs: opened.append(True),
    )

    with pytest.raises(InvalidSourceError, match="source byte limit"):
        WorkerApi(settings()).download(claimed)

    assert opened == []
```

```python
def test_download_stream_stops_when_actual_bytes_cross_the_cap(monkeypatch):
    class Response:
        status = 200
        headers = {}

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def __init__(self):
            self.chunks = iter((b"abc", b"def", b""))

        def read(self, size):
            assert size == 64 * 1024
            return next(self.chunks)

    monkeypatch.setattr(
        "lisno_ocr.worker.urlopen", lambda *_args, **_kwargs: Response()
    )
    claimed = replace(
        job(),
        source_size_bytes=5,
        limits=replace(job().limits, max_source_bytes=5),
    )

    with pytest.raises(InvalidSourceError, match="source byte limit"):
        WorkerApi(settings()).download(claimed)
```

Add a success test with chunks totaling the exact claimed length and assert the temporary file contains those bytes, then call `api.cleanup(path)`.

- [ ] **Step 2: Write failing completion-body and backend parser tests**

In `ocr-worker/tests/test_worker.py`:

```python
def test_completion_rejects_json_above_the_claimed_body_cap_before_network(
    monkeypatch,
):
    claimed = replace(
        job(),
        limits=replace(job().limits, max_completion_body_bytes=32),
    )
    api = WorkerApi(settings())
    api._claim_tokens[claimed.id] = claimed.claim_token
    api._claim_kinds[claimed.id] = claimed.kind
    api._claim_limits[claimed.id] = claimed.limits
    opened = []
    monkeypatch.setattr(
        "lisno_ocr.worker.urlopen",
        lambda *_args, **_kwargs: opened.append(True),
    )

    with pytest.raises(ResultRejectedError, match="completion body"):
        api.complete(claimed.id, "result-body-cap", [])

    assert opened == []
```

Extend the idempotency plan's real `release_claim` bookkeeping matrix to assert `_claim_limits` is present during completion/failure retries and absent after completion success, exhausted completion transport, download rejection, local result-construction failure, and exhausted `/fail` transport. `release_claim` remains the single owner of all per-claim dictionary cleanup.

In `backend/tests/extraction-worker.test.ts`, allow `setup` to receive an `extractionLimits` override and add:

```ts
it("rejects a completion body above the exact parser cap", async () => {
  const { app } = await setup(300, undefined, 0, {
    ...DEFAULT_EXTRACTION_LIMITS,
    maxCompletionBodyBytes: 256
  });
  const leased = await claim(app);

  const response = await request(app)
    .post("/api/v1/internal/extraction-jobs/job-1/complete")
    .set("Authorization", `Bearer ${WORKER_TOKEN}`)
    .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ padding: "x".repeat(300) }));

  expect(response.status).toBe(413);
  expect(response.body.error.code).toBe("EXTRACTION_RESULT_TOO_LARGE");
});
```

Add a service preflight assertion by injecting `maxSourceBytes: SOURCE.length - 1`, claiming, then requesting the source and expecting 413 before `storage.open` is called.

- [ ] **Step 3: Run focused transport tests and verify they fail**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_worker.py -q
cd ../backend
npm test -- --run tests/extraction-worker.test.ts
```

Expected: worker FAIL because downloads call `response.read()` without a cap and completion has no body budget; backend FAIL because the route hard-codes `"64mb"` and source service does not apply `maxSourceBytes`.

- [ ] **Step 4: Implement streaming source download**

Replace the eager read in `WorkerApi._download_source` with:

```python
if expected_bytes <= 0 or expected_bytes > maximum_bytes:
    raise InvalidSourceError(
        "The extraction source exceeds the configured source byte limit."
    )

handle = tempfile.NamedTemporaryFile(
    prefix="lisno-ocr-", suffix=suffix, delete=False
)
path = Path(handle.name)
written = 0
try:
    with urlopen(
        request, timeout=self._settings.request_timeout_seconds
    ) as response:
        raw_length = response.headers.get("Content-Length")
        if raw_length is not None:
            try:
                declared_length = int(raw_length)
            except ValueError as error:
                raise InvalidSourceError(
                    "The source download returned an invalid length."
                ) from error
            if declared_length > maximum_bytes:
                raise InvalidSourceError(
                    "The extraction source exceeds the configured source byte limit."
                )
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > maximum_bytes:
                raise InvalidSourceError(
                    "The extraction source exceeds the configured source byte limit."
                )
            handle.write(chunk)
    if written == 0:
        raise InvalidSourceError("The downloaded source file is empty.")
    if written != expected_bytes:
        raise InvalidSourceError(
            "The downloaded source size did not match the claimed source."
        )
except Exception:
    handle.close()
    path.unlink(missing_ok=True)
    raise
else:
    handle.close()
    return path
```

Pass `claimed.source_size_bytes` and `claimed.limits.max_source_bytes` from `download`.

- [ ] **Step 5: Implement exact completion-body caps on both sides**

Store claimed limits in `WorkerApi._claim_limits`. In `_request_json`, immediately after encoding:

```python
if (
    encoded is not None
    and maximum_body_bytes is not None
    and len(encoded) > maximum_body_bytes
):
    raise ResultRejectedError(
        "The worker completion body exceeds the configured byte limit."
    )
```

Pass the job's `max_completion_body_bytes` only from `complete`. Add `_claim_limits.pop(job_id, None)` to the existing centralized `WorkerApi.release_claim`; neither `complete` nor the failure callback removes it. The per-job `finally` from the idempotency plan invokes that one cleanup path for every success, rejection, exhausted transport, and abandoned job.

In `backend/src/routes/extraction-worker.ts`, build one hard-ceiling parser and retain the exact decoded JSON byte length:

```ts
const workerJson = json({
  limit: MAXIMUM_EXTRACTION_LIMITS.maxCompletionBodyBytes,
  verify(request, _response, buffer) {
    request.extractionBodyBytes = buffer.length;
  }
});
const boundedWorkerJson: RequestHandler = (request, response, next) => {
  workerJson(request, response, (error) => {
    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      next(
        new ApiError(
          413,
          "EXTRACTION_RESULT_TOO_LARGE",
          "The extraction result exceeds the configured body limit."
        )
      );
      return;
    }
    next(error);
  });
};
```

Add `extractionBodyBytes?: number` beside `extractionClaimToken` in the route's `Express.Request` declaration. Use `boundedWorkerJson` in the existing `/internal/extraction-jobs` router middleware. Pass the exact body byte count to `service.complete`; after its minimal `resultId` replay/conflict lookup, a first completion compares it with the persisted job snapshot's `maxCompletionBodyBytes` and throws the same safe 413 before full schema validation. In `downloadSource`, compare metadata `sizeBytes` with the claimed job snapshot's `maxSourceBytes` before calling `storage.open`.

Preserve the predecessor transport classification around the streaming implementation:

```python
except HTTPError as error:
    handle.close()
    path.unlink(missing_ok=True)
    if error.code in {408, 425, 429} or 500 <= error.code <= 599:
        raise BackendTransportError(
            f"The backend source request failed with HTTP {error.code}."
        ) from error
    raise ResultRejectedError(
        f"The backend rejected the source request with HTTP {error.code}."
    ) from error
except (URLError, TimeoutError, OSError) as error:
    handle.close()
    path.unlink(missing_ok=True)
    raise BackendTransportError(
        "The backend source request could not be completed."
    ) from error
except Exception:
    handle.close()
    path.unlink(missing_ok=True)
    raise
```

Add a `URLError` regression proving the temporary file is removed, the error remains `BackendTransportError`, the request is retried, and `/fail` is not called. Add a download 409 regression proving it remains a non-transient `ResultRejectedError`.

- [ ] **Step 6: Run transport tests and commit**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_worker.py -q
cd ../backend
npm test -- --run tests/extraction-worker.test.ts
npm run typecheck
```

Expected: PASS.

```bash
git add backend/src/services/extraction-worker.service.ts backend/src/routes/extraction-worker.ts backend/tests/extraction-worker.test.ts ocr-worker/src/lisno_ocr/worker.py ocr-worker/tests/test_worker.py
git commit -m "feat: bound extraction transport bytes"
```

---

### Task 3: Open PDFs once and cover one through maximum pages

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Modify: `ocr-worker/src/lisno_ocr/title_block.py`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `ocr-worker/tests/test_title_block.py`
- Modify: `ocr-worker/pyproject.toml`

**Interfaces:**
- `Extractor` receives one required `limits: ExtractionLimits`; worker construction passes `claimed.limits`.
- `_iter_pdf_pages(path, mode, deadline) -> Iterator[tuple[Image.Image, tuple[str, float] | None]]` owns one `fitz.Document`.
- `_bounded_pdf_words(page, maximum_words, deadline) -> tuple[PdfWordTuple, ...]` rejects word `maximum_words + 1`.
- `_validate_pdf_page_count(page_count, maximum_pages)` runs directly after `fitz.open`.
- `extract_pdf_title_block_candidate` returns a computed title-cell confidence in `[0.75, 0.98]`, never fabricated `1.0`.
- `_extract_estimate_page(image, page_number, embedded_candidate, deadline)` always returns exactly one full-page section. It uses the embedded candidate, or one bounded title-band OCR pass, or the explicit `Unidentified drawing — page <n>` fallback; it never enters the multi-region project extractor.

- [ ] **Step 1: Add a shared limits fixture and failing variable-page tests**

In `ocr-worker/tests/test_extractor.py`, add:

```python
from dataclasses import replace
from lisno_ocr.contracts import Crop, ExtractionLimits

LIMITS = ExtractionLimits(
    max_source_bytes=26_214_400,
    max_pages=50,
    max_page_pixels=40_000_000,
    max_text_words_per_page=20_000,
    max_sections_per_page=500,
    max_drawings_per_job=500,
    max_decoded_image_bytes=26_214_400,
    max_output_bytes=41_943_040,
    max_completion_body_bytes=67_108_864,
    max_processing_seconds=900,
)

def _write_titled_pdf(path: Path, page_count: int) -> None:
    document = fitz.open()
    try:
        for page_number in range(1, page_count + 1):
            page = document.new_page(width=400, height=160)
            page.insert_text((8, 130), "TITLE :")
            page.insert_text((48, 130), f"PAGE {page_number}")
        document.save(path)
    finally:
        document.close()

class OcrMustNotStart:
    def predict(self, **_kwargs):
        raise AssertionError("embedded PDF title should bypass OCR")
```

Add explicit tests:

```python
@pytest.mark.parametrize("page_count", [1, 3, 17, 50])
def test_pdf_extracts_one_variable_and_maximum_page_counts(
    tmp_path, page_count
):
    source = tmp_path / f"{page_count}-pages.pdf"
    _write_titled_pdf(source, page_count)

    pages = Extractor(
        limits=LIMITS,
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert [page.page_number for page in pages] == list(
        range(1, page_count + 1)
    )
    assert [page.sections[0].label for page in pages] == [
        f"PAGE {page_number}" for page_number in range(1, page_count + 1)
    ]
    assert all(len(page.sections) == 1 for page in pages)
    assert all(
        page.sections[0].crop
        == Crop(x=0, y=0, width=page.width, height=page.height)
        for page in pages
    )
```

```python
def test_pdf_above_maximum_rejects_before_embedded_text_or_render(
    monkeypatch, tmp_path
):
    class Page:
        def get_text(self, *_args):
            raise AssertionError("page count must fail before embedded text")

        def get_pixmap(self, **_kwargs):
            raise AssertionError("page count must fail before rendering")

    class Document:
        page_count = 51

        def __iter__(self):
            return iter((Page(),))

        def close(self):
            pass

    source = tmp_path / "51-pages.pdf"
    source.write_bytes(b"%PDF")
    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", lambda _path: Document())

    with pytest.raises(PdfRenderError, match="too many pages"):
        Extractor(
            limits=LIMITS,
            ocr_engine=OcrMustNotStart(),
        ).extract(source, mode="estimate_design")
```

Update every existing `Extractor(...)` construction in worker tests to pass `limits=LIMITS`; use `replace(LIMITS, max_pages=1)`, `replace(LIMITS, max_page_pixels=1_000)`, and `replace(LIMITS, max_output_bytes=31)` instead of the removed scalar constructor arguments.
Move the existing function-local `OcrMustNotStart` definition to the module-level definition above so every variable-page/private test uses the same guard.

- [ ] **Step 2: Add failing embedded-text bounds and confidence tests**

Add:

```python
def test_embedded_text_word_cap_rejects_before_render(monkeypatch, tmp_path):
    word = (1.0, 120.0, 2.0, 125.0, "word", 0, 0, 0)

    class Page:
        rect = type("Rect", (), {"width": 160, "height": 160})()

        def get_text(self, kind):
            assert kind == "words"
            return [word, word, word]

        def get_pixmap(self, **_kwargs):
            raise AssertionError("over-limit text must fail before rendering")

    class Document:
        page_count = 1

        def __iter__(self):
            return iter((Page(),))

        def close(self):
            pass

    source = tmp_path / "word-heavy.pdf"
    source.write_bytes(b"%PDF")
    monkeypatch.setattr("lisno_ocr.extractor.fitz.open", lambda _path: Document())

    with pytest.raises(PdfRenderError, match="too much embedded text"):
        Extractor(
            limits=replace(LIMITS, max_text_words_per_page=2),
            ocr_engine=OcrMustNotStart(),
        ).extract(source, mode="estimate_design")
```

In `ocr-worker/tests/test_title_block.py`, import both `extract_title_block` and `extract_pdf_title_block_candidate`, then directly exercise embedded words:

```python
def test_pdf_title_cell_uses_bounded_heuristic_confidence():
    words = (
        (10.0, 800.0, 40.0, 820.0, "TITLE", 0, 0, 0),
        (42.0, 800.0, 48.0, 820.0, ":", 0, 0, 1),
        (50.0, 800.0, 110.0, 820.0, "TV", 0, 0, 2),
        (112.0, 800.0, 170.0, 820.0, "UNIT", 0, 0, 3),
    )

    title, confidence = extract_pdf_title_block_candidate(
        words, page_width=1_000, page_height=1_000
    )

    assert title == "TV UNIT"
    assert 0.75 <= confidence <= 0.98
    assert confidence != 1.0
```

Add scanned/no-text and ambiguous-title regressions. Each uses `mode="estimate_design"`, proves only the title-band OCR is called once, and asserts exactly one full-page section. The no-title/ambiguous cases assert `label == "Unidentified drawing — page 1"`, `confidence == 0.0`, a nonempty proposal `detectedTitle` equal to that label, and null/ambiguous-safe taxonomy matches. Spy on `_drawing_regions`, `classify_drawing_titles`, and `_section_for_label` and assert none is called. Task 4 later changes that same full-page section from duplicated `imageBase64` to `imageSource: "page"` and adds the no-crop-encoding assertion.

- [ ] **Step 3: Run focused PDF tests and verify they fail**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_title_block.py tests/test_extractor.py -q
```

Expected: FAIL because `Extractor` has no required limits object, embedded text is read in a separate document before page-count validation, word count is unbounded, PDF title confidence is `1.0`, and a missing/ambiguous estimate title still falls through to multi-region extraction instead of returning one unidentified full-page drawing.

- [ ] **Step 4: Implement the one-open bounded PDF iterator**

Replace `_pdf_title_candidates` plus `_render_pdf_pages` with one iterator whose ordering is fixed:

```python
def _iter_pdf_pages(
    self,
    path: Path,
    *,
    mode: Literal["project_design", "estimate_design"],
    deadline: float | None,
) -> Iterator[tuple[Image.Image, tuple[str, float] | None]]:
    _require_processing_time(deadline)
    try:
        document = fitz.open(path)
    except Exception as error:
        raise PdfRenderError("The PDF could not be opened.") from error

    try:
        _validate_pdf_page_count(document.page_count, self._limits.max_pages)
        for page in document:
            _require_processing_time(deadline)
            candidate = None
            if mode == "estimate_design":
                words = _bounded_pdf_words(
                    page,
                    self._limits.max_text_words_per_page,
                    deadline,
                )
                candidate = extract_pdf_title_block_candidate(
                    words, page.rect.width, page.rect.height
                )
            _require_processing_time(deadline)
            image = self._render_pdf_page(page, deadline)
            _require_processing_time(deadline)
            yield image, candidate
    except (PdfRenderError, OcrError):
        raise
    except Exception as error:
        raise PdfRenderError("A PDF page could not be rendered.") from error
    finally:
        document.close()
```

Use:

```python
def _validate_pdf_page_count(page_count: int, maximum_pages: int) -> None:
    if page_count < 1:
        raise PdfRenderError("The PDF contains no pages.")
    if page_count > maximum_pages:
        raise PdfRenderError("The PDF contains too many pages.")

def _bounded_pdf_words(page, maximum_words, deadline):
    _require_processing_time(deadline)
    raw_words = page.get_text("words")
    _require_processing_time(deadline)
    words = []
    for index, word in enumerate(raw_words):
        if index % 256 == 0:
            _require_processing_time(deadline)
        if index >= maximum_words:
            raise PdfRenderError(
                "A PDF page contains too much embedded text."
            )
        words.append(word)
    _require_processing_time(deadline)
    return tuple(words)
```

Move the existing render-scale, pixmap release, and page-pixel checks into `_render_pdf_page`; do not weaken them.

Route every source page through `_extract_page(..., mode=mode)`. For `estimate_design`, `_extract_page` immediately delegates to `_extract_estimate_page` for both PDFs and image/multi-frame sources. `_extract_estimate_page` first uses the iterator's unique embedded candidate. When it is absent, crop only the configured title band, run the bounded OCR engine once, and call `extract_title_block_candidate`. If that result is also missing or ambiguous, use:

```python
label = f"Unidentified drawing — page {page_number}"
confidence = 0.0
```

Then build one proposal through the existing `classify_estimate_drawing`; the fallback label must produce null/ambiguous-safe room and scope evidence so the backend mapping plan stores true-null Misc. Return one full-page section and do not invoke `_drawing_regions`, `classify_drawing_titles`, `_section_for_label`, or crop encoding in this branch. The multi-title/multi-region path remains unchanged only for `project_design`.

- [ ] **Step 5: Implement heuristic title-cell confidence**

In `ocr-worker/src/lisno_ocr/title_block.py`, replace the returned `1.0` with:

```python
def _pdf_title_cell_confidence(
    marker: PdfWordTuple,
    value_words: Sequence[PdfWordTuple],
    page_width: float,
) -> float:
    marker_height = max(1.0, marker[3] - marker[1])
    tolerance = max(6.0, marker_height)
    marker_baseline = (marker[1] + marker[3]) / 2
    baseline_error = max(
        abs(((word[1] + word[3]) / 2) - marker_baseline)
        for word in value_words
    )
    alignment = max(0.0, 1.0 - baseline_error / tolerance)
    horizontal_gap = max(0.0, value_words[0][0] - marker[2])
    proximity = max(
        0.0,
        1.0 - horizontal_gap / max(1.0, page_width * 0.05),
    )
    return round(min(0.98, 0.75 + 0.15 * alignment + 0.08 * proximity), 4)
```

Store `(value, confidence)` per candidate and preserve the existing ambiguity check. This confidence describes title-cell geometry only; do not copy room/scope match confidence into it.

- [ ] **Step 6: Add private release regressions for the approved six-page subset and complete 34-page source**

Register the marker in `ocr-worker/pyproject.toml`:

```toml
markers = [
  "model: opt-in smoke tests that require locally installed PaddleOCR models",
  "private_fixture: release regressions that require OCR_PRIVATE_ESTIMATE_PDF",
]
```

Add a private-path guard and runtime subset builder to `ocr-worker/tests/test_extractor.py`. The guard pins the exact private file without copying it into the repository:

```python
import hashlib
import os

PRIVATE_PDF_SHA256 = (
    "f4e96363f04c89d32bf90fefdbcd23deba1737d1bea789a73da857236c926660"
)
PRIVATE_PDF_SIZE = 10_844_504

def _private_estimate_pdf() -> Path:
    configured = os.environ.get("OCR_PRIVATE_ESTIMATE_PDF")
    if not configured:
        pytest.skip("Set OCR_PRIVATE_ESTIMATE_PDF for private release regressions.")
    source = Path(configured)
    assert source.is_absolute()
    assert source.is_file()
    assert source.stat().st_size == PRIVATE_PDF_SIZE
    assert hashlib.sha256(source.read_bytes()).hexdigest() == PRIVATE_PDF_SHA256
    return source

def _first_six_pages(source: Path, destination: Path) -> Path:
    original = fitz.open(source)
    subset = fitz.open()
    try:
        assert original.page_count == 34
        subset.insert_pdf(original, from_page=0, to_page=5)
        subset.save(destination)
    finally:
        subset.close()
        original.close()
    return destination
```

Add the approved six-page golden regression. It creates the subset only under pytest's temporary directory:

```python
@pytest.mark.private_fixture
def test_supplied_first_six_pages_preserve_approved_golden_titles(tmp_path):
    source = _first_six_pages(
        _private_estimate_pdf(), tmp_path / "approved-first-six-pages.pdf"
    )

    pages = Extractor(
        limits=LIMITS,
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert [page.page_number for page in pages] == [1, 2, 3, 4, 5, 6]
    assert [page.sections[0].label for page in pages] == [
        "TV UNIT",
        "DINING - SEATER UNIT",
        "PUJA - UNIT",
        "PUJA BACK PANEL",
        "CROCKERY - UNIT",
        "KITCHEN",
    ]
    assert all(
        0.75 <= page.sections[0].confidence <= 0.98
        for page in pages
    )
    assert all(
        len(page.sections) == 1
        and page.sections[0].crop
        == Crop(x=0, y=0, width=page.width, height=page.height)
        for page in pages
    )
```

Add the full variable-count regression and pin all 34 canonical titles:

```python
@pytest.mark.private_fixture
def test_supplied_full_pdf_extracts_all_34_pages_on_variable_path():
    pages = Extractor(
        limits=LIMITS,
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(_private_estimate_pdf(), mode="estimate_design")

    assert [page.page_number for page in pages] == list(range(1, 35))
    assert [page.sections[0].label for page in pages] == [
        "TV UNIT",
        "DINING - SEATER UNIT",
        "PUJA - UNIT",
        "PUJA BACK PANEL",
        "CROCKERY - UNIT",
        "KITCHEN",
        "KITCHEN",
        "DINING - SEATER UNIT",
        "KITCHEN",
        "DINING - SEATER UNIT",
        "KITCHEN",
        "KITCHEN",
        "KITCHEN",
        "UTILITY - UNIT",
        "UTILITY - UNIT",
        "MBR - WARDROBE",
        "MBR - WARDROBE",
        "MBR - WARDROBE",
        "MBR WARDROBE SHUTTER",
        "MBR WARDROBE SHUTTER",
        "MBR WARDROBE SHUTTER",
        "MBR DRESSER UNIT",
        "PBR - WARDROBE",
        "PBR WARDROBE",
        "PBR - WARDROBE",
        "PBR - WARDROBE",
        "PBR STUDY",
        "KBR - WARDROBE",
        "KBR WARDROBE",
        "KBR - WARDROBE",
        "KBR - WARDROBE",
        "KBR - WARDROBE",
        "MBR & COMMON VANITY",
        "MBR & COMMON VANITY",
    ]
    assert all(
        len(page.sections) == 1
        and page.sections[0].crop
        == Crop(x=0, y=0, width=page.width, height=page.height)
        for page in pages
    )
```

- [ ] **Step 7: Run PDF tests and commit**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -m "not model and not private_fixture" tests/test_title_block.py tests/test_extractor.py -q
```

Expected: PASS, including 1, 3, 17, 50, and rejection at 51; the private release regressions are deselected.

Run the required private release regression:

```bash
: "${OCR_PRIVATE_ESTIMATE_PDF:?Set OCR_PRIVATE_ESTIMATE_PDF to the supplied 34-page PDF}"
case "$OCR_PRIVATE_ESTIMATE_PDF" in /*) ;; *) echo "OCR_PRIVATE_ESTIMATE_PDF must be absolute" >&2; exit 1;; esac
test -f "$OCR_PRIVATE_ESTIMATE_PDF"
cd ocr-worker
.venv/bin/python -m pytest -m private_fixture tests/test_extractor.py -q
```

Expected: PASS for both the runtime-derived first-six-page golden subset and the complete 34-page path.

```bash
git add ocr-worker/src/lisno_ocr/contracts.py ocr-worker/src/lisno_ocr/extractor.py ocr-worker/src/lisno_ocr/title_block.py ocr-worker/tests/test_title_block.py ocr-worker/tests/test_extractor.py ocr-worker/pyproject.toml
git commit -m "feat: bound variable-page PDF extraction"
```

---

### Task 4: Enforce worker artifact/drawing limits and reuse page images

**Files:**
- Modify: `ocr-worker/src/lisno_ocr/contracts.py`
- Modify: `ocr-worker/src/lisno_ocr/extractor.py`
- Modify: `ocr-worker/src/lisno_ocr/image_formats.py`
- Modify: `ocr-worker/src/lisno_ocr/worker.py`
- Modify: `ocr-worker/tests/test_extractor.py`
- Modify: `ocr-worker/tests/test_image_formats.py`
- Modify: `ocr-worker/tests/test_contract_fixture.py`
- Modify: `ocr-worker/tests/test_worker.py`

**Interfaces:**
- `ExtractedSection` has exactly one image representation: legacy `image_base64` or `image_source == "page"`.
- `ExtractedSection.to_payload()` emits either `imageBase64` or `imageSource: "page"`, never both.
- `_encode_png(image, maximum_decoded_bytes) -> tuple[str, int]` returns canonical base64 and exact decoded PNG byte count.
- `Extractor` rejects more than `max_sections_per_page` candidate sections before crop encoding.
- `Extractor` rejects more than `max_drawings_per_job` across pages before encoding the drawing that crosses the cap.
- Every `estimate_design` page from Task 3 has exactly one `image_source == "page"` section; only `project_design` and legacy non-page-backed paths may produce multiple cropped sections.
- Aggregate output accounts for each page/crop once and must not exceed `max_output_bytes`.
- `run_worker` computes its deadline with `claimed.limits.max_processing_seconds` and constructs `Extractor(limits=claimed.limits, ...)`.

- [ ] **Step 1: Write failing page-image payload tests**

Replace the duplicate-image assertions in `ocr-worker/tests/test_extractor.py` with:

```python
section = pages[0].sections[0]
assert section.image_source == "page"
assert section.image_base64 is None
assert section.to_payload() == {
    "label": "Living Room Flooring",
    "confidence": 0.97,
    "crop": {
        "x": 0,
        "y": 0,
        "width": pages[0].width,
        "height": pages[0].height,
    },
    "imageSource": "page",
    "proposal": section.proposal.to_payload(),
}
```

Change the title-block budget regression to prove the page is counted once:

```python
def test_pdf_title_block_fast_path_counts_page_image_once(monkeypatch, tmp_path):
    source = tmp_path / "title-block.pdf"
    _write_titled_pdf(source, 1)
    from lisno_ocr import extractor as module
    monkeypatch.setattr(module, "_encode_png", lambda _image, _maximum: ("A" * 40, 30))

    pages = Extractor(
        limits=replace(LIMITS, max_output_bytes=30),
        ocr_engine=OcrMustNotStart(),
        render_scale=1,
        estimate_taxonomy=EstimateTaxonomy((), ()),
    ).extract(source, mode="estimate_design")

    assert pages[0].sections[0].image_source == "page"
```

In `ocr-worker/tests/test_contract_fixture.py`, keep the legacy crop assertion and add a full-page contract assertion:

```python
assert set(full_page_section.to_payload()) == {
    "label", "confidence", "crop", "imageSource", "proposal"
}
assert full_page_section.to_payload()["imageSource"] == "page"
assert "imageBase64" not in full_page_section.to_payload()
```

Also assert construction rejects both fields, neither field, an empty `image_base64`, and any runtime `image_source` other than `"page"`.

Add a parameterized estimate test covering an embedded title, OCR title-band fallback, no title, and ambiguous title. For each, assert one section, full-page crop, `image_source == "page"`, `image_base64 is None`, and exactly one page PNG encoding. The no-title/ambiguous rows retain Task 3's explicit unidentified label and Misc-capable proposal.

- [ ] **Step 2: Write failing section, global drawing, image, and output tests**

Replace the prior silent candidate-cap test with:

```python
def test_section_cap_rejects_before_crop_encoding(monkeypatch):
    ocr = FakePaddleOCR3([{
        "rec_boxes": [[1, 1, 20, 20]] * 3,
        "rec_texts": [f"Bedroom {index} Plan" for index in range(3)],
        "rec_scores": [0.9] * 3,
    }])
    encoded_sizes = []

    def encode(image, maximum):
        encoded_sizes.append(image.size)
        return "AAAA", 3

    monkeypatch.setattr("lisno_ocr.extractor._encode_png", encode)
    with pytest.raises(OcrError, match="too many sections"):
        Extractor(
            limits=replace(LIMITS, max_sections_per_page=2),
            ocr_engine=ocr,
        ).extract(FIXTURES / "labeled-plan.png")

    assert encoded_sizes == []
```

Add a two-page `project_design` global test with two accepted titles per page and `max_drawings_per_job=3`; assert the second page's crossing crop is never encoded and the error contains `"too many drawings"`. This deliberately exercises the project multi-region path; estimate pages never enter it.

Add exact decoded-artifact and aggregate-output tests:

```python
def test_decoded_png_limit_is_independent_from_aggregate_output(
    monkeypatch,
):
    monkeypatch.setattr(
        "lisno_ocr.extractor._png_bytes",
        lambda _image: b"x" * 6,
    )
    with pytest.raises(OcrError, match="image is too large"):
        Extractor(
            limits=replace(
                LIMITS,
                max_decoded_image_bytes=5,
                max_output_bytes=100,
            ),
            ocr_engine=FakePaddleOCR3([]),
        ).extract(FIXTURES / "labeled-plan.png")
```

For `ocr-worker/tests/test_image_formats.py`, pass limits explicitly and assert the page-count/pixel checks happen before `image.load()`.

- [ ] **Step 3: Run worker bound tests and verify they fail**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest tests/test_extractor.py tests/test_image_formats.py tests/test_contract_fixture.py tests/test_worker.py -q
```

Expected: FAIL because full-page sections still duplicate base64, project section excess truncates, no global drawing counter exists, decoded artifact bytes are not independently capped, and `run_worker` still reads local setting limits.

- [ ] **Step 4: Implement the section image union**

In `ocr-worker/src/lisno_ocr/contracts.py`:

```python
@dataclass(frozen=True, slots=True)
class ExtractedSection:
    label: str
    confidence: float
    crop: Crop
    image_base64: str | None = None
    proposal: EstimateDrawingProposal | None = None
    image_source: Literal["page"] | None = None

    def __post_init__(self) -> None:
        if self.image_source not in (None, "page"):
            raise ValueError("A section used an invalid image source.")
        if self.image_base64 is not None and not self.image_base64:
            raise ValueError("A section image cannot be empty.")
        if (self.image_base64 is None) == (self.image_source is None):
            raise ValueError(
                "A section must use exactly one image representation."
            )

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "label": self.label,
            "confidence": self.confidence,
            "crop": self.crop.to_payload(),
        }
        if self.image_source == "page":
            payload["imageSource"] = "page"
        else:
            payload["imageBase64"] = self.image_base64
        if self.proposal is not None:
            payload["proposal"] = self.proposal.to_payload()
        return payload
```

In `_extract_title_block_page`, set `image_base64=None`, `image_source="page"`, and return only the page PNG's decoded size as `used`.

- [ ] **Step 5: Implement exact image/output and drawing accounting**

Replace approximate `_decoded_base64_size` accounting with:

```python
def _png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()

def _encode_png(
    image: Image.Image, maximum_decoded_bytes: int
) -> tuple[str, int]:
    data = _png_bytes(image)
    if len(data) > maximum_decoded_bytes:
        raise OcrError("An extracted image is too large.")
    return base64.b64encode(data).decode("ascii"), len(data)
```

In the project/multi-region branch, before region detection or crop PNG encoding, validate:

```python
if len(titles) > self._limits.max_sections_per_page:
    raise OcrError("A source page contains too many sections.")
if len(titles) > remaining_drawings:
    raise OcrError("The extraction contains too many drawings.")
```

Pass `remaining_drawings` into `_extract_page`, subtract the returned section count after every page, and use the returned exact byte sizes for `max_output_bytes`. Check the deadline before and after `_png_bytes`.

In the estimate branch, assert the Task 3 invariant immediately before serialization: exactly one full-page section. Set `image_base64=None`, `image_source="page"`, count only the page PNG, and return before the project title list, region detection, section-cap loop, or crop encoding. The global drawing counter still decrements by one per estimate page, so `maxDrawingsPerJob < page count` fails deterministically before completion serialization.

For non-PDF sources, pass `max_pages`, `max_page_pixels`, and `deadline` from `self._limits` to `open_source_pages`; add `_require_processing_time` callbacks before frame seek, before/after load, and before/after RGB conversion.

In `run_worker`:

```python
extraction_deadline = (
    time.monotonic() + claimed.limits.max_processing_seconds
)
page_extractor = extractor or Extractor(
    limits=claimed.limits,
    confidence_floor=settings.confidence_floor,
    estimate_taxonomy=claimed.taxonomy,
)
```

- [ ] **Step 6: Run worker suites and commit**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -m "not model and not private_fixture"
```

Expected: PASS.

```bash
git add ocr-worker/src/lisno_ocr/contracts.py ocr-worker/src/lisno_ocr/extractor.py ocr-worker/src/lisno_ocr/image_formats.py ocr-worker/src/lisno_ocr/worker.py ocr-worker/tests/test_extractor.py ocr-worker/tests/test_image_formats.py ocr-worker/tests/test_contract_fixture.py ocr-worker/tests/test_worker.py
git commit -m "feat: cap worker output and reuse page images"
```

---

### Task 5: Validate both completion shapes and avoid duplicate backend artifacts

**Files:**
- Modify: `backend/src/routes/extraction-worker.ts`
- Modify: `backend/src/services/extraction-worker.service.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/extraction-worker.test.ts`
- Test: `backend/tests/estimate-design-extraction.test.ts`

**Interfaces:**
- Produces `WorkerSectionImage = { imageBase64: string; imageSource?: never } | { imageSource: "page"; imageBase64?: never }`.
- Replace the current section interfaces with intersections, because an interface cannot extend a union: `type WorkerSectionResult = WorkerSectionBase & WorkerSectionImage`, with the equivalent estimate base/intersection.
- The route hard-cap parser passes the original `unknown` plus `extractionBodyBytes` to the service. A minimal `.passthrough()` object schema validates only `kind?` and `resultId`; after replay/conflict and claim lookup, `completionSchemaFor(job.extractionLimits)` validates the untouched original body.
- Normalized sections carry `usesPageImage: boolean`; when true, `image` is the exact page `Buffer` reference and persistence uses the page's stored reference.
- Legacy `imageBase64` sections remain accepted and stored as their own generated crop.
- A new-shape estimate page contains exactly one `imageSource: "page"` section with a full-page crop. A prior-worker estimate page contains zero through `maxSectionsPerPage` `imageBase64` sections. Empty legacy pages remain accepted only for backend-first rollout compatibility. Mixed image representations or multiple page-backed estimate sections are invalid; project pages retain the general per-section union.
- Project and estimate normalization both enforce the exact page, per-page section, global drawing, page-pixel, decoded-image, and aggregate-output limits before storage.
- For project, ordinary estimate, and queued replacement completion, the predecessor plan's ordering is immutable: same-result/different-result inspection precedes claim validation, raw-body snapshot limits, taxonomy, full Zod validation, Sharp/base64 work, storage, and bulk writes; the same decision is repeated inside the transaction.

- [ ] **Step 1: Add failing backend compatibility and no-duplication tests**

In `backend/tests/extraction-worker.test.ts`, change one project completion section to:

```ts
{
  label: "Ground Floor Elevation",
  confidence: 0.42,
  crop: { x: 0, y: 0, width: 1000, height: 800 },
  imageSource: "page"
}
```

Assert only one new storage object is created for the page and the revision points to the page reference:

```ts
expect(storage.objects.size).toBe(objectCountBefore + 1);
const [page] = await repository.listSourcePages("version-aurora-plan-1");
const [section] = await repository.listDesignSections("version-aurora-plan-1");
const [revision] = await repository.listSectionRevisions(section!.id);
expect(revision!.croppedFileReference).toBe(page!.renderedFileReference);
```

Keep a second test using the existing legacy `imageBase64` body and assert it still creates page plus crop objects.

In `backend/tests/estimate-design-extraction.test.ts`, make the primary new-worker fixture contain two pages with exactly one full-page proposal per page, each using `imageSource: "page"` and a full-page crop. Spy before completion, then assert:

```ts
const generatedWrites = vi.spyOn(storage, "saveGenerated");
const response = await complete(app, leased.body.data.claimToken);
expect(response.status).toBe(200);
expect(generatedWrites).toHaveBeenCalledTimes(2);
expect(revisions.map((revision) => revision.croppedFileReference)).toEqual([
  pages[0]!.normalizedFileReference,
  pages[1]!.normalizedFileReference
]);
```

Keep multi-section compatibility in a separate legacy `imageBase64` test; do not use multiple page-backed drawings as the production happy path. Add this exact invalid-union table to `backend/tests/extraction-worker.test.ts`:

```ts
it.each([
  ["both image fields", { imageSource: "page", imageBase64: PNG_BASE64 }],
  ["neither image field", {}],
  ["page source with partial crop", { imageSource: "page" }]
])("rejects %s before storage", async (_name, imageFields) => {
  const { app, storage } = await setup();
  const leased = await claim(app);
  const objectCount = storage.objects.size;
  const body = completeBody();
  Object.assign(body.pages[0]!.sections[0]!, imageFields);
  if (_name === "page source with partial crop") {
    delete body.pages[0]!.sections[0]!.imageBase64;
    body.pages[0]!.sections[0]!.crop = {
      x: 5,
      y: 6,
      width: 20,
      height: 10
    };
  }
  if (_name === "neither image field") {
    delete body.pages[0]!.sections[0]!.imageBase64;
  }
  const response = await request(app)
    .post("/api/v1/internal/extraction-jobs/job-1/complete")
    .set("Authorization", `Bearer ${WORKER_TOKEN}`)
    .set("X-Extraction-Claim-Token", leased.body.data.claimToken)
    .send(body);
  expect(response.status).toBe(400);
  expect(storage.objects.size).toBe(objectCount);
});
```

Add the same table to `backend/tests/estimate-design-extraction.test.ts`, using its existing `complete(app, claimToken, body)` helper and asserting `pages`, `drawings`, and `revisions` remain empty. For the page-source case set the crop to `{ x: 5, y: 6, width: 20, height: 10 }`; for the other two cases retain the existing valid crop.

For estimate completion, also reject before storage:

- two `imageSource: "page"` sections on one page;
- one page-backed section mixed with any `imageBase64` section; and
- a page-backed section whose proposal/title is empty.

Keep one separate all-`imageBase64` page with multiple sections and prove staged-rollout compatibility still succeeds. Add a zero-section prior-worker estimate page and assert completion still accepts/persists its source page without a drawing or revision; this exact legacy exception prevents a backend-first rollout from rejecting the currently deployed worker. New page-backed payloads never use the exception.

Add a 34-page new-worker completion fixture with one tiny valid page PNG and exactly one full-page page-backed proposal per page. Assert completion persists exactly 34 source pages, 34 drawings, and 34 revisions, and performs exactly 34 generated page writes with no crop writes. Together with Task 3's private regression, this proves the supplied 34-page source cannot fan out into extra drawings.

Add project, ordinary estimate, and queued-replacement replay tests using the page-backed body. Complete once, then resend the same `resultId` with an expired/wrong claim token and deliberately malformed/oversnapshot page data (while remaining below the immutable parser ceiling). Assert the exact stored receipt with `replayed: true` and zero Sharp, storage, mapping, or bulk-write calls. Send a different `resultId` and assert 409 with the same zero-write guarantees. Retain the transaction-scoped concurrent recheck tests from the idempotency plan.

In those replay tests, assert the minimal parser accepts extra `pages` data—including deliberately malformed page fields—without stripping or transforming it. For a first completion, pass the exact same original `unknown` value to the full schema and prove that malformed data is then rejected. Never reuse the minimal parser's output as the full-parser input.

- [ ] **Step 2: Add failing centralized bound tests**

For both test files, inject one small persisted claim snapshot at a time and assert rejection before storage for:

```ts
[
  ["pages", (body) => body.pages.push({ ...body.pages[0], pageNumber: 2 })],
  ["page pixels", (body) => {
    body.pages[0].width = 101;
    body.pages[0].height = 100;
  }],
  ["sections per page", (body) => {
    body.pages[0].sections[0].imageBase64 =
      CROP_PNG.toString("base64");
    delete body.pages[0].sections[0].imageSource;
    body.pages[0].sections.push(
      structuredClone(body.pages[0].sections[0])
    );
  }],
  ["drawings per job", (body) => {
    body.pages.push({
      ...structuredClone(body.pages[1]),
      pageNumber: 3
    });
  }],
  ["aggregate output", (body) => {
    body.pages[0].sections[0].imageBase64 = CROP_PNG.toString("base64");
    delete body.pages[0].sections[0].imageSource;
  }],
  ["decoded image bytes", (body) => {
    body.pages[0].sections[0].imageBase64 = CROP_PNG.toString("base64");
    delete body.pages[0].sections[0].imageSource;
  }]
]
```

Build a separate limits object per table row so each body crosses only its named bound; do not enable all small limits at once. For the per-page section case, convert that page entirely to the legacy `imageBase64` shape before duplicating its section, so the test reaches the configured bound instead of the new one-page-backed-section contract. For the global-drawing case, create three pages with one page-backed section each, set `maxPages: 3`, `maxSectionsPerPage: 1`, and `maxDrawingsPerJob: 2`. For the aggregate-output case, keep decoded-image limits above each individual image and set `maxOutputBytes` to one byte below the exact page-plus-crop total. For decoded bytes, use a valid PNG whose encoded buffer is exactly one byte over `maxDecodedImageBytes` while aggregate output remains high. For the pixel case, generate a valid 101×100 PNG matching the declared dimensions, keep decoded/output caps high, and set `maxPagePixels: 10_000`. Use `maxPages: 1` only for the page-count case. Assert the specific intended safe message/code for each guard, response 400, and no change to the storage write count; do not use arbitrary non-PNG buffers that could fail a different validator first.

- [ ] **Step 3: Run backend completion tests and verify they fail**

Run:

```bash
cd backend
npm test -- --run tests/extraction-worker.test.ts tests/estimate-design-extraction.test.ts
```

Expected: FAIL because schemas require `imageBase64`, full-page crops are stored separately, project pages still allow 100, and aggregate bytes use `maxImageBytes * 4`.

- [ ] **Step 4: Implement strict backward-compatible schemas**

Remove full completion validation from the route. In the service, retain `rawBody: unknown`, parse only this passthrough envelope, perform the predecessor's replay/conflict lookup, require the current claim for a first completion, load the job's persisted limits snapshot, enforce `extractionBodyBytes`, and only then pass `rawBody`—not `envelope`—to the full schema:

```ts
const replayEnvelopeSchema = z.object({
  resultId: z.string().trim().min(1).max(128),
  kind: z.literal("estimate_design").optional()
}).passthrough();

const envelope = replayEnvelopeSchema.parse(rawBody);
// replay/conflict/claim/snapshot checks use envelope.resultId and envelope.kind
const completion = completionSchemaFor(job.extractionLimits).parse(rawBody);
```

Build each section schema as a union:

```ts
const sectionImageBase64Schema = sectionBaseSchema
  .extend({ imageBase64: z.string().min(1) })
  .strict();
const sectionPageImageSchema = sectionBaseSchema
  .extend({ imageSource: z.literal("page") })
  .strict();
const sectionSchema = z.union([
  sectionImageBase64Schema,
  sectionPageImageSchema
]);
```

For project sections, retain that exact per-section union. For estimate sections, extend an `estimateSectionBaseSchema` that requires the proposal, then build page-level compatibility arms so a page cannot mix representations:

```ts
const estimateLegacyPageSchema = estimatePageBaseSchema.extend({
  sections: z.array(
    estimateSectionBaseSchema
      .extend({ imageBase64: z.string().min(1) })
      .strict()
  ).max(limits.maxSectionsPerPage)
}).strict();

const estimatePageBackedPageSchema = estimatePageBaseSchema.extend({
  sections: z.tuple([
    estimateSectionBaseSchema
      .extend({ imageSource: z.literal("page") })
      .strict()
  ])
}).strict();

const estimatePageSchema = z.union([
  estimatePageBackedPageSchema,
  estimateLegacyPageSchema
]);
```

The tuple arm is the new-worker contract: exactly one page-backed drawing for every estimate page. The array arm exists only for all-inline prior-worker payloads during the compatibility window and intentionally permits an empty array because the deployed worker can return no recognized title. Build page/completion schemas inside `completionSchemaFor(limits)`:

```ts
pages: z.array(pageSchema).min(1).max(limits.maxPages)
```

For project pages, continue to use:

```ts
sections: z.array(sectionSchema).max(limits.maxSectionsPerPage)
```

The project and estimate completion schemas use the same persisted snapshot values. Estimate pages use `estimatePageSchema` above instead of the general section union. Repeat replay/conflict inside the transaction exactly as in the predecessor plan.

- [ ] **Step 5: Implement preflight and normalization once per result**

Before decoding any image, run:

```ts
function preflightPages(
  pages: Array<{
    width: number;
    height: number;
    sections: Array<{
      imageSource?: "page";
      imageBase64?: string;
    }>;
  }>,
  limits: ExtractionLimits,
  kind: "project_design" | "estimate_design",
  reject: (message: string) => never
) {
  if (pages.length < 1 || pages.length > limits.maxPages) {
    reject("The extraction result exceeds the page limit.");
  }
  let drawings = 0;
  for (const page of pages) {
    if (page.width * page.height > limits.maxPagePixels) {
      reject("The extraction result exceeds the page-pixel limit.");
    }
    if (page.sections.length > limits.maxSectionsPerPage) {
      reject("A page exceeds the section limit.");
    }
    if (kind === "estimate_design") {
      const pageBacked = page.sections.filter(
        (section) => section.imageSource === "page"
      ).length;
      if (
        pageBacked > 0 &&
        (pageBacked !== 1 || page.sections.length !== 1)
      ) {
        reject(
          "A page-backed estimate result must contain one drawing per page."
        );
      }
    }
    drawings += page.sections.length;
    if (drawings > limits.maxDrawingsPerJob) {
      reject("The extraction result exceeds the drawing limit.");
    }
  }
}
```

Call the project version with `kind: "project_design", reject: invalidResult` and the estimate version with `kind: "estimate_design", reject: invalidWorkerResult` before storage. Schema validation already rejects a mixed estimate page; keep the explicit preflight assertion as a defense-in-depth invariant before decoding or storage. Decode each base64 value with `limits.maxDecodedImageBytes`; pass `limits.maxPagePixels` to Sharp; increment aggregate bytes only for a page or actual legacy crop, then reject when `totalBytes > limits.maxOutputBytes`.

Resolve a section image with:

```ts
if (section.imageSource === "page") {
  if (
    section.crop.x !== 0 ||
    section.crop.y !== 0 ||
    section.crop.width !== page.width ||
    section.crop.height !== page.height
  ) {
    invalidResult("A page-backed section must use the full-page crop.");
  }
  return { image: pageImage, usesPageImage: true };
}
const image = decodeBase64(
  section.imageBase64,
  limits.maxDecodedImageBytes
);
return { image, usesPageImage: false };
```

Run `validatePng` only for decoded legacy crops; the page buffer was already decoded and validated.

- [ ] **Step 6: Reuse stored page references**

In project completion:

```ts
let croppedFileReference = pageImage.reference;
if (!proposal.usesPageImage) {
  const storedCrop = await storage.save({
    data: proposal.image,
    extension: ".png"
  });
  storedReferences.push(storedCrop.reference);
  croppedFileReference = storedCrop.reference;
}
```

In estimate completion:

```ts
let croppedFileReference = storedPage.reference;
if (!section.usesPageImage) {
  const storedCrop = await saveGeneratedImage(input.storage, section.image);
  references.push(storedCrop.reference);
  croppedFileReference = storedCrop.reference;
}
```

Assign that reference to the existing revision field. Do not change the source-page or revision schemas.

- [ ] **Step 7: Run completion tests and commit**

Run:

```bash
cd backend
npm test -- --run tests/extraction-worker.test.ts tests/estimate-design-extraction.test.ts
npm run typecheck
```

Expected: PASS for new page-backed sections and legacy inline-image sections.

```bash
git add backend/src/routes/extraction-worker.ts backend/src/services/extraction-worker.service.ts backend/src/services/estimate-design.service.ts backend/src/app.ts backend/tests/extraction-worker.test.ts backend/tests/estimate-design-extraction.test.ts
git commit -m "feat: validate bounded page-backed completions"
```

---

### Task 6: Use bounded bulk writes for both completion paths

**Files:**
- Modify: `backend/src/repositories/mongo.ts`
- Modify: `backend/src/services/estimate-design.service.ts`
- Test: `backend/tests/mongo-repository.test.ts`
- Test: `backend/tests/estimate-design-extraction.test.ts`
- Test: `backend/tests/extraction-completion.replica-set.test.ts`
- Modify: `backend/tests/helpers/mongo-replica-set.ts`

**Interfaces:**
- Project replacement uses one ordered `insertMany` for `DesignSourcePageModel`, one for `DesignSectionModel`, and one for `DesignSectionRevisionModel`, all in the existing transaction/session.
- Estimate completion uses one ordered `insertMany` for `EstimateDesignSourcePageModel`, one for `EstimateDesignDrawingModel`, and one for `EstimateDesignRevisionModel`, all in the existing transaction/session.
- Queued estimate replacement uses one ordered single-record `insertMany` for its source page and revision; it continues to update the existing drawing rather than inserting a new drawing.
- Empty arrays skip the corresponding call.
- No new arbitrary batch-size setting is needed: Task 5 prevalidates the exact hard upper bounds of 50/500/500 before these arrays are built.

- [ ] **Step 1: Write failing project bulk-write tests**

In `backend/tests/mongo-repository.test.ts`, update `mockSuccessfulReplacement` to spy on `insertMany`, then assert:

```ts
it("bulk-inserts one bounded project replacement in the active session", async () => {
  const session = {} as mongoose.ClientSession;
  const writes = mockSuccessfulReplacement();

  await createMongoRepository(session).replaceExtractionDraft(
    validReplacement()
  );

  expect(DesignSourcePageModel.insertMany).toHaveBeenCalledOnce();
  expect(DesignSourcePageModel.insertMany).toHaveBeenCalledWith(
    [expect.objectContaining({ _id: "page-replace" })],
    { session, ordered: true }
  );
  expect(DesignSectionModel.insertMany).toHaveBeenCalledWith(
    [expect.objectContaining({ _id: "section-replace" })],
    { session, ordered: true }
  );
  expect(DesignSectionRevisionModel.insertMany).toHaveBeenCalledWith(
    [expect.objectContaining({ _id: "revision-replace" })],
    { session, ordered: true }
  );
});
```

Assert `DesignSourcePageModel.create`, `DesignSectionModel.create`, and `DesignSectionRevisionModel.create` are not called during replacement.

- [ ] **Step 2: Write failing estimate bulk-write tests**

In the estimate test setup, retain `create` spies for manual-drawing workflows and add completion-specific `insertMany` spies that append to the in-memory arrays. Add:

```ts
it("publishes bounded estimate documents with one bulk write per model", async () => {
  const { app, session } = setup();
  const leased = await claim(app);

  const response = await complete(app, leased.body.data.claimToken);
  expect(response.status).toBe(200);

  expect(EstimateDesignSourcePageModel.insertMany).toHaveBeenCalledOnce();
  expect(EstimateDesignDrawingModel.insertMany).toHaveBeenCalledOnce();
  expect(EstimateDesignRevisionModel.insertMany).toHaveBeenCalledOnce();
  expect(EstimateDesignSourcePageModel.insertMany).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({ session, ordered: true })
  );
});
```

The existing rollback test must mock `EstimateDesignDrawingModel.insertMany` rejection instead of `create`.

Add a queued-replacement assertion that `EstimateDesignSourcePageModel.insertMany` and `EstimateDesignRevisionModel.insertMany` each receive one record with `{ session, ordered: true }`, while their `create` methods are not called.

- [ ] **Step 3: Run bulk-write tests and verify they fail**

Run:

```bash
cd backend
npm test -- --run tests/mongo-repository.test.ts tests/estimate-design-extraction.test.ts
```

Expected: FAIL because project replacement writes each record in loops and estimate completion calls `Model.create`.

- [ ] **Step 4: Implement ordered bounded project bulk inserts**

In `replaceExtractionDraft`, replace the three per-record loops with:

```ts
if (input.sourcePages.length > 0) {
  await DesignSourcePageModel.insertMany(
    input.sourcePages.map(sourcePageForMongo),
    { session, ordered: true }
  );
}
if (input.sections.length > 0) {
  await DesignSectionModel.insertMany(
    input.sections.map(({ section }) => sectionForMongo(section)),
    { session, ordered: true }
  );
  await DesignSectionRevisionModel.insertMany(
    input.sections.map(({ revision }) => sectionRevisionForMongo(revision)),
    { session, ordered: true }
  );
}
```

Keep `validateExtractionDraft(input)` before deletion/insertion and keep all inserts inside the current session.

- [ ] **Step 5: Implement ordered bounded estimate bulk inserts**

Replace the three completion `create` calls with:

```ts
if (pageDocuments.length > 0) {
  await EstimateDesignSourcePageModel.insertMany(pageDocuments, {
    session,
    ordered: true
  });
}
if (drawingDocuments.length > 0) {
  await EstimateDesignDrawingModel.insertMany(drawingDocuments, {
    session,
    ordered: true
  });
}
if (revisionDocuments.length > 0) {
  await EstimateDesignRevisionModel.insertMany(revisionDocuments, {
    session,
    ordered: true
  });
}
```

In `completeQueuedReplacement`, replace the single-record `EstimateDesignSourcePageModel.create` and `EstimateDesignRevisionModel.create` calls with `insertMany([document], { session, ordered: true })`. Keep the guarded update of the existing drawing and all replacement lineage fields unchanged.

Do not move storage writes into the Mongo transaction and do not add artifact reconciliation in this task.

- [ ] **Step 6: Prove the real multi-page transaction shape**

Expand `backend/tests/extraction-completion.replica-set.test.ts` with a two-page project result containing one page-backed section on each page and a two-page estimate result containing one page-backed proposal on each page. Seed the estimate with one unique Bedroom 1 / TV unit item: assert the TV drawing is `auto_mapped`, an unmatched second title is all-null `misc`, and both remain independent from verification. For both kinds assert exactly two source pages, two drawings/sections, and two revisions, with each revision reusing its page reference.

Repeat same-result replay and concurrent completion against those bodies and assert counts stay at 2/2/2. Enable MongoDB test commands on the managed replica-set member in `tests/helpers/mongo-replica-set.ts`. For the rollback case, configure the real server's `failCommand` failpoint with `mode: { times: 1 }`, non-transient `errorCode: 121`, `failCommands: ["insert"]`, and the exact second collection namespace (`designsections` for project or `estimatedesigndrawings` for estimate). The page `insertMany` therefore succeeds and the next real insert fails. Disable the failpoint in `finally`, assert the response fails, then query all three real collections and the job: the transaction must leave them empty/uncompleted. Run the case for both job kinds. Do not mock sessions, model methods, or transaction callbacks.

- [ ] **Step 7: Run backend tests and commit**

Run:

```bash
cd backend
npm test -- --run tests/mongo-repository.test.ts tests/extraction-worker.test.ts tests/estimate-design-extraction.test.ts
npm run test:replica-set -- --run tests/extraction-completion.replica-set.test.ts
npm run typecheck
```

Expected: PASS.

```bash
git add backend/src/repositories/mongo.ts backend/src/services/estimate-design.service.ts backend/tests/mongo-repository.test.ts backend/tests/estimate-design-extraction.test.ts backend/tests/extraction-completion.replica-set.test.ts backend/tests/helpers/mongo-replica-set.ts
git commit -m "perf: bulk-write bounded extraction completions"
```

---

### Task 7: Document the contract and run release verification for this scope

**Files:**
- Modify: `backend/README.md`
- Modify: `ocr-worker/README.md`

**Interfaces:**
- Documents the backend as the sole runtime authority for extraction limits.
- Documents `sourceSizeBytes`, the exact `limits` object, streamed size verification, variable page counts, and `imageSource: "page"`.
- Documents exactly one full-page drawing per new-worker estimate page, including the explicit unidentified/Misc fallback, while stating that all-`imageBase64` multi-section estimate pages remain accepted only for staged legacy compatibility.
- This task verifies only the bounded-extraction scope. It is not the production release gate; the later storage/observability plan owns the complete backend/frontend/worker builds, mapping migration dry run, reconciliation, model/deployment-image smoke, and end-to-end upload gate.

- [ ] **Step 1: Update backend documentation with the exact defaults**

Add this table to `backend/README.md`:

```markdown
| Claim limit | Default |
| --- | ---: |
| `maxSourceBytes` | `26214400` |
| `maxPages` | `50` |
| `maxPagePixels` | `40000000` |
| `maxTextWordsPerPage` | `20000` |
| `maxSectionsPerPage` | `500` |
| `maxDrawingsPerJob` | `500` |
| `maxDecodedImageBytes` | `26214400` |
| `maxOutputBytes` | `41943040` |
| `maxCompletionBodyBytes` | `67108864` |
| `maxProcessingSeconds` | `900` |
```

State that every claim includes `sourceSizeBytes` and this limits object, and the completion parser uses the same `maxCompletionBodyBytes`.

- [ ] **Step 2: Update worker documentation**

Replace the worker-owned extraction-limit environment section with:

```markdown
Extraction bounds are authoritative backend claim data. The worker validates
`sourceSizeBytes` before opening the source URL, streams the response through a
running byte counter, and rejects a mismatch with the claimed size. A PDF may
contain one through `maxPages` pages. Private release verification derives the
approved first-six-page golden subset from the supplied 34-page source at
runtime and also exercises all 34 pages; neither private input is committed.

Full-page title-cell drawings send `imageSource: "page"` so the page PNG is not
duplicated in worker memory, completion JSON, generated storage, or revision
storage. Every new-worker estimate page produces exactly one such full-page
drawing. If its embedded/title-band OCR has no unique title, it produces one
`Unidentified drawing — page <n>` proposal that remains Misc; it never falls
through to multiple regional crops. During backend-first rollout, the backend
continues to accept zero through the configured maximum all-`imageBase64`
sections from the prior worker, but rejects mixed or multiple page-backed
estimate sections.
```

Keep network/poll/confidence environment documentation. Remove only the obsolete worker-owned `OCR_MAX_PDF_PAGES`, `OCR_MAX_PAGE_PIXELS`, `OCR_MAX_OUTPUT_BYTES`, and `OCR_MAX_PROCESSING_SECONDS` entries.

- [ ] **Step 3: Run the full non-model worker suite**

Run:

```bash
cd ocr-worker
.venv/bin/python -m pytest -m "not model and not private_fixture"
```

Expected: PASS.

- [ ] **Step 4: Run the required private PDF release regressions**

Run:

```bash
: "${OCR_PRIVATE_ESTIMATE_PDF:?Set OCR_PRIVATE_ESTIMATE_PDF to the supplied 34-page PDF}"
case "$OCR_PRIVATE_ESTIMATE_PDF" in /*) ;; *) echo "OCR_PRIVATE_ESTIMATE_PDF must be absolute" >&2; exit 1;; esac
test -f "$OCR_PRIVATE_ESTIMATE_PDF"
cd ocr-worker
.venv/bin/python -m pytest -m private_fixture tests/test_extractor.py -q
```

Expected: PASS for the approved first six titles and all 34 pages/titles, with exactly one full-page section per source page. Combined with the backend 34-page completion test, the evidence is exactly 34 pages, 34 drawings, and 34 revisions. A missing environment value or file stops release verification before pytest.

- [ ] **Step 5: Run the complete backend suite, typecheck, and build**

Run:

```bash
cd backend
npm test -- --run
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 6: Verify the private source identity and source hygiene**

Run:

```bash
: "${OCR_PRIVATE_ESTIMATE_PDF:?Set OCR_PRIVATE_ESTIMATE_PDF to the supplied 34-page PDF}"
case "$OCR_PRIVATE_ESTIMATE_PDF" in /*) ;; *) echo "OCR_PRIVATE_ESTIMATE_PDF must be absolute" >&2; exit 1;; esac
shasum -a 256 "$OCR_PRIVATE_ESTIMATE_PDF"
git diff --check
git status --short
```

Expected SHA-256:

```text
f4e96363f04c89d32bf90fefdbcd23deba1737d1bea789a73da857236c926660
```

Expected: `git diff --check` exits 0; status does not contain the private PDF or a derived six-page PDF and otherwise contains only the files intentionally changed by Tasks 1–7 and any pre-existing user changes.

- [ ] **Step 7: Commit documentation**

```bash
git add backend/README.md ocr-worker/README.md
git commit -m "docs: describe bounded variable-page extraction"
```
