# Estimator/Sales Leads Module

## Goal

Add the first estimator/sales module: a focused lead workspace that captures
prospective clients and their property context before any estimate or delivery
project exists. It must reduce repeated data entry, make the next follow-up
unmissable, and provide the correct hand-off into the later estimate module.

This specification covers leads only. Estimate configuration, document upload,
approval routing, client approval, project creation, and notifications are
separate follow-on modules.

## Role and access

Introduce one internal `estimator_sales` role. An estimator/sales user may:

- create, view, edit, search, and filter their own leads;
- change a lead's pipeline state;
- record a follow-up and set the next action/date;
- start an estimate from a lead once its required lead information is ready.

Designers, design managers, design heads, and clients do not receive lead
workspace access in this module. The future estimate approval workflow will
make an estimate visible to a design manager and assigned designer only after
the estimate module is introduced.

## Lead lifecycle

The lead pipeline, adapted from the supplied reference HTML, is:

1. New lead
2. Contacted
3. Site visit
4. Design meeting
5. Estimate in progress
6. Estimate sent
7. Negotiation
8. Won
9. Lost

The list makes the current stage, latest activity, and next action readable at
a glance. Won and lost are terminal states for the lead workspace; a won lead
does not create a delivery project in this module.

## Lead workspace

The estimator/sales home page contains:

- a compact summary of active, overdue-follow-up, estimate-in-progress, and
  negotiation leads;
- an accessible searchable lead list with stage filters;
- a prominent `New lead` action;
- a visible next action and due date on every lead card/row;
- calm empty, loading, error, and no-results states.

The visual direction follows the existing Lisno portal: navy and violet
surfaces, restrained borders, clear status badges, and compact cards. It takes
the reference HTML's lead context and pipeline usefulness, not its unrelated
procurement, KPI, finance, execution, or inbox modules.

## Create and edit lead

Lead creation uses a short, guided form rather than a large project form.

Required information:

- client name, mobile number, and email;
- project/property name and location;
- property type;
- estimated budget range;
- lead source;
- owner (the creating estimator/sales user by default);
- next action and next-action date.

Optional information includes builder/developer, area, desired handover date,
notes, and other decision makers. Draft form data is preserved locally while
the user is completing it; only a deliberate save creates the lead. Client
identity is not yet converted into a portal project or client account.

## Lead detail

The lead detail page keeps key context in one place:

- client contact actions and property summary;
- current stage and ownership;
- budget, source, timeline, and notes;
- newest-first activity timeline;
- follow-up composer for call, WhatsApp, meeting, or email notes;
- next action/date with an overdue treatment;
- a disabled/empty estimate area that will become the entry point for Module 2.

The `Start estimate` action is available only when client, property, budget,
and next-action details are present. Until the estimate module exists it may
show a clear `Estimate module coming next` state rather than create placeholder
estimate records.

## Data model and boundaries

Introduce a dedicated Lead aggregate rather than overloading the existing
delivery `Project` model. It has a lead ID, owner ID, client/property contact
data, pipeline stage, budget fields, source, optional property context, latest
activity, next action/date, and timestamps. Lead activities are separate,
append-only records linked to a lead.

Future modules attach an Estimate to a Lead. A delivery Project is created only
after the future client approval flow. This prevents prematurely assigning
designers, creating floors/tasks, or exposing unapproved commercial details to
the client portal.

## API and authorization shape

Use a protected, estimator/sales-only API surface:

- `GET /api/v1/leads` — paginated own-lead list with search/stage filters;
- `POST /api/v1/leads` — create a lead;
- `GET /api/v1/leads/:leadId` — lead detail;
- `PATCH /api/v1/leads/:leadId` — edit permitted lead fields and stage;
- `POST /api/v1/leads/:leadId/activities` — append a follow-up/activity.

All ownership checks occur server-side. A user receives only their own leads;
later assignment and manager oversight are intentionally out of scope.

## Error handling and accessibility

- Form validation identifies the individual missing or invalid field.
- Saving failures preserve entered form values and present an alert.
- Stage changes and saved activities announce success without moving focus.
- Search and filters have labels and work by keyboard.
- Stage colors always include text labels.
- Empty states explain the next productive action.

## Testing and verification

Automated coverage must prove:

- only `estimator_sales` users can access lead routes and APIs;
- a lead can be created, listed, searched, filtered, updated, and retrieved;
- a user cannot access or edit another user's lead;
- activities append in newest-first order and update the lead's latest activity;
- required-field and invalid-data errors are field-specific;
- the frontend shows lists, filters, details, activity logging, and error states;
- the role's sidebar/home route is protected and accessible.

Run focused frontend and backend tests, then each application typecheck and
production build before declaring the module complete.
