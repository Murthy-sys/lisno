# Client Email Project Linking and Manager Selection Design

## Goal

Allow clients to create accounts and automatically see every project associated
with their email address. Replace manual client and manager ID entry in the
designer project form with client contact fields and a searchable manager
selector.

The design must preserve project-specific client details, support multiple
projects per client, keep email matching case-insensitive, and retain the
existing multi-floor design upload, OCR crop review, replacement, approval, and
protected preview workflow.

## Decisions

- A project has exactly one accountable manager.
- A designer may select any active design manager.
- Project assignment does not change a designer's reporting manager.
- Explicitly assigned designers may come from different manager teams.
- A client account may own any number of projects.
- Project client details are immutable-at-creation snapshots that are not
  overwritten by later client profile edits.
- Account email addresses are globally unique across all roles.
- A project may exist before its client has created an account.
- Client identity is determined by normalized account email and account role,
  not by email format.

## Email Normalization and Identity

All account and project-linking email operations use one shared normalization
function:

1. Trim leading and trailing whitespace.
2. Lowercase the complete email address.
3. Validate the normalized value as an email address.

The normalized email is used for:

- account uniqueness;
- login lookup;
- client signup;
- project creation lookup;
- unclaimed-project linking;
- database indexes.

Original casing is not significant. `John@gmail.com` and `john@gmail.com`
identify the same account.

The users collection has a unique index on normalized email across clients,
designers, design managers, and design heads. If an email already belongs to an
internal role, it cannot be reused for client signup or as a project's client
email.

## Data Model

### User

Extend the user record with:

- `emailNormalized: string`;
- `mobile: string | null`;
- `address: string | null`.

Existing `email` remains the display/login address. Password hashes remain
private and are never returned by APIs.

### Project

Replace the requirement that every project start with an existing client
account. Store:

- `clientId: string | null`;
- `clientName: string`;
- `clientEmail: string`;
- `clientEmailNormalized: string`;
- `clientMobile: string`;
- `clientAddress: string`.

The contact fields are project-specific snapshots. A client profile update does
not alter historical project data. A project that has been linked through
`clientId` cannot be reassigned merely because an email value changes.

Indexes:

- users: unique `emailNormalized`;
- projects: `clientId`;
- projects: compound index on `clientEmailNormalized` and `clientId` to find
  unclaimed projects efficiently.

## Client Signup and Login

### Signup fields

- name;
- email;
- mobile number;
- address;
- password;
- password confirmation.

All fields are required. Mobile numbers accept international formatting and are
stored as trimmed text rather than forced into a country-specific numeric
format. Password confirmation is validated in the UI and API request schema;
only the password hash is persisted.

### Signup transaction

`POST /api/v1/auth/client-signup` performs:

1. Normalize and validate the email.
2. Reject the request if any user role already owns the email.
3. Hash the password with the existing bcrypt configuration.
4. Create an active user with role `client`.
5. Find all projects where `clientId` is null and
   `clientEmailNormalized` matches.
6. Set those projects' `clientId` to the new user ID.
7. Append audit records for account creation and project linking.
8. Commit all changes atomically.
9. Return the same token/user envelope as login.

The database unique index resolves concurrent signup attempts. Only one request
may create the account; the loser receives a deterministic duplicate-account
response.

Successful signup logs the client in and routes them to the client dashboard.
The dashboard queries by `clientId`, so every linked project appears
immediately.

### Login

The existing login endpoint continues to return a generic invalid-credentials
response. Its lookup uses normalized email and remains case-insensitive.

## Designer Project Creation

### Form fields

The project form contains:

- project name;
- location;
- client name;
- client email;
- client mobile number;
- client address;
- accountable manager;
- assigned designers;
- planned start;
- planned end.

Client ID and manager ID text inputs are removed. Client name, email, mobile,
and address are required.

### Project creation transaction

`POST /api/v1/projects` accepts client contact fields, one `managerId`, assigned
designer IDs, and the existing project fields.

The service:

1. Requires a designer actor.
2. Normalizes the client email.
3. Looks up any existing account with that email.
4. If it is a client account, sets `clientId` immediately.
5. If it is an internal-role account, rejects the request.
6. If no account exists, sets `clientId` to null.
7. Verifies the selected manager is active and has role `design_manager`.
8. Deduplicates assigned designer IDs and includes the initiating designer.
9. Verifies every assigned user is an active designer.
10. Does not require assigned designers to report to the selected manager.
11. Saves the project and audit record atomically.

The old `authorizedClientIds` and same-manager constraints are removed from
project creation. Project access continues to be derived from explicit project
relationships rather than email alone.

## Manager Search

Provide an authenticated, paginated manager search endpoint for designers:

`GET /api/v1/organization/managers?search=<term>&limit=<n>&offset=<n>`

Rules:

- return only active users with role `design_manager`;
- match normalized name or email case-insensitively;
- order deterministically by name and then ID;
- apply a bounded maximum page size;
- return public fields only: ID, name, email, and optional mobile;
- permit any designer to select any returned manager.

The project form uses a single-select searchable combobox. Each option displays
the manager name and email, with mobile when present. The selected name remains
visible while only the manager ID is submitted. Loading, empty, error, keyboard,
focus, and screen-reader states must be supported.

## Authorization

- A client sees a project only when `project.clientId` equals their user ID.
- A designer sees projects where they are explicitly assigned.
- The initiating designer is always assigned.
- The accountable manager sees projects where `project.managerId` equals their
  user ID.
- Design heads retain organization-level oversight.
- Reporting relationships remain unchanged by project assignment.
- Entering or guessing an email never grants project access.
- Inactive managers and inactive assigned designers are rejected server-side.

## Existing Design Asset Workflow

No storage redesign is required. The existing workflow remains authoritative:

- multi-floor project structure;
- image and PDF upload;
- PaddleOCR extraction;
- designer review and crop correction;
- section replacement and revision history;
- client approve/reject controls;
- protected image preview.

Email-linked clients receive the same client project and approved-design access
as clients linked during project creation. Tests must cover this integration.

## Migration

Migration order:

1. Compute normalized emails for existing users.
2. Detect case-insensitive duplicates and fail with a report before creating the
   unique index.
3. Add nullable mobile and address fields to users.
4. Backfill every existing project's client name and email from its linked
   client account. Backfill mobile and address from the account when present;
   otherwise store an empty legacy snapshot value.
5. Retain every existing `clientId`.
6. Make the snapshot fields required for newly created projects.
7. Add the user and project indexes.

The migration never unlinks or reassigns existing projects. Empty legacy mobile
or address snapshots remain valid historical data; the stricter requirement
applies only to new project creation.

The in-memory repository, Mongo repository, Mongoose models, seed data, and API
types must implement the same semantics.

## Errors and Security

- Duplicate account email: conflict response with a signup-safe message.
- Existing internal-role email during project creation: field error on client
  email.
- Invalid or inactive manager: field error on manager selection.
- Invalid or inactive assigned designer: field error on assigned designers.
- Invalid schedule: retain the current project date validation.
- Linking failure: rollback account creation and all project changes.
- Login: preserve the generic invalid email/password response.
- Signup and login endpoints use the existing request-size, validation,
  password-hashing, and JWT-expiry conventions. Add bounded per-IP throttling to
  both authentication endpoints with a generic retry response.
- Audit records contain IDs and normalized operational metadata, never
  passwords or password hashes.

## API Compatibility

The project creation request changes from `clientId` to client snapshot fields.
This is a coordinated backend/frontend change. Project responses expose the
snapshot fields to authorized internal users but continue using the restricted
client project view for clients.

Existing project IDs, URLs, floor/stage/task relationships, design versions,
and section-review APIs remain unchanged.

## Verification

Backend coverage:

- signup success and automatic login;
- password hashing;
- case-insensitive signup, login, and linking;
- global cross-role email uniqueness;
- concurrent duplicate signup;
- one client linked to multiple pre-existing projects;
- project created before signup;
- project created after signup;
- linked projects not reassigned;
- internal-role email rejected during project creation;
- active-manager search, filtering, pagination, and public-field projection;
- any active manager selectable;
- cross-team designers assignable without changing reporting hierarchy;
- inactive users rejected;
- transaction rollback and audit behavior;
- memory/Mongo parity and migration compatibility;
- client, designer, manager, and design-head access control.

Frontend coverage:

- signup validation, errors, successful auto-login, and routing;
- login remains case-insensitive;
- project form has no client-ID or manager-ID text fields;
- manager combobox search, keyboard navigation, empty/loading/error states, and
  single selection;
- client contact field validation;
- submitted payload contains snapshot fields and selected manager ID;
- complete designer-create/client-signup/client-dashboard journey;
- linked client access to approved design sections and protected previews;
- accessibility checks for signup and combobox interactions.

Regression gates:

- all existing backend, frontend, OCR, typecheck, and production-build suites;
- no changes to OCR extraction acceptance or crop behavior;
- no regression in multi-floor and large design-asset collections.

## Out of Scope

- email verification and outbound email delivery;
- password reset;
- social login;
- multiple accountable managers per project;
- changing reporting-manager relationships from project creation;
- CRM-style reusable contact management;
- retroactive synchronization of client profile changes into project snapshots;
- redesigning design asset storage or OCR extraction.
