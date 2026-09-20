import "./knowledge-quality.css";
import { useRef } from "react";
import { Checkbox, Field, Input, Textarea } from "../../components/ui/Field";
import { qualityFrequencyPresentation } from "./knowledgeQualityPresentation";
import type { QualityControlOptionCatalog } from "./knowledgeQuality";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

const text = (value: KnowledgeJsonValue | undefined) => typeof value === "string" ? value : "";
const object = (value: KnowledgeJsonValue | undefined): KnowledgeJsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as KnowledgeJsonObject : {};

export function KnowledgeQualityInspectionFields({ prefix, value, disabled, qualityOptions, onChange }: {
  readonly prefix: string;
  readonly value: KnowledgeJsonObject;
  readonly disabled: boolean;
  readonly qualityOptions?: QualityControlOptionCatalog;
  readonly onChange: (value: KnowledgeJsonObject) => void;
}) {
  const evidence = object(value.evidence);
  const photoCount = typeof evidence.minPhotosPerSample === "number" ? evidence.minPhotosPerSample : null;
  const validCount = photoCount !== null && Number.isInteger(photoCount) && photoCount >= 1 && photoCount <= 100;
  const scope = qualityFrequencyPresentation(value.sampling, qualityOptions).scopeLabel;
  const lastPhotoCount = useRef(validCount ? photoCount : 1);
  function setPhotos(photos: boolean) {
    if (validCount) lastPhotoCount.current = photoCount;
    onChange({ ...value, evidence: {
      documents: false, video: false, ...evidence,
      photos, minPhotosPerSample: photos ? lastPhotoCount.current : null
    } });
  }
  return <div className="knowledge-quality-inspection">
    <Field id={`${prefix}-acceptanceCriteria`} label="Acceptance criteria" hint="Describe what a passing result should look like.">
      {(props) => <Textarea {...props} rows={2} maxLength={4000} disabled={disabled} value={text(value.acceptanceCriteria)} onChange={(event) => onChange({ ...value, acceptanceCriteria: event.target.value || null })} />}
    </Field>
    <div>
      <div className="knowledge-quality-flags">
        <label><Checkbox checked={evidence.photos === true} disabled={disabled} aria-describedby={`${prefix}-photo-help`} onChange={(event) => setPhotos(event.target.checked)} /><span>Photo evidence</span></label>
      </div>
      <p id={`${prefix}-photo-help`} className="knowledge-help-text">Require photos for each checked {scope}.</p>
      {evidence.photos === true ? <Field
        id={`${prefix}-photo-count`}
        className="knowledge-quality-photo-count"
        label="Required photos"
        required
        hint={`Minimum per checked ${scope}: 1 for a single photo; 2–100 for multiple photos.`}
        error={!validCount ? "Enter a whole number from 1 to 100." : undefined}
      >
        {(props) => <Input {...props} type="number" min={1} max={100} step={1} disabled={disabled} value={photoCount ?? ""} onChange={(event) => {
          const count = event.target.value === "" ? null : Number(event.target.value);
          if (count !== null && Number.isInteger(count) && count >= 1 && count <= 100) lastPhotoCount.current = count;
          onChange({ ...value, evidence: { ...evidence, minPhotosPerSample: count } });
        }} />}
      </Field> : null}
    </div>
  </div>;
}
