import { useId, type RefObject } from "react";
import { PropertyTypeDropdown } from "../leads/PropertyTypeDropdown";
import { RoomsMultiSelectDropdown, type RoomOption } from "../leads/RoomsMultiSelectDropdown";
import { RoomDimensionsAccordion, type RoomDimensionItem } from "../leads/RoomDimensionsAccordion";
import { MAX_BEDROOM_COUNT } from "../leads/estimateRoomOptions";
import { propertyTypes } from "../leads/propertyTypes";

export interface EstimateSetupFieldsProps {
  propertyType: string;
  onPropertyTypeChange: (value: string) => void;
  bedroomCountInput: string;
  onBedroomCountChange: (value: string) => void;
  variableBedroomCount: boolean;
  bedroomCountRequired: boolean;
  bedroomCountRef?: RefObject<HTMLInputElement | null>;
  editable: boolean;
  disabled: boolean;
  roomOptions: readonly RoomOption[];
  selectedRoomTypeIds: readonly string[];
  onRoomsChange: (ids: string[]) => void;
  retainedRooms: boolean;
  rooms: readonly RoomDimensionItem[];
  onDimensionChange: (id: string, change: { length?: number | null; width?: number | null }) => void;
  onRemoveRoom: (id: string) => void;
}

/** Shared Sales/Client presentation. The caller owns saved state and permission decisions. */
export function EstimateSetupFields({
  propertyType, onPropertyTypeChange, bedroomCountInput, onBedroomCountChange,
  variableBedroomCount, bedroomCountRequired, bedroomCountRef, editable, disabled,
  roomOptions, selectedRoomTypeIds, onRoomsChange, retainedRooms, rooms,
  onDimensionChange, onRemoveRoom
}: EstimateSetupFieldsProps) {
  const id = useId();
  const bedroomId = `${id}-bedroom-count`;

  return <>
    <section className="estimate-panel estimate-configure-details" aria-labelledby={`${id}-project-details`}>
      <div className="estimate-configure-details__heading"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></svg><h2 id={`${id}-project-details`}>Project details</h2></div>
      <div className={`estimate-configure-details__fields${variableBedroomCount ? " estimate-configure-details__fields--with-bedroom-count" : ""}`}>
        <div className="estimate-configure-details__field" role="group" aria-labelledby={`${id}-property-label`}><span id={`${id}-property-label`}>Property type</span><PropertyTypeDropdown options={propertyTypes} value={propertyType} onChange={onPropertyTypeChange} disabled={disabled} /></div>
        {variableBedroomCount ? <div className="estimate-configure-details__field">
          <label htmlFor={bedroomId}>Number of bedrooms</label>
          <input ref={bedroomCountRef} id={bedroomId} className="estimate-bedroom-count" type="number" inputMode="numeric" min={1} max={MAX_BEDROOM_COUNT} step={1} required={editable} value={bedroomCountInput} disabled={disabled}
            placeholder={editable ? "Enter bedroom count" : "Not specified"}
            aria-invalid={bedroomCountRequired || undefined} aria-describedby={`${bedroomId}-hint${bedroomCountRequired ? ` ${bedroomId}-error` : ""}`}
            onChange={(event) => { if (!disabled) onBedroomCountChange(event.target.value); }} />
          <p id={`${bedroomId}-hint`} className="estimate-bedroom-count__hint">Controls the available bedrooms, balconies and bathrooms.</p>
          {bedroomCountRequired ? <p id={`${bedroomId}-error`} className="estimate-bedroom-count__error">{bedroomCountInput ? `Enter a whole number from 1 to ${MAX_BEDROOM_COUNT}.` : "Enter the number of bedrooms to continue."}</p> : null}
        </div> : null}
        <div className="estimate-configure-details__field" role="group" aria-labelledby={`${id}-rooms-label`}><span id={`${id}-rooms-label`}>Rooms</span><RoomsMultiSelectDropdown options={roomOptions} selected={selectedRoomTypeIds} onChange={onRoomsChange} disabled={disabled} /></div>
      </div>
      {retainedRooms ? <p className="estimate-retained-rooms-note">Previously selected rooms are kept with their dimensions and items. Remove them explicitly if they are no longer needed.</p> : null}
    </section>
    {rooms.length ? <section className="estimate-configure-dimensions" aria-label="Room dimensions"><RoomDimensionsAccordion rooms={rooms} onDimensionChange={onDimensionChange} onRemove={onRemoveRoom} disabled={disabled} /></section> : null}
  </>;
}
