# Shared Main Basket quality checklists

Open an item's **Quality Parameter** tab to manage the checklist for its Main Basket. Every Main Line and temporary item in that basket uses the same saved checklist. Another basket has independent checks. Editing an active item can edit this shared basket resource when the actor has configuration-update permission; it does not edit the active item's revision.

## Inspecting and editing checks

The **Quality Parameters** table shows the question, stage, response type, a compact Controls summary, acceptance criteria, evidence and status. Controls identifies Severity, Frequency, Performed by and the pass range for Number checks. Stage filters include Material, Pre-Installation, During Installation, Pre-Closure and Final Finish, plus existing custom or unassigned stages. Counts follow the local draft; filtering does not remove checks from a save.

Choose **Add Parameter**, or edit an existing parameter, to open its focused side panel. Edits update the local checklist draft. **Done** closes the panel; **Save shared checklist** persists the checklist for its Main Basket. Saving reveals and focuses the first invalid check, including a check hidden by the current stage filter. Reorder from All Stages so hidden checks are not moved accidentally.

Every new shared revision requires these controls on every retained row:

- **Severity:** Critical, Major or Minor. Critical is a blocking policy that requires PM sign-off when an operational inspection workflow exists. It does not mean a sign-off was sent or completed. Major must be rectified before the next stage. Minor is a non-blocking observation.
- **Frequency:** Per unit, Per room, Per zone, Per batch, Once per project or an available reusable Frequency value.
- **Performed by:** Site, PM, Procurement, Vendor or an available reusable Performed by value. This is a role family or configured responsibility label, not a named user assignment.
- **Pass range:** Number answers require an inclusive Minimum, Maximum and Unit. Other answer types do not store these numeric-only fields.

Rows from older revisions can omit these controls or contain historical free-form responsibility and sampling values that are not reusable catalog references. They remain readable and appear as **Needs completion**, **Legacy responsible role**, or **Legacy custom frequency**. The next save requires the author to choose a built-in or available reusable value for every retained row. Removing an obsolete row is also valid. This does not rewrite the historical revision.

Photo evidence is optional. When enabled, **Required photos** accepts **1–100** and its help text follows the selected frequency scope, such as “2 photos per checked room.” Turning photos off removes the requirement; turning it back on during the same edit restores the last valid count. Evidence settings configure a future inspection; this screen does not collect photos or inspection answers.

Every listed shared check is required and active. Existing default answers, stages, methods, failure actions and detailed evidence remain intact when unrelated fields change. Changing an answer type clears incompatible settings; changing away from Number clears Minimum, Maximum, Unit and an incompatible numeric default.

## Reusable Frequency and Performed by values

The Frequency and Performed by lists combine Lisno's built-in values with reusable values created by a Super Admin. Built-ins stay first in their established order; reusable values follow alphabetically. Anyone who can edit the shared checklist can select an available reusable value. Only a Super Admin with the dedicated create permission sees **Add frequency** and **Add performed-by value**.

The add panel accepts one required Name. Creating the value saves it to the shared catalog immediately and selects it only in the current local checklist draft. **Save shared checklist** is still required to create a checklist revision. If the checklist draft is later discarded or its save fails, the new catalog value remains available for another row or checklist. Cancelled and failed catalog requests do not change the draft. When a duplicate already exists, the panel offers that value for selection rather than creating another one.

Reusable values are append-only in this release: they cannot be renamed, reordered, archived or deleted. A custom Frequency is a named inspection scope or cadence; this configuration does not run a scheduler. If a historical reference cannot be loaded, Lisno shows an unavailable value without displaying its internal identifier and requires a valid replacement before the next checklist save.

## Excel and AI workflow

1. Choose **Download Excel template**. Its `Quality Parameters` sheet is blank except for the header row. `Instructions` explains the columns; `Example Electrical` is guidance and is never imported automatically.
2. Fill the sheet, or ask an AI tool to generate a workbook in the same format. Review all questions, controls and criteria against approved drawings and specifications.
3. Choose **Import Excel**, select an `.xlsx` file and review the preview. Errors identify worksheet rows and columns where possible.
4. Add the reviewed checks to the local checklist. Import does not save or replace existing checks. Complete any rows marked **Needs completion**, then choose **Save shared checklist**.

The visible template and saved-export columns are:

`Question | Answer type | Options | Acceptance criteria | Severity | Minimum | Maximum | Unit | Frequency | Performed by | Photo evidence`

Severity, Frequency and Performed by have dropdown validation. Whenever a workbook contains all eleven canonical headers, including a saved or detailed workbook with additional supported columns, import reports each missing required control against its exact row and column. Number rows likewise report missing Minimum, Maximum and Unit during import. A technical threshold must come from an approved source; the AI prompt tells generators not to invent one. Number pass bounds remain canonical decimals with at most six fractional digits. `Photo evidence` is a whole-number count: **0** or blank means none, **1** means one photo, and **2–100** means multiple photos for each checked frequency scope.

Workbook dropdowns include the loaded built-in and reusable Frequency and Performed by labels. Export writes labels, never catalog identifiers. Import matches a known label to an existing value of the correct kind; an unknown, ambiguous or wrong-kind label is reported for correction and never creates a catalog value. A Super Admin must create a missing value in Lisno before retrying the import. The AI prompt receives the same labels and cannot create catalog entries.

Older five-column workbooks remain importable. Their rows enter the draft with missing controls and must be completed before saving. Existing detailed headings such as `Responsible role`, `Sampling method`, `Sample value` and `Sample unit` also remain importable. If a new canonical control conflicts with a populated legacy column, import reports the conflict instead of selecting one silently.

Saved downloads keep the eleven visible columns. Other populated legacy settings are grouped in hidden columns so the workbook can round-trip without discarding information. Canonical controls are exported as user-facing labels, including Critical, Major and Minor. Custom legacy values remain in their detailed legacy columns and stay visible as legacy values after import. Structurally valid legacy percentage and fixed-count sampling values remain numeric and are not rounded to the six-decimal pass-bound format; their finite JavaScript/Excel numeric precision is retained on export and import. Unsaved additions, edits and removals appear in a download only after saving.

Imports reject unknown or repeated headers, malformed values, conflicting canonical and legacy controls, duplicate question-and-stage pairs, formulas including cached results, cell errors, hyperlinks, macros and unsupported embedded content. Workbook parsing happens locally in a cancellable worker; the workbook is not uploaded or sent to an AI service. Limits remain 5 MiB compressed size, 32 MiB declared expanded archive size, 200 checks, 30 worksheet columns and a 256 KiB saved checklist payload.

## Persistence and compatibility

`GET /admin/ai-estimator-knowledge/baskets/:basketId/quality` reads the current shared checklist; `PUT` accepts `{ expectedVersion, parameters }`. `expectedVersion` is the Main Basket compare-and-swap version. The response includes Basket ID/name/status, version, checklist revision identity, digest, parameters and saved time. Backend authorization and actor checks remain authoritative.

Severity stores `critical`, `major` or `minor`. Performed by stores `site`, `pm`, `procurement` or `vendor` in `responsibleRole`; a reusable custom Performed by value stores its stable `qco_<24 lowercase hex>` reference in the same field. Frequency reuses `sampling`:

| Frequency | Stored sampling |
| --- | --- |
| Per unit | `{ method: "all", unit: "unit" }` |
| Per room | `{ method: "all", unit: "room" }` |
| Per zone | `{ method: "all", unit: "zone" }` |
| Per batch | `{ method: "all", unit: "batch" }` |
| Once per project | `{ method: "fixed_count", value: 1, unit: "project" }` |
| Reusable custom frequency | `{ method: "all", unit: "qco_<24 lowercase hex>" }` |

Each save creates an immutable checklist revision, advances the Basket pointer/version and appends its audit event in one transaction. Stale or invalid saves do not create a revision or overwrite the local draft. Existing item-specific quality sections remain viewable under **Previous item-specific quality parameters**. Existing immutable revisions stay readable without a migration or digest rewrite.

Context consumers receive user-facing catalog names for valid reusable references. A missing or wrong-kind reference becomes an unavailable-value label rather than exposing its internal identifier. This is a derived read view: it does not mutate the stored revision, history or digest.

These controls define policy for a future inspection workflow. They do not create project tasks, snags, notifications, inspection answers, user assignments or sign-off records, and they do not modify estimates or item calculations.
