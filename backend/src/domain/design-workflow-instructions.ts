import type { DesignStageType } from "./design-workflow.js";

export interface DesignStageInstructions {
  objective: string | null;
  owner: string;
  trigger: string;
  start: string;
  completion: string[];
  sla: {
    enabled: boolean;
    bands: Array<{ label: string; description: string; tone: "success" | "warning" | "danger" | "neutral" }>;
    clockOwner: string | null;
    clockRule: string;
    pauseRule: string;
  };
  dependencies: string[];
  clientExperience: string[];
  clientMessage: string | null;
  managerReminders: string[];
  requirements: string[];
}

const reminderRules = [
  "The Line Manager sees open SLAs.",
  "Remind one day before the activity enters Yellow; after Yellow begins, remind every 3 hours until the activity is complete."
];
const calendarRule = "All days count, including weekends. Each stage receives its full allowance when the preceding stage is complete; day ranges are measured from this stage's start.";
const accessPause = "When the Client reports that site access prevents measurement, the entire workflow clock pauses until access is restored.";

/** The supplied stage rules; initial payment is the single mapping/finance-closure event. */
const instructions: Partial<Record<DesignStageType, DesignStageInstructions>> = {
  internal_kickoff: {
    objective: "The Designer acknowledges receipt of the design flow and project information, including the scope, existing furniture, lights and other important inputs.",
    owner: "Designer",
    trigger: "After estimate approval, Super Admin verifies the receipt and marks Initial payment received. This starts the countdown immediately (the same payment mapping / finance closure event).",
    start: "Immediately after initial-payment confirmation.",
    completion: ["Acknowledge receipt of the design flow and project scope.", "Conduct the internal meeting and record its date.", "Upload the signed scope checklist, then complete and save Internal Kick off."],
    sla: {
      enabled: true,
      bands: [
        { label: "On track", description: "Within 3 days", tone: "success" },
        { label: "Yellow", description: "3 to 4 days", tone: "warning" },
        { label: "Late", description: "4 to 5 days", tone: "warning" },
        { label: "Overdue", description: "Beyond 5 days", tone: "danger" }
      ],
      clockOwner: "Designer · Lisno",
      clockRule: `${calendarRule} This stage has no independent pause.`,
      pauseRule: accessPause
    },
    dependencies: ["Complete and save Internal Kick off to start Client Kick off and its countdown."],
    clientExperience: ["The Client sees the internal-process period; this time belongs to Lisno."],
    clientMessage: "Hi there, thanks for confirming the order. Now we are aligning all internal processes which is roughly a 3 days process and soon you will have designer calendar request.",
    managerReminders: reminderRules,
    requirements: ["The Sales team accepts the common meeting calendar.", "Include any existing furniture, lights and important scope inputs in the handover checklist."]
  },
  client_kickoff: {
    objective: null,
    owner: "Client · Designer coordination",
    trigger: "The Designer completes and saves Internal Kick off.",
    start: "Immediately after Internal Kick off is complete.",
    completion: ["Client reviews the Internal Kick off document and completes Client Kick off after the meeting.", "If no meeting is needed, Designer marks it not necessary with a reason.", "Authorized Sales Manager or Super Admin completing on behalf must review the same document and attach evidence."],
    sla: {
      enabled: true,
      bands: [
        { label: "On track", description: "Within 4 days, or marked not necessary", tone: "success" },
        { label: "Yellow", description: "4 to 5 days", tone: "warning" },
        { label: "Late", description: "5 to 6 days", tone: "warning" },
        { label: "Overdue", description: "Beyond 6 days", tone: "danger" }
      ],
      clockOwner: "Designer, then Client where applicable",
      clockRule: `${calendarRule} After the request is sent, the Designer owns time through day 4. If the Client chooses a meeting beyond day 4, time after day 4 belongs to the Client. The clock stops when kick-off is marked done or not necessary.`,
      pauseRule: accessPause
    },
    dependencies: ["Internal Kick off must be complete first.", "Complete Client Kick off or mark it not necessary to open Key Collection."],
    clientExperience: ["The Client can complete the kick-off task as soon as Internal Kick off is complete; a separate Designer request is not required to close it.", "The first checkpoint records kick-off completion and elapsed time.", "The Client can share preferred availability, such as weekends, when confirming the meeting time."],
    clientMessage: "Congratulations, we have officially kick started.",
    managerReminders: ["The Line Manager sees Project Kick off progress.", ...reminderRules],
    requirements: ["The Designer can send an optional meeting request; the Client then confirms the meeting time.", "The Client verifies the submitted Internal Kick off document and confirms that review before completing the kick-off task."]
  },
  key_collection: {
    objective: null,
    owner: "Automatic · Client and Designer confirmations",
    trigger: "Client Kick off is complete or marked not necessary.",
    start: "After Client Kick off is complete or marked not necessary.",
    completion: ["Client confirms keys handed over.", "Designer confirms keys received; both confirmations are required."],
    sla: { enabled: false, bands: [], clockOwner: null, clockRule: "No SLA or time bands apply to Key Collection.", pauseRule: "No stage SLA applies." },
    dependencies: ["Client Kick off must be complete first.", "Both key handover and receipt are required before On Site Actual Measurement starts."],
    clientExperience: ["Client handover and Designer receipt are recorded separately."],
    clientMessage: null,
    managerReminders: [],
    requirements: ["Notify the Client when the key handover check becomes available."]
  },
  site_measurement: {
    objective: null,
    owner: "Designer · assigned measurement taker",
    trigger: "The Client has handed over the keys and the Designer has confirmed receipt after both kick-off stages are complete.",
    start: "After both key handover and receipt are confirmed.",
    completion: ["Assign a measurement taker from the project’s design team.", "Assigned Designer records measurement completion, uploads the as-built sketch and adds the site photos/videos folder link.", "Client-reported access issues pause the workflow; restore access before completing measurement."],
    sla: {
      enabled: true,
      bands: [
        { label: "On track", description: "Within 6 days", tone: "success" },
        { label: "Yellow", description: "6 to 8 days", tone: "warning" },
        { label: "Late", description: "8 to 9 days", tone: "warning" },
        { label: "Overdue", description: "Beyond 9 days", tone: "danger" }
      ],
      clockOwner: "Designer",
      clockRule: `${calendarRule} The clock continues unless the Client reports that access prevents measurement.`,
      pauseRule: accessPause
    },
    dependencies: ["Internal Kick off, Client Kick off and both key confirmations must be complete first.", "Client site access is required.", "Complete measurement to open Collection of existing furniture dimensions."],
    clientExperience: ["Measurement is ongoing after access is cleared and closes once completed.", "Not taking on-site actual measurements will hamper all technical drawing submissions and halt drawing preparation."],
    clientMessage: "Congratulations, we are on the right path.",
    managerReminders: ["The Line Manager continues to receive measurement SLA reports.", ...reminderRules],
    requirements: ["The measurement taker must belong to the allocated project design team.", "Keep the as-built sketch and the photographs/videos folder together as measurement evidence."]
  },
  existing_furniture_dimensions: {
    objective: null,
    owner: "Client",
    trigger: "On Site Actual Measurement is complete. The Designer identifies the existing furniture dimensions needed; the Client accepts the request.",
    start: "After On Site Actual Measurement is complete.",
    completion: ["Designer declares furniture requirements; Client accepts the scope.", "For affected rooms, Client uploads dimensions or explicitly permits selected rooms to proceed without them.", "Rooms without the required dimensions or permission remain pending."],
    sla: { enabled: false, bands: [], clockOwner: null, clockRule: "No SLA or time bands apply to furniture dimensions.", pauseRule: "Missing dimensions affect the relevant room layouts; they do not create an extra project SLA." },
    dependencies: ["Furniture layouts for affected rooms need the existing furniture dimensions.", "The Client may select rooms to proceed with while dimensions for other rooms are still pending."],
    clientExperience: ["Missing dimensions prevent preparation of the affected room’s furniture layout unless the Client explicitly accepts proceeding without them.", "The Client can select rooms that may proceed before the remaining data is uploaded."],
    clientMessage: null,
    managerReminders: [],
    requirements: ["Identify the affected rooms explicitly so permission to proceed stays limited to the rooms the Client selected."]
  },
  space_planning_tentative_look_feel: {
    objective: "Prepare space planning with tentative look and feel for Client review.",
    owner: "Assigned Designer",
    trigger: "Initial payment, both kick-off stages, both key confirmations and on-site measurement are complete, and site access is available.",
    start: "After initial payment, both kick-offs, both key confirmations and measurement are complete, with site access available.",
    completion: ["Upload the design, finish extraction and review the required drawing mappings.", "Submit at least one active drawing with a current revision for Client review.", "Before submission, Client must accept the furniture scope; submitted rooms need required dimensions or permission to proceed without them.", "Complete the linked space-planning tasks for every floor, with submission prerequisites cleared."],
    sla: {
      enabled: false, bands: [], clockOwner: null,
      clockRule: "This stage has no separate SLA allowance or time bands. Saved task deadlines remain unchanged.",
      pauseRule: "Uploading and submitting designs are blocked while the Client has reported unavailable site access."
    },
    dependencies: ["Initial payment, both kick-offs, key handover and receipt, and actual measurement must be complete.", "The Client must accept the existing-furniture scope. Rooms included in a submission need the required dimensions or the Client’s permission to proceed without them."],
    clientExperience: ["The Client reviews the submitted drawings and can approve them or request changes.", "The Designer updates requested changes and resubmits the drawings for review."],
    clientMessage: null,
    managerReminders: [],
    requirements: ["Upload the space-planning design and wait for extraction to finish.", "Review the extracted drawings and complete their required mappings.", "Include at least one active drawing with a current revision when submitting for Client review."]
  }
};

export function instructionsForStage(type: DesignStageType): DesignStageInstructions | undefined {
  const value = instructions[type];
  return value ? structuredClone(value) : undefined;
}
