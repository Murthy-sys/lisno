# Lead Estimate Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an estimator start an estimate from a lead without blocking follow-ups.

**Architecture:** The lead detail starts an estimate by moving the lead to `estimate_in_progress` and navigating to a protected, lead-scoped estimate route. The new frontend workspace derives its defaults from the lead and keeps scope selection local for this first estimate-entry slice; its clear boundary lets a later persistence/price-calculation module replace only the draft state.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, Vitest, existing Lisno CSS.

## Global Constraints

- Do not reset or modify existing business data.
- Only `estimator_sales` users may access estimate entry.
- Follow-ups remain available independently from estimate configuration.
- Preserve the existing lead API and stage vocabulary.

---

### Task 1: Add a protected estimate-entry route and lead transition

**Files:**
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/features/leads/LeadDetail.tsx`
- Test: `frontend/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `updateLead(leadId, { stage: "estimate_in_progress" })`.
- Produces: `/estimator-sales/leads/:leadId/estimate` route.

- [ ] **Step 1: Write the failing route test**

```tsx
renderApp(["/estimator-sales/leads/lead-1/estimate"]);
expect(await screen.findByRole("heading", { name: /configure estimate/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `npm test -- router.test.tsx`

Expected: FAIL because the lead estimate route does not exist.

- [ ] **Step 3: Implement the route and enabled start action**

```tsx
<Route path="/estimator-sales/leads/:leadId/estimate" element={<ProtectedRoute allowedRoles={["estimator_sales"]}><LeadEstimateWorkspace /></ProtectedRoute>} />
```

Use a mutation in `LeadDetail` that updates the stage, then navigates to the route on success.

- [ ] **Step 4: Re-run the route test**

Run: `npm test -- router.test.tsx`

Expected: PASS.

### Task 2: Build the room and scope configuration workspace

**Files:**
- Create: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- Modify: `frontend/src/styles/index.css`
- Test: `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`

**Interfaces:**
- Consumes: `getLead(leadId)` and `Lead.propertyType`.
- Produces: visible property choices, selectable rooms, room dimensions, and enabled scope sections.

- [ ] **Step 1: Write the failing workspace test**

```tsx
render(<LeadEstimateWorkspace />);
expect(await screen.findByRole("heading", { name: /configure estimate/i })).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: /master bedroom/i }));
expect(screen.getByLabelText(/master bedroom length/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the workspace test to verify it fails**

Run: `npm test -- LeadEstimateWorkspace.test.tsx`

Expected: FAIL because the workspace component is absent.

- [ ] **Step 3: Implement the smallest useful draft configuration UI**

```tsx
const [selectedRooms, setSelectedRooms] = useState<RoomDraft[]>([]);
const [enabledScopes, setEnabledScopes] = useState(() => new Set(defaultScopeIds));
```

Render property chips, room chips, inputs for selected room length/width, scope toggles, and a concise estimate preview/action. Use semantic labels for every control.

- [ ] **Step 4: Re-run the workspace test and typecheck**

Run: `npm test -- LeadEstimateWorkspace.test.tsx && npm run typecheck`

Expected: PASS.

### Task 3: Verify the estimator flow

**Files:**
- Modify: `frontend/src/features/leads/LeadDetail.tsx`
- Test: `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`

**Interfaces:**
- Consumes: lead IDs from route params.
- Produces: a non-disabled Estimate action that does not affect follow-up forms.

- [ ] **Step 1: Add a behavior test for starting an estimate**

```tsx
await user.click(await screen.findByRole("button", { name: /start estimate/i }));
expect(mockUpdateLead).toHaveBeenCalledWith("lead-1", { stage: "estimate_in_progress" });
expect(await screen.findByRole("heading", { name: /configure estimate/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run it to verify the intended transition**

Run: `npm test -- LeadEstimateWorkspace.test.tsx router.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run full frontend verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.
