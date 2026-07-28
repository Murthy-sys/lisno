# KPI Measurement

This document describes how KPI scores are currently calculated by the Lisno
backend. It reflects the implementation in `backend/src/domain/kpi.ts`,
`backend/src/services/kpi-enrichment.service.ts`, and
`backend/src/services/kpi.service.ts`.

## 1. Overall KPI score

The KPI contains five components:

| Component | Configured weight |
|---|---:|
| On-time completion | 35% |
| Design quality and approval efficiency | 25% |
| Revision efficiency | 15% |
| Status-update discipline | 15% |
| Workload completion | 10% |

Each available component produces a score from 0 to 100.

```text
Overall KPI =
  sum(component score × effective component weight)
```

A component with no eligible tasks receives `score: null`, not zero. Its
configured weight is redistributed proportionally across the available
components.

Example: if only On-time completion and Workload completion are available,
their effective weights are:

```text
On-time completion: 35 / (35 + 10) = 77.8%
Workload completion: 10 / (35 + 10) = 22.2%
```

The overall score, component scores, and effective weights are rounded to one
decimal place.

## 2. Tasks included in a reporting period

A task is included when either:

- its planned schedule overlaps the requested reporting period; or
- it was completed inside the reporting period.

```text
scheduled overlap =
  plannedStartAt <= periodEnd
  AND currentDeadlineAt >= periodStart

completed in period =
  completedAt >= periodStart
  AND completedAt <= periodEnd
```

The designer dashboard requests the current UTC calendar month by default,
from the first millisecond of the month through the last millisecond of the
month.

The API accepts explicit `from` and `to` ISO timestamps. A period:

- must have `from <= to`;
- cannot exceed 366 days;
- supports at most 1,000 KPI tasks;
- supports at most 5,000 task-event or design-version evidence records.

## 3. Task weighting

Task-level component scores are weighted by planned effort:

```text
task weight = plannedEffort, when plannedEffort > 0
task weight = 1, when plannedEffort is absent, zero, or invalid
```

Therefore, a task estimated at 10 effort units affects the score ten times as
much as a task with a weight of 1.

## 4. On-time completion — 35%

Eligible tasks are:

- completed tasks with a completion timestamp; and
- incomplete tasks that are already overdue.

Tasks that are still open and not overdue are excluded from this component.

### Task score

| Outcome | Score |
|---|---:|
| Completed on/before deadline and was never yellow | 100 |
| Completed on/before deadline but was previously yellow | 90 |
| Completed late by no more than 10% of scheduled duration | 70 |
| Completed late by no more than 25% of scheduled duration | 40 |
| Completed later than 25% of scheduled duration | 0 |
| Still incomplete after deadline | 0 |

```text
scheduled duration = deadline - planned start
lateness ratio = (completion time - deadline) / scheduled duration
```

The component score is the planned-effort-weighted average of eligible task
scores.

## 5. Design quality and approval efficiency — 25%

Design-version evidence is grouped by task. An approved design scores according
to the version number that was approved:

| Approved version | Score |
|---|---:|
| Version 1 | 100 |
| Version 2 | 85 |
| Version 3 | 65 |
| Version 4 | 40 |
| Version 5 or later | 0 |

For tasks without an approval:

- rejected or unapproved work scores 0 only after the task deadline;
- work that has not reached that outcome, or is not overdue, is excluded.

The component score is the planned-effort-weighted average of eligible tasks.

## 6. Revision efficiency — 15%

A task is eligible only when at least one design version has entered a review
state: `in_review`, `approved`, or `rejected`.

The backend derives:

```text
revision count = max(total design versions - 1, 0)
task score = max(0, 100 - max(0, revision count - 1) × 20)
```

Current results are:

| Total design versions | Derived revision count | Score |
|---:|---:|---:|
| 1 | 0 | 100 |
| 2 | 1 | 100 |
| 3 | 2 | 80 |
| 4 | 3 | 60 |
| 5 | 4 | 40 |
| 6 | 5 | 20 |
| 7+ | 6+ | 0 |

The component score is the planned-effort-weighted average of eligible tasks.

## 7. Status-update discipline — 15%

The active part of each task is divided into consecutive two-business-day
windows.

The measurement interval starts at the later of:

- the task's planned start; and
- the reporting-period start.

It ends at the earliest of:

- the current time;
- the reporting-period end; and
- the completion time for a completed task.

Saturday and Sunday are skipped when calculating the end of a two-business-day
window.

A window is timely when it contains at least one qualifying event:

- status changed;
- progress changed; or
- note added.

```text
task score =
  timely two-business-day windows / required windows × 100
```

Tasks with no complete two-business-day window are excluded. The component
score is the planned-effort-weighted average of eligible tasks.

## 8. Workload completion — 10%

All tasks included in the reporting period are eligible.

```text
workload completion =
  completed planned effort / total planned effort × 100
```

The result is capped at 100. Missing planned effort uses the default task
weight of 1.

If the reporting period contains no tasks, this component is unavailable.

## 9. Risk colors

Risk is displayed with KPI task details and aggregates, but it is not one of
the five weighted KPI components.

### Red

- An incomplete task is past its deadline.
- A completed task finished after its deadline.

### Yellow

For an incomplete task that is not overdue, any of these conditions produces
yellow:

- task status is blocked;
- forecast completion is after the deadline;
- deadline is within two calendar days;
- actual progress is behind elapsed schedule;
- schedule buffer is less than 20 percentage points.

```text
elapsed ratio =
  elapsed scheduled time / total scheduled duration

progress ratio = task progress / 100

schedule buffer = progress ratio - elapsed ratio
```

When both elapsed time and progress are positive, forecast completion uses the
observed progress velocity.

### Green

An active task is green when its schedule buffer is at least 20 percentage
points. A completed task is green when it finished on or before its deadline.

### Gray

A task that has not started and does not meet another risk rule is gray.

## 10. Additional dashboard aggregates

These values are displayed alongside KPI but do not change the weighted KPI
score:

### Task counts

```text
total = all tasks in the KPI period
completed = tasks with status completed
active = total - completed
```

### Effort

```text
planned = sum of explicit planned effort
completed = planned effort belonging to completed tasks
remaining = planned - completed
workload percentage = remaining / planned × 100
```

Unlike KPI task weighting, the aggregate effort totals treat missing planned
effort as zero.

### Project progress

```text
project progress =
  completed task count / total project task count × 100
```

Project progress is task-count-based, not planned-effort-weighted.

### Recent activity

The KPI response includes up to five recent task events for tasks in the
reporting period.

## 11. Whose work is measured

- A designer KPI measures tasks owned by that designer.
- A design manager KPI measures tasks owned by designers assigned to that
  manager.
- A design head can view designer KPIs and manager team KPIs.
- Clients cannot access KPI endpoints.

The calculated KPI is separate from manager evaluation history; evaluation
scores do not alter the calculated KPI.

## 12. API endpoints

```text
GET /api/v1/kpis/users/:userId?from=<ISO>&to=<ISO>&limit=<n>&offset=<n>
GET /api/v1/kpis/users/:userId/tasks?from=<ISO>&to=<ISO>&limit=<n>&offset=<n>
```

The first endpoint returns:

- overall score;
- component scores and effective weights;
- aggregate task, risk, effort, project, and activity data;
- a paginated task list with recent events.

The second endpoint returns the paginated KPI task list without recalculating a
different scoring model.
