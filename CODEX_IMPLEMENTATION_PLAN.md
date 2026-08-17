# CODEX PROMPT LIBRARY
## Project Lifecycle, Roles, Approvals, Design, Procurement, Finance, Execution & KPI

---

# IMPLEMENTATION STATE

Last updated: 2026-08-17

| Phase | State |
|---|---|
| Prompt 0 — Complete codebase audit | **COMPLETE** |
| Prompt 0 readiness remediation — safety and green-baseline gate | **COMPLETE; GATE CLEARED — 2026-08-17** |
| Prompt 1 — Roles, RBAC and authorization foundation | **DESIGN APPROVED; IMPLEMENTATION NOT STARTED — 2026-08-17** |
| Prompt 2 — Project and estimation lifecycle | **NOT STARTED** |
| Prompt 3 — Design lifecycle | **NOT STARTED** |
| Prompt 4 — Procurement | **NOT STARTED** |
| Prompt 5 — Finance and expenses | **NOT STARTED** |
| Prompt 6 — Execution task generation | **NOT STARTED** |
| Prompt 7 — Worker progress and KPI | **NOT STARTED** |
| Prompt 8 — Super Admin dashboard | **NOT STARTED** |
| Prompt 9 — Full lifecycle integration | **NOT STARTED** |
| Prompt 10 — Final hardening | **NOT STARTED** |

Prompt 0 produced documentation only. No feature, API, frontend, database, migration, or later-phase implementation was performed.

The three Prompt 0 readiness-remediation changes are implemented: shared project-access scope, frontend test API-base isolation, and the restored complete saved-estimate export surface. The separately authorized stabilization then removed timer-backed `user-event` waits from the affected drawing-preview tests, preventing a timed-out typing sequence from continuing across a test boundary. After confirming the diagnostic CPU-load processes were absent, twelve consecutive post-fix runs of the identical hostile-environment frontend full-suite command passed 563/563. The readiness gate is cleared. This work did not start Prompt 1 or change OCR.

Detailed result: [Prompt 0 audit report](./PROMPT_0_AUDIT_REPORT.md)

**Repository ready to begin Prompt 1: YES.** Backend tests/typecheck/build and frontend typecheck/build are green. The affected annotation pair passes 32/32, and twelve consecutive clean-environment runs of `VITE_API_URL=http://hostile.invalid/api/v1 npm test` passed 63/63 files and 563/563 tests. Public-production readiness remains NO.

Prompt 1 design is approved and documented at [Prompt 1 RBAC foundation design](./docs/superpowers/specs/2026-08-17-prompt-1-rbac-foundation-design.md). No Prompt 1 role, permission, API, schema, migration, frontend, or test implementation has been made yet, and Prompt 2 remains not started.

Current generic project access for `estimator_sales` is explicit deny-by-default. Future `estimator_sales` project access may be granted only through the Prompt 2 Admin assignment workflow: an Admin must explicitly assign the project to a named active user selected from a role-filtered `estimator_sales` dropdown. Prompt 1 access requests cannot grant Estimator/Sales project access. Public production release remains blocked on later hardening, including remediation of the unverified client-email claiming risk documented in the Prompt 0 audit.

---

# GLOBAL RULES — APPLY TO EVERY PROMPT

You are modifying an existing production-oriented application.

Before making changes for any prompt:

1. Inspect the current implementation relevant to this prompt.
2. Preserve all functionality completed in previous prompts.
3. Do not rewrite working architecture unnecessarily.
4. Reuse existing models, services, APIs, components, authentication, authorization, OCR, PDF, email and file-storage systems where applicable.
5. Do not create duplicate systems when an equivalent implementation already exists.
6. Follow the project's existing coding conventions.
7. Keep frontend and backend behavior consistent.
8. Backend authorization is mandatory. Do not rely only on frontend route hiding.
9. Make database changes through proper migrations/schema updates.
10. Do not delete or corrupt existing data.
11. Add/update tests for every important business rule.
12. Run relevant tests after implementation.
13. Do not modify unrelated functionality.
14. Do not change the existing estimation calculation logic unless explicitly requested.
15. Do not replace the existing OCR implementation.
16. Do not replace the existing estimation PDF implementation.
17. Do not replace the existing email implementation.

## Completion Rule

At the end of every prompt, report:

```text
IMPLEMENTATION STATUS

Completed:
- ...

Files Changed:
- ...

Database Changes:
- ...

API Changes:
- ...

Frontend Changes:
- ...

Tests Added:
- ...

Tests Executed:
- ...

Tests Passed:
- ...

Tests Failed:
- ...

Known Issues:
- ...

Next Recommended Step:
- ...
```

Do not claim a feature is complete if tests or critical integration are still failing.

---

# PROMPT 0 — COMPLETE CODEBASE AUDIT

## Objective

Perform a complete audit of the existing application before making major architectural changes.

**Do not implement the new business requirements yet.**

The purpose of this prompt is to understand exactly what already exists.

## Inspect

Audit:

### Frontend

- Framework
- Application structure
- Routing
- Authentication
- Role-based routing
- State management
- API services
- Existing project screens
- Estimation screens
- Dashboard
- Components
- Existing task UI
- Existing file upload UI

### Backend

- Framework
- Controllers/routes
- Services
- Middleware
- Authentication
- Authorization
- Role system
- Project APIs
- Estimation APIs
- PDF generation
- Email
- OCR
- File uploads
- Task APIs
- Dashboard APIs

### Database

Identify:

- User model
- Role model
- Project model
- Estimation model
- Estimation item model
- Task model
- Expense model
- Document/file model
- Audit model
- Any existing module models

### Existing workflow

Document the current flow:

```text
Project
→ Estimation
→ PDF
→ Email
→ Approval
```

if already implemented.

### Existing roles

Create a table:

```text
Role
Current Permissions
Frontend Access
Backend Access
```

### Existing estimation

Document:

- How estimation starts
- How estimation continues
- How estimation completion is stored
- How duplicate estimation is prevented, if currently supported
- How PDF is generated
- How email is sent

### Existing OCR

Document:

- Upload flow
- OCR processing
- Storage
- Extracted data
- APIs
- Frontend integration

### Existing task system

Determine whether task assignment/status already exists.

### Existing dashboards

Identify reusable dashboard/chart components.

---

## Critical analysis

Identify:

1. What can be reused.
2. What needs modification.
3. What needs to be newly implemented.
4. Potential architecture conflicts.
5. Potential migration risks.
6. Potential security risks.
7. Potential backward compatibility issues.

---

## Important

Do NOT make major implementation changes in this prompt.

Only make harmless changes if absolutely necessary for inspection/testing.

## Deliverable

Produce a detailed architecture audit and recommended implementation sequence.

End with:

```text
AUDIT COMPLETE

No major feature implementation performed.

Ready for Prompt 1.
```

---

# PROMPT 1 — ROLES, RBAC & AUTHORIZATION FOUNDATION

## Objective

Implement the role and authorization foundation required for the new project lifecycle.

First review the Prompt 0 audit and current implementation.

Do not redo the audit.

## Required logical roles

Support:

```text
Super Admin
Admin
Estimator / Sales
Designer
Procurement
Finance Head
Site Manager
Worker roles
```

Worker roles should support categories such as:

```text
Electrician
Plumber
Carpenter
Painter
Civil Worker
Other Worker
```

Use the existing role architecture.

If worker roles are already dynamically supported, extend that system rather than hard-coding roles.

---

## Permissions

Implement proper permission boundaries.

### Super Admin

Global access.

### Admin

Project initiation, project-level management and client approval on behalf of client.

### Estimator

Existing estimation functionality.

### Designer

Design module.

### Procurement

Procurement module.

### Finance Head

Finance module.

### Site Manager

Execution module.

### Worker

Only assigned execution tasks and own KPI.

---

## Backend authorization

Every protected endpoint must validate appropriate:

```text
Authentication
+
Role
+
Permission
+
Project access
+
Module access
+
Resource ownership
```

Do not rely only on frontend route guards.

---

## Frontend

Update role-based navigation and route protection.

Do not redesign the UI.

Use existing navigation/components.

---

## Security tests

Verify that:

- Worker cannot access Finance.
- Worker cannot access Procurement.
- Worker cannot access another worker's tasks.
- Designer cannot access Finance APIs.
- Procurement cannot access Design approval.
- Finance cannot modify execution tasks.
- Site Manager cannot approve project.
- Estimator cannot approve project.
- Unauthorized API calls return appropriate errors.
- Super Admin has global access.

---

## Completion condition

Do not proceed to project lifecycle implementation until RBAC works at both frontend and backend levels.

End with:

```text
RBAC FOUNDATION COMPLETE
Ready for Prompt 2.
```

---

# PROMPT 2 — PROJECT LIFECYCLE, ESTIMATION & CLIENT PROJECT APPROVAL

## Objective

Implement the project lifecycle and client approval workflow while preserving the existing estimation engine.

## IMPORTANT

Do NOT rewrite the existing estimation calculation logic.

Do NOT replace:

- Estimation APIs
- Estimation calculations
- Existing estimation UI
- PDF generator
- Email system

Extend them safely.

---

# Project lifecycle

Implement/extend project states:

```text
CREATED
ESTIMATION_IN_PROGRESS
ESTIMATION_COMPLETED
ESTIMATION_SENT
AWAITING_CLIENT_APPROVAL
APPROVED
IN_PROGRESS
COMPLETED
```

Use existing status names if equivalent states already exist.

---

# Admin

Admin can:

- Create project.
- Enter client requirements.
- Initiate project.
- View project.
- Send estimation.
- Upload client approval proof.
- Approve project on behalf of client.

---

# Estimation

Existing behavior remains unchanged.

Implement:

```text
No estimation
→ Start Estimation
```

After estimation exists:

```text
Continue Estimation
```

Never show Start Estimation again for the same project if an estimation already exists.

Backend must prevent duplicate estimation creation.

---

# Estimation completion

After completion:

```text
View Estimation
Download Estimation PDF
```

Reuse existing PDF functionality.

---

# Email

Admin should be able to send the existing estimation PDF to client email.

Reuse existing email infrastructure.

---

# Client approval

Client approval happens externally.

Admin must:

1. Upload client approval proof.
2. Review the uploaded proof.
3. Approve project on behalf of client.

Approval proof is mandatory.

Backend must reject:

```text
Approve Project
```

when proof is missing.

Store:

```text
approvalStatus
approvalDocument
approvedBy
approvedAt
approvalRemarks
```

Use existing approval/document/audit infrastructure if available.

---

# Module activation

Before project approval:

```text
Design       LOCKED
Procurement  LOCKED
Finance      LOCKED
Execution    LOCKED
```

After approval:

```text
Design       ACTIVE
Procurement  ACTIVE
Finance      ACTIVE
Execution    ACTIVE
```

Backend must enforce this.

---

# Idempotency

Protect:

- Start estimation
- Project approval

from duplicate operations.

---

# Tests

Test:

- New project shows Start Estimation.
- Existing estimation shows Continue Estimation.
- Duplicate estimation creation is rejected.
- PDF works.
- Email works.
- Approval without proof fails.
- Approval with proof succeeds.
- Modules remain locked before approval.
- Modules activate after approval.
- Unauthorized users cannot approve.

End with:

```text
PROJECT LIFECYCLE COMPLETE
Ready for Prompt 3.
```

---

# PROMPT 3 — DESIGN MODULE, OCR & DESIGN APPROVAL

## Objective

Implement the complete Design Module and separate Design Approval workflow.

The existing OCR functionality must remain unchanged unless extension is necessary.

---

# Design lifecycle

Implement:

```text
Pending
↓
In Progress
↓
Design Plan Uploaded
↓
Ready for Approval
↓
Approved
```

Support:

```text
Revision Required
Rejected
```

where appropriate.

---

# Designer

Designer can:

- View assigned projects.
- Upload design plans.
- Use existing OCR functionality.
- Review extracted information.
- Update design status.
- Mark design ready for client approval.
- Upload client approval proof.
- Approve design on behalf of client.

---

# Design approval

Design Approval is completely separate from Project Approval.

Project Approval:

```text
Overall project approval
```

Design Approval:

```text
Approval of the actual design plan
```

Do not merge the two.

---

# Approval workflow

```text
Designer uploads design
↓
OCR processing
↓
Designer marks Ready for Approval
↓
Client reviews externally
↓
Client provides approval
↓
Designer/Admin uploads approval proof
↓
Designer/Admin approves design
↓
Design becomes APPROVED
```

---

# Approval authorization

Only:

```text
Designer
Admin
```

can approve the design.

Super Admin may have administrative override according to existing architecture.

Other roles cannot approve.

---

# Approval proof

Approval proof is mandatory.

Backend must reject approval without proof.

Store:

```text
designApprovalStatus
approvalProof
approvedBy
approvedAt
approvalRemarks
designVersion
```

---

# Design versioning

Support:

```text
Version 1
↓
Revision Required
↓
Version 2
↓
New Approval
```

If an approved design changes:

- Create a new version.
- New version requires approval.
- Previous approval must not automatically apply.
- New approval proof is mandatory.

---

# Status history

Track:

```text
status
updatedBy
updatedAt
version
```

Reuse existing audit/history architecture.

---

# Execution dependency

A design-dependent execution task must not proceed with an unapproved design.

```text
Project Approved
+
Relevant Design Approved
=
Design-dependent execution allowed
```

---

# Tests

Verify:

- Design upload.
- OCR processing.
- Status transitions.
- Approval proof upload.
- Approval without proof fails.
- Designer can approve.
- Admin can approve.
- Unauthorized roles cannot approve.
- Design revision resets approval.
- New design version requires new proof.
- Previous approval is not reused.

End with:

```text
DESIGN MODULE COMPLETE
Ready for Prompt 4.
```

---

# PROMPT 4 — PROCUREMENT MODULE

## Objective

Implement the Procurement Module using approved estimation data.

Role:

```text
Procurement
```

---

# Procurement workflow

```text
Approved Estimation
↓
Required Materials
↓
Estimated Material Budget
↓
Procurement
↓
Purchase
↓
Bill Upload
```

---

# Procurement features

Procurement user can:

- View required materials.
- View estimated quantity.
- View estimated budget.
- Record purchase.
- Record actual quantity.
- Record actual cost.
- Add supplier.
- Add purchase date.
- Upload bill/invoice.
- Track purchased quantity.
- Track remaining quantity.
- Compare estimated cost vs actual cost.

---

# Data

Use existing models where possible.

Logical data:

```text
Project
Material
Required Quantity
Purchased Quantity
Remaining Quantity
Estimated Cost
Actual Cost
Supplier
Purchase Date
Bill
```

Every purchase must belong to a project.

---

# Budget integrity

Do not modify approved estimation values when recording actual procurement costs.

Maintain separation:

```text
Estimated Cost
vs
Actual Cost
```

---

# Authorization

Procurement role can access only permitted procurement information.

Do not allow Procurement users to modify:

- Project approval
- Design approval
- Finance calculations
- Other modules

unless existing business rules explicitly permit it.

---

# Tests

Test:

- Material requirements come from approved estimation.
- Purchase creation.
- Actual quantity.
- Actual cost.
- Remaining quantity.
- Bill upload.
- Project association.
- Role authorization.

End with:

```text
PROCUREMENT MODULE COMPLETE
Ready for Prompt 5.
```

---

# PROMPT 5 — FINANCE MODULE & DELAY OVERHEAD

## Objective

Implement the Finance Module.

Role:

```text
Finance Head
```

---

# Finance dashboard

Show:

```text
Approved Budget
Project Revenue
Project Expenses
Procurement Expenses
Other Expenses
Delay Overheads
Profit
Net Profit
```

Reuse existing financial models.

Do not duplicate financial data.

---

# Profit

Use:

```text
Profit
=
Project Revenue
-
Total Project Expenses
-
Applicable Overheads
```

---

# Due date

Project must have a due date.

Before due date:

```text
Delay Days = 0
Delay Overhead = 0
```

After due date:

```text
Delay Days
=
Current Date - Due Date
```

If a daily overhead rate is configured:

```text
Delay Overhead
=
Delay Days × Daily Overhead Rate
```

Then:

```text
Net Profit
=
Revenue
-
Expenses
-
Delay Overhead
```

---

# Important rule

Delay overhead must NOT affect profit before the project crosses its due date.

Do not hard-code overhead rates.

Use existing configuration or introduce a configurable value.

---

# Finance permissions

Finance Head can view/manage permitted financial information.

Finance should not modify:

- Estimation calculations
- Design approvals
- Worker task status

unless explicitly allowed by existing business rules.

---

# Tests

Test:

- Budget.
- Revenue.
- Expenses.
- Procurement expenses.
- Profit.
- Due date.
- Before due date = no overhead.
- After due date = overhead.
- Multiple delay days.
- Net profit.
- Financial authorization.

End with:

```text
FINANCE MODULE COMPLETE
Ready for Prompt 6.
```

---

# PROMPT 6 — EXECUTION MODULE & AUTOMATIC TASK GENERATION

## Objective

Implement the Execution Module and automatically generate execution tasks based on estimation data.

Role:

```text
Site Manager
```

---

# Execution workflow

```text
Approved Project
↓
Approved Estimation
↓
Read Estimation Sections
↓
Identify Executable Work
↓
Map Work → Worker Role
↓
Generate Execution Tasks
↓
Assign Workers
↓
Workers Execute
↓
Site Manager Monitors
```

---

# Worker mapping

Example:

```text
Electrical → Electrician
Plumbing → Plumber
Carpentry → Carpenter
Painting → Painter
```

Do not hard-code only these categories if the estimation system supports more.

Create an extensible mapping:

```text
Estimation Category
↓
Execution Category
↓
Worker Role
```

---

# Automatic task generation

Generate tasks based on estimation sections/items.

Each task should reference the source estimation item/section.

This is important for traceability.

---

# Idempotency

Task generation must be idempotent.

If approval/task generation is triggered twice:

```text
No duplicate execution tasks.
```

Use reliable source references/unique constraints where appropriate.

---

# Task fields

Where applicable:

```text
Project
Estimation Item
Execution Category
Task
Worker Role
Assigned Worker
Start Date
Deadline
Status
Priority
Created At
Updated At
Completed At
```

---

# Task status

Minimum:

```text
Pending
In Progress
Completed
```

Reuse existing task status infrastructure.

---

# Site Manager

Site Manager can:

- View all project execution tasks.
- Assign workers.
- Reassign workers where allowed.
- Monitor progress.
- View pending tasks.
- View completed tasks.
- View overdue tasks.
- Record daily site progress.

---

# Daily site progress

Allow Site Manager to record:

```text
Date
Completed Tasks
Pending Tasks
Current Work
Remarks
```

Do not replace individual task status with daily progress.

They should coexist.

---

# Execution dependency

Respect:

```text
Project Approval
+
Design Approval where design-dependent
```

Do not allow execution work that requires an unapproved design.

---

# Tests

Test:

- Task generation.
- Estimation mapping.
- Worker role mapping.
- No duplicate tasks.
- Assignment.
- Deadline.
- Status.
- Site Manager visibility.
- Daily progress.
- Design dependency.

End with:

```text
EXECUTION MODULE COMPLETE
Ready for Prompt 7.
```

---

# PROMPT 7 — WORKER EXPERIENCE & KPI

## Objective

Implement the worker-specific experience and transparent KPI system.

Workers include:

```text
Electrician
Plumber
Carpenter
Painter
Other Worker Roles
```

---

# Worker visibility

Workers must see only their own assigned tasks.

Example:

Electrician:

```text
My Tasks
- Electrical Task 1
- Electrical Task 2
- Electrical Task 3
```

Must NOT see:

```text
Other Workers' Tasks
Finance
Procurement
Design
Other unrelated project data
```

Backend must enforce this.

---

# Worker actions

Worker can:

- View assigned task.
- View task details.
- View deadline.
- Start task.
- Update status.
- Complete task.
- Add completion information where appropriate.
- View own KPI.

---

# KPI

Implement transparent deterministic KPI calculations.

Initial metrics:

```text
Assigned Tasks
Completed Tasks
Pending Tasks
Overdue Tasks
On-Time Completed Tasks
Completion Rate
```

Example:

```text
Completion Rate
=
Completed Tasks / Assigned Tasks × 100
```

Use a clear, explainable calculation.

Do not introduce AI scoring at this stage.

---

# KPI visibility

Worker:

```text
Own KPI
```

Site Manager:

```text
Team KPI
```

Admin:

```text
Permitted project KPI
```

Super Admin:

```text
Global KPI
```

---

# KPI recalculation

KPI should update when task state changes.

Avoid unnecessary expensive recalculation.

Use the architecture appropriate to the existing application.

---

# Tests

Test:

- Worker sees only own tasks.
- Worker cannot access another worker's task through API.
- Status update.
- Completion.
- Completion rate.
- On-time completion.
- Overdue calculation.
- KPI visibility.
- KPI recalculation.

End with:

```text
WORKER + KPI COMPLETE
Ready for Prompt 8.
```

---

# PROMPT 8 — SUPER ADMIN DASHBOARD

## Objective

Implement the Super Admin global dashboard.

Super Admin must have global visibility across all modules.

---

# Project metrics

Show:

```text
Total Projects
Created
Estimation In Progress
Estimation Completed
Awaiting Approval
Approved
Active
Completed
Delayed
```

---

# Module metrics

Show:

```text
Design Progress
Procurement Progress
Finance
Execution Progress
```

---

# Finance metrics

Show:

```text
Total Revenue
Total Approved Budget
Total Expenses
Total Overheads
Total Profit
```

---

# Execution metrics

Show:

```text
Total Tasks
Pending
In Progress
Completed
Overdue
```

---

# Workforce metrics

Show:

```text
Total Workers
Tasks Assigned
Tasks Completed
Average KPI
```

---

# Project drill-down

Super Admin should be able to navigate from global metrics into individual projects and modules according to the existing UI architecture.

---

# Security

Super Admin global access must be enforced server-side.

Do not expose all dashboard data to normal users.

---

# UI

Reuse existing:

- Dashboard components
- Cards
- Tables
- Charts
- Filters
- Design system

Do not introduce unnecessary libraries.

---

# Tests

Test:

- Global project metrics.
- Module metrics.
- Finance aggregation.
- Execution aggregation.
- KPI aggregation.
- Role authorization.
- Project drill-down.

End with:

```text
SUPER ADMIN DASHBOARD COMPLETE
Ready for Prompt 9.
```

---

# PROMPT 9 — COMPLETE MODULE INTEGRATION

## Objective

Now integrate all previously implemented modules into one coherent project lifecycle.

Do not redesign individual modules.

Verify that the complete business flow works end-to-end.

---

# Final lifecycle

Verify:

```text
Admin
↓
Create Project
↓
Estimator
↓
Start Estimation
↓
Continue Estimation if already started
↓
Complete Estimation
↓
Download PDF
↓
Send PDF to Client
↓
Client Approval
↓
Admin Uploads Approval Proof
↓
Admin Approves Project
↓
Four Modules Active
```

---

# Design

Verify:

```text
Designer
↓
Upload Design
↓
OCR
↓
Ready for Approval
↓
Client Approval
↓
Approval Proof
↓
Designer/Admin Approval
↓
Design Approved
```

---

# Procurement

Verify:

```text
Approved Estimation
↓
Material Requirements
↓
Procurement
↓
Purchase
↓
Bill
↓
Actual Cost
```

---

# Finance

Verify:

```text
Approved Budget
↓
Revenue
↓
Expenses
↓
Delay Check
↓
Overhead if overdue
↓
Profit
```

---

# Execution

Verify:

```text
Estimation
↓
Execution Mapping
↓
Automatic Tasks
↓
Worker Assignment
↓
Worker Completion
↓
Site Manager Monitoring
↓
KPI
```

---

# Cross-module dependencies

Verify:

```text
Project Approval
→ Modules Active
```

```text
Design Approval
→ Design-dependent execution allowed
```

```text
Estimation
→ Procurement requirements
```

```text
Estimation
→ Execution tasks
```

```text
Procurement
→ Finance expenses
```

```text
Execution
→ Worker KPI
```

```text
All modules
→ Super Admin
```

---

# Critical consistency checks

Verify:

- Same project ID is used across modules.
- No duplicate project records.
- No duplicate estimation.
- No duplicate execution tasks.
- No orphan procurement records.
- No orphan expenses.
- No orphan execution tasks.
- Approval documents remain linked.
- Design versions remain linked.
- Worker tasks remain linked to project and source estimation.
- KPI uses actual task data.

---

# Final integration testing

Run end-to-end tests.

Create a test project and execute the complete lifecycle.

Record failures and fix them before completion.

End with:

```text
INTEGRATION COMPLETE
Ready for Prompt 10.
```

---

# PROMPT 10 — FINAL QA, SECURITY, REGRESSION & PRODUCTION READINESS

## Objective

Perform the final engineering audit of the entire implementation.

Do not add major new features.

Focus on:

```text
Correctness
Security
Data Integrity
Authorization
Regression
Performance
Maintainability
```

---

# 1. Authentication

Test all roles.

---

# 2. Authorization

Attempt unauthorized operations.

Examples:

```text
Worker → Finance
Worker → Other Worker Task
Estimator → Project Approval
Estimator → Design Approval
Procurement → Finance Modification
Finance → Execution Modification
Site Manager → Project Approval
```

All unauthorized operations must fail.

---

# 3. Approval security

Test:

```text
Project approval without proof → FAIL
Design approval without proof → FAIL
```

Test:

```text
Project already approved → duplicate approval prevented
Design version already approved → duplicate approval prevented
```

---

# 4. Estimation regression

Verify existing estimation functionality completely.

Test:

```text
Start
Continue
Save
Edit
Complete
PDF
Email
```

Confirm calculation behavior was not changed.

---

# 5. OCR regression

Verify existing OCR functionality.

---

# 6. Procurement integrity

Verify:

```text
Estimated Cost ≠ overwritten by Actual Cost
```

Actual procurement costs must remain separate.

---

# 7. Finance integrity

Test:

```text
Before Due Date:
Delay Overhead = 0
```

After due date:

```text
Delay Overhead > 0
```

Validate profit calculations.

---

# 8. Execution integrity

Verify:

```text
No duplicate tasks
Correct worker mapping
Correct assignment
Correct deadlines
Correct statuses
```

---

# 9. Worker isolation

Try manipulating API requests manually.

Verify workers cannot access:

```text
Other Workers' Tasks
Finance
Procurement
Design
Admin Data
Super Admin Data
```

---

# 10. Design approval integrity

Test:

```text
Version 1 Approved
↓
Version 2 Created
↓
Version 2 must require new approval
```

Previous approval must not transfer automatically.

---

# 11. Database integrity

Inspect:

- Foreign keys/references
- Indexes
- Unique constraints
- Nullable fields
- Migration safety
- Orphan records
- Duplicate records

---

# 12. API quality

Check:

- Validation
- Error handling
- Authorization
- Consistent response formats
- HTTP status codes
- Duplicate protection
- Input sanitization

---

# 13. Frontend quality

Check:

- Loading states
- Empty states
- Error states
- Permission states
- Locked modules
- Approval states
- Status bars
- Responsive behavior
- Navigation

---

# 14. Performance

Look for:

- N+1 queries
- Unnecessary API calls
- Large dashboard queries
- Duplicate requests
- Unnecessary frontend rendering
- Expensive KPI calculations

Fix obvious issues without large architectural rewrites.

---

# 15. Final end-to-end test

Run the complete scenario:

```text
Create Project
↓
Start Estimation
↓
Continue Estimation
↓
Complete Estimation
↓
Download PDF
↓
Send Email
↓
Upload Project Approval Proof
↓
Approve Project
↓
Design Upload
↓
OCR
↓
Design Approval Proof
↓
Approve Design
↓
Procurement
↓
Purchase
↓
Bill
↓
Finance
↓
Execution Task Generation
↓
Worker Assignment
↓
Worker Completion
↓
Site Manager Monitoring
↓
KPI
↓
Super Admin Dashboard
```

---

# 16. Final regression

Confirm existing functionality still works.

Especially:

```text
Authentication
Estimation
PDF
Email
OCR
Existing Projects
Existing Users
Existing APIs
```

---

# 17. Final engineering report

Provide:

```text
Architecture Summary
Roles
Permissions
Project Lifecycle
Approval Workflows
Database Changes
API Changes
Frontend Changes
Tests
Security Tests
Regression Tests
Known Issues
Production Risks
Recommended Future Improvements
```

Also explicitly report:

```text
PASS / FAIL
```

for each major module:

```text
RBAC
Project Lifecycle
Estimation
Project Approval
Design
Design Approval
Procurement
Finance
Execution
Worker Tasks
KPI
Super Admin
Integration
Security
Regression
```

Do not declare production-ready if any critical security, authorization, data-integrity or workflow test is failing.

End with:

```text
FINAL IMPLEMENTATION AUDIT COMPLETE
```

---

# END OF PROMPT LIBRARY
## Execution Rule

Run these prompts strictly in order:

```text
Prompt 0
   ↓
Prompt 1
   ↓
Prompt 2
   ↓
Prompt 3
   ↓
Prompt 4
   ↓
Prompt 5
   ↓
Prompt 6
   ↓
Prompt 7
   ↓
Prompt 8
   ↓
Prompt 9
   ↓
Prompt 10
```

After each prompt:

1. Review Codex's implementation report.
2. Check changed files.
3. Run the reported tests.
4. Verify there are no unexpected changes.
5. Only then provide the next prompt.

Never skip directly from Prompt 0 to Prompt 10.

The purpose of this sequence is to maintain a controlled implementation state and prevent Codex from making large uncontrolled changes across unrelated modules.
