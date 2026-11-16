export const PROJECT_INITIATION_DEFAULTS_ID = "organization";

export interface ProjectInitiationDefaultsRecord {
  projectManagerId: string;
  version: number;
  updatedById: string;
  updatedAt: string;
}

export type ProjectInitiationDefaults =
  | { version: number; status: "ready"; projectManager: { id: string; name: string } }
  | { version: number; status: "unconfigured" | "unavailable"; projectManager: null };

export interface UpdateProjectInitiationDefaults {
  expectedVersion: number;
  projectManagerId: string;
}
