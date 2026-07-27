import type { CropRect, DesignSourcePage } from "../../api/types";
import { ProtectedImage } from "./ProtectedImage";

interface CropEditorProps {
  label: string;
  crop: CropRect;
  page: DesignSourcePage;
  onChange: (crop: CropRect) => void;
}

const coordinates: Array<{ key: keyof CropRect; label: string; min: number }> = [
  { key: "x", label: "Crop x coordinate", min: 0 },
  { key: "y", label: "Crop y coordinate", min: 0 },
  { key: "width", label: "Crop width", min: 1 },
  { key: "height", label: "Crop height", min: 1 }
];

export function CropEditor({ label, crop, page, onChange }: CropEditorProps) {
  return (
    <fieldset className="crop-editor" aria-label={`${label} crop boundaries`}>
      <legend>Crop boundaries</legend>
      <div className="crop-editor__canvas">
        <ProtectedImage source={page.imageUrl} alt={`Source page ${page.pageNumber}`} />
        <span
          className="crop-editor__selection"
          aria-hidden="true"
          style={{
            left: `${crop.x / page.width * 100}%`,
            top: `${crop.y / page.height * 100}%`,
            width: `${crop.width / page.width * 100}%`,
            height: `${crop.height / page.height * 100}%`
          }}
        />
      </div>
      <div className="crop-editor__inputs">
        {coordinates.map(({ key, label: inputLabel, min }) => (
          <label key={key}>
            <span>{inputLabel}</span>
            <input
              aria-label={inputLabel}
              type="number"
              min={min}
              value={crop[key]}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                if (!direction) return;
                event.preventDefault();
                onChange({ ...crop, [key]: Math.max(min, crop[key] + direction) });
              }}
              onChange={(event) =>
                onChange({
                  ...crop,
                  [key]: Math.max(min, Number(event.target.value))
                })
              }
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
