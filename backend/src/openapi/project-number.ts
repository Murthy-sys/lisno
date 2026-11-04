/** Live, read-only identity metadata. Never a route key or writable command field. */
export const PROJECT_NUMBER_SCHEMA = {
  type: "string", nullable: true, readOnly: true,
  pattern: "^Lisno[0-9]{6,16}$", example: "Lisno000001",
  description: "Immutable generated Project ID from the linked Lead, assigned on first successful estimate creation. Unassigned and historical records remain null; internal id/projectId values retain their routing and mutation meaning."
};
