# Shared Main Basket quality checklists

Open an item's **Quality Parameter** tab to manage the checklist for its Main Basket. All Main Lines and temporary items in that basket use the same saved checklist. Another basket has independent checks. Editing an active item can still edit this shared basket resource when the actor has configuration-update permission; it does not edit the active item's revision.

## Essential checks

The app and the Excel template focus on five fields:

1. **Question** — what needs to be checked.
2. **Answer type** — Yes/No, text, number or a choice response.
3. **Options** — only for choice questions.
4. **Acceptance criteria** — what a passing result should look like, including any measurement and unit in plain language.
5. **Photo evidence** — whether site photos are needed and the minimum required count.

Super Admin can add, edit, reorder or remove checks. Choose **Add Quality parameter** for an additional question, or use the question's trash icon to delete it, then **Save shared checklist**. Adding or deleting a question preserves other questions and their photo settings. Every listed check is required and active. There are no Required, Active or Category controls. Extra controls for default answers, numeric bounds/units, inspection stages/methods, roles, severity, failure actions, sampling or document/video evidence are removed from the editor.

Turning on photo evidence shows **Required photos**: enter **1** for a single photo or **2–100** for multiple photos per checked unit. New checks start at one. Blank, fractional or out-of-range counts block saving. Turning photos off removes the requirement; toggling back on during the same edit restores the last valid count. These values specify minimum required evidence, not maximum upload limits. Existing saved photo counts and detailed settings remain intact; editing essential fields does not erase them. Changing an answer type clears incompatible settings, and removing an option clears an obsolete default that used that option.

For example: “Are the electrical fixtures secure and undamaged?”, with a Yes/No answer, acceptance criteria matching the approved fixing detail, and Photo evidence enabled. These configure future inspection requirements; this screen does not collect site photos or inspection answers. No basket is prepopulated.

## Excel and AI workflow

1. Choose **Download Excel template**. Its `Quality Parameters` sheet is blank except for the header row. `Instructions` explains the columns; `Example Electrical` is an illustration and is never automatically imported.
2. Fill the sheet, or ask Claude, Codex or another AI tool to generate a workbook in the same format. Review the AI's questions and criteria against the approved drawings/specifications.
3. Choose **Import Excel**, select an `.xlsx` file, and review the preview. Errors identify worksheet rows and columns where possible.
4. Add the reviewed checks to the local checklist. Existing checks are retained. Choose **Save shared checklist** to save them for the whole basket.

An incomplete existing draft question does not block adding valid Excel checks. The import preview identifies the existing question numbers that need attention; complete or delete those questions before saving. Invalid imported rows, duplicate questions or IDs, and combined checklist limits still block import. Saving continues to validate every question, and import never silently removes existing drafts.

**Download Excel** appears when the Main Basket has a saved checklist containing at least one parameter. It opens with the same five essential columns. Any populated detailed settings from existing records are retained in grouped, hidden columns, including false/zero values; expand the group or unhide columns in Excel to view them. Empty detailed columns are omitted. Unsaved additions, edits and removals are included only after saving. The blank **Download Excel template** remains available even without saved parameters. Users with read access can download without changing configuration. Downloads retain numeric precision, false answers and zero values. Empty defaults remain unanswered. If saved choices contain a literal `|`, or another value cannot fit the Excel format, the download identifies the check and column to review instead of changing the saved value.

The template contains only: `Question`, `Answer type`, `Options`, `Acceptance criteria`, `Photo evidence`. Answer type has a dropdown. Question and Answer type are required; Options is needed only for a choice type. Photo evidence uses a whole-number count: **0** means no photo requirement, **1** means a single photo, and **2–100** means multiple photos per checked unit. A blank cell means no photo requirement. Saved downloads put the count in this same visible column, so a separate photo-count column is unnecessary.

Older Yes/No and true/false photo values remain importable. Yes defaults to one when there is no `Minimum photos per sample` heading; when that heading is present, a Yes row must supply a valid count. For a numeric Photo evidence cell, the inline count is authoritative if the legacy count is blank; if both counts are supplied, they must agree. Required and Active columns are accepted as valid booleans, then normalized to true. An older Category column is accepted but is not imported. Header matching ignores casing and extra whitespace; Excel Options uses `|` as the separator. Existing sampling percentages retain their earlier supported formats.

Limits: 5 MiB compressed workbook, 32 MiB declared expanded archive size, 200 checks per basket, 30 worksheet columns, 256 KiB saved checklist, 240 characters for short fields and 4,000 for instructions/criteria. Imports reject unknown or repeated headers, invalid values, duplicate question-and-stage pairs, formulas including cached results, cell errors, hyperlinks, macros and unsupported embedded content. Workbook parsing happens locally in a cancellable worker; the uploaded workbook is not stored or sent to an AI service. Every imported check receives a fresh stable ID. Parsing has a 20-second timeout. The expansion check uses ZIP metadata and is not a hard memory bound against a forged archive.

## Persistence and compatibility

`GET /admin/ai-estimator-knowledge/baskets/:basketId/quality` reads the current shared checklist; `PUT` accepts `{ expectedVersion, parameters }`. `expectedVersion` is the Main Basket's compare-and-swap version. The response includes Basket ID/name/status, that version, checklist revision ID/number/digest, parameters and saved time. Routes retain the existing configuration-read/update permission boundary and server-side actor checks.

Each save creates an immutable checklist revision, updates the Basket pointer/version and appends an audit event in one Mongo transaction. Stale saves fail without overwriting either copy. The editor keeps local edits visible and requires an explicit reload before retrying against a newer saved version. Saved checklist history is removed only as part of the existing transactional permanent Basket deletion, with the deleted checklist revision count included in the audit event.

Existing item-specific quality sections remain unchanged and are viewable under **Previous item-specific quality parameters**. Until the basket has a shared checklist, the AI context continues to resolve that legacy quality section. Once a shared revision exists, it is authoritative, including an intentionally empty checklist. All checks are projected as required and active into the future AI context with explicit Main Basket/checklist revision lineage and digest. Existing false or missing compatibility flags are treated as true in current shared checklist reads and AI quality projections; original saved snapshots and their digests are retained unchanged. New shared saves persist both flags as true. An invalid or missing pointed-to revision fails resolution instead of falling back silently. Overview displays the same shared checklist when configured, labelled with its basket and checklist version. Current item cards and workspace progress include the effective shared checklist. Persisted item revision completeness and revision history retain their original values.

No database backfill or write migration is required. Current estimates, item modes and calculations are not modified by this configuration workflow.

## Implementation notes

The runtime Excel feature uses [ExcelJS's workbook APIs](https://github.com/exceljs/exceljs#reading-xlsx) in separate lazy-loaded chunks and an ES-module worker. The dependency tree overrides ExcelJS's UUID dependency to 11.1.1; the packaged browser bundle calls UUID v4, outside the provided-buffer v3/v5/v6 paths in the [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). No dependencies were upgraded outside the Excel feature's dependency tree. The repository's existing React Router/nanoid audit findings are unrelated to this change.
