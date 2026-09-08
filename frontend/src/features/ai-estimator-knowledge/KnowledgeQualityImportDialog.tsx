import "./knowledge-quality.css";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { qualityImportIssues, qualitySamplingSummary, validateQualityParameters } from "./knowledgeQuality";
import { readQualityWorkbook, type QualityImportResult } from "./knowledgeQualityWorkbook";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

export function KnowledgeQualityImportDialog({ basketName, currentParameters, disabled, onImport, onClose }: {
  readonly basketName: string;
  readonly currentParameters: readonly KnowledgeJsonObject[];
  readonly disabled: boolean;
  readonly onImport: (parameters: readonly KnowledgeJsonObject[]) => void;
  readonly onClose: () => void;
}) {
  const [result, setResult] = useState<QualityImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const reader = useRef<AbortController | null>(null);
  useEffect(() => () => reader.current?.abort(), []);
  const mergeIssues = useMemo(() => result && !result.issues.length
    ? qualityImportIssues(currentParameters, result.parameters) : [], [currentParameters, result]);
  const existingQuestionNumbers = useMemo(() => [...new Set(validateQualityParameters([...currentParameters]).flatMap(issue => {
    const match = /^parameters\.(\d+)(?:\.|$)/u.exec(issue.path);
    return match ? [Number(match[1]) + 1] : [];
  }))].sort((a, b) => a - b), [currentParameters]);
  async function read(file: File | undefined) {
    reader.current?.abort();
    const controller = new AbortController();
    reader.current = controller;
    setResult(null);
    setFileName(file?.name ?? "");
    setFileSize(file ? (file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`) : "");
    if (!file) { setReading(false); return; }
    setReading(true);
    try {
      const next = await readQualityWorkbook(file, controller.signal);
      if (!controller.signal.aborted) setResult(next);
    } catch {
      if (!controller.signal.aborted) setResult({ parameters: [], issues: [{ row: null, message: "The workbook could not be read. Choose the file again." }] });
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  }
  const canImport = Boolean(result?.parameters.length && !result.issues.length && !mergeIssues.length && !reading && !disabled);
  const count = result?.parameters.length ?? 0;
  return <Dialog title="Import quality checks" eyebrow={`Main Basket · ${basketName}`} description="Choose an Excel workbook and review its questions before adding them to the shared checklist." onClose={onClose}>
    <div className="knowledge-quality-import">
      <div className="knowledge-quality-import__body">
        <Field id="quality-workbook" label="Excel workbook" hint="Columns: Question, Answer type, Options, Acceptance criteria and Photo evidence.">
          {(props) => <div className="knowledge-quality-import__upload" data-selected={Boolean(fileName)}>
            <input {...props} ref={fileInput} className="knowledge-quality-import__file-input" tabIndex={-1} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={disabled} onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void read(file);
              event.target.value = "";
            }} />
            <span className="knowledge-quality-import__file-icon" aria-hidden="true"><FileSpreadsheet /></span>
            <div className="knowledge-quality-import__file-copy">
              <strong>{fileName || "Select your quality checklist"}</strong>
              <span>{fileName ? `${fileSize} · Excel workbook` : ".xlsx file · Up to 5 MiB · 200 questions"}</span>
            </div>
            <Button className="knowledge-quality-import__choose" variant="secondary" leadingIcon={<Upload />} disabled={disabled} onClick={() => fileInput.current?.click()}>{fileName ? "Change file" : "Choose Excel file"}</Button>
          </div>}
        </Field>
        {reading ? <InlineMessage tone="info" role="status">Reading and validating {fileName}…</InlineMessage> : null}
        {result?.issues.length ? <div className="knowledge-quality-import__errors" role="alert"><strong>Review your workbook</strong><ul>{result.issues.map((issue, index) => <li key={index}>{issue.row ? `Row ${issue.row}` : "Workbook"}{issue.column ? ` · ${issue.column}` : ""}: {issue.message}</li>)}</ul></div> : null}
        {mergeIssues.length ? <InlineMessage tone="error" role="alert" title="Review these checks"><ul>{mergeIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></InlineMessage> : null}
        {existingQuestionNumbers.length > 0 && count > 0 && !result?.issues.length && !mergeIssues.length && !reading ? <InlineMessage tone="info">
          Existing {existingQuestionNumbers.length === 1 ? "question" : "questions"} {existingQuestionNumbers.join(", ")} {existingQuestionNumbers.length === 1 ? "needs" : "need"} attention. You can add these Excel checks, then complete or delete {existingQuestionNumbers.length === 1 ? "that question" : "those questions"} before saving.
        </InlineMessage> : null}
        {result && !reading && count > 0 ? <section className="knowledge-quality-import__review" aria-label="Checklist preview">
          <div className="knowledge-quality-import__review-heading">
            <h3>Checklist preview</h3>
            <span className="knowledge-quality-import__count">{count} {count === 1 ? "question" : "questions"}</span>
          </div>
          <p role="status">{count} check{count === 1 ? "" : "s"} found. Review the questions and evidence requirements below.</p>
          <ol className="knowledge-quality-import__preview">
            {result.parameters.map((row, index) => <li key={String(row.id)}>
              <div className="knowledge-quality-import__question-heading">
                <span className="knowledge-quality-import__number" aria-hidden="true">{index + 1}</span>
                <strong>{String(row.label)}</strong>
              </div>
              <span className="knowledge-quality-import__answer-type">{String(row.type).replaceAll("_", " ")}{row.stage ? ` · ${row.stage}` : ""}</span>
              <dl>
                {Array.isArray(row.allowedValues) && row.allowedValues.length ? <div><dt>Options</dt><dd>{row.allowedValues.map(String).join(" · ")}</dd></div> : null}
                {row.acceptanceCriteria ? <div><dt>Acceptance criteria</dt><dd>{String(row.acceptanceCriteria)}</dd></div> : null}
                {row.sampling ? <div><dt>Inspection coverage</dt><dd>{qualitySamplingSummary(row)}</dd></div> : null}
                {row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence) ? <div><dt>Evidence</dt><dd>{[
                  (row.evidence as KnowledgeJsonObject).photos ? `${(row.evidence as KnowledgeJsonObject).minPhotosPerSample} ${(row.evidence as KnowledgeJsonObject).minPhotosPerSample === 1 ? "photo" : "photos"} per ${row.sampling ? "sampled" : "checked"} unit` : null,
                  (row.evidence as KnowledgeJsonObject).documents ? "documents / test reports" : null,
                  (row.evidence as KnowledgeJsonObject).video ? "video" : null
                ].filter(Boolean).join(", ") || "None specified"}</dd></div> : null}
              </dl>
            </li>)}
          </ol>
        </section> : null}
      </div>
      <div className="knowledge-quality-import__footer">
        <p>Adds to your draft.<br /> Save the checklist to apply changes.</p>
        <div className="knowledge-quality-import__actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canImport} onClick={() => { if (canImport && result) onImport(result.parameters); }}>Add {count > 0 ? `${count} ${count === 1 ? "check" : "checks"}` : "checks"} to checklist</Button>
        </div>
      </div>
    </div>
  </Dialog>;
}
