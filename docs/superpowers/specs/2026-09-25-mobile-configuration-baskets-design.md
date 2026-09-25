# Mobile Configuration basket list

## Goal and authority
Continue the approved mobile Configuration redesign below search using the two supplied references. The user authorized autonomous implementation and parallel execution earlier in this session. Preserve the completed header and all existing data and workflows.

## Current evidence
`KnowledgeCatalogWorkspace.tsx` currently groups the paginated item response by main basket, expands every basket, displays full-width item cards and two inline create buttons. `KnowledgeCatalogManagement.tsx` already owns versioned basket editing and deletion-impact/name/reason confirmation. Web cards expose Open item; web basket actions reuse the same typed API. Basket counts in both existing clients describe items on the returned page. Knowledge item contracts have no image field.

## Requirements and acceptance
1. Below search, show compact accordion rows with disclosure, stack icon, basket name, real item count and contextual menu. First basket starts expanded; other baskets start collapsed, and users can open or close each independently.
2. Expanded baskets show horizontal compact cards with decorative interior thumbnail, item name, status/sub-basket or temporary badge, real progress, section completeness and UOM. Preserve priority information in accessible details. Existing bundled imagery is illustrative, never represented as uploaded item photos.
3. Swipe, previous/next controls and actual scroll-position dots navigate overflowing cards. Keep narrow phones, text scaling, and tablets usable; no horizontal page overflow. Empty/loading/error states and global pagination remain supported.
4. Basket three-dot menu uses the reference wording: Edit main line, Add estimation item, Add temporary item, Delete main line. POP/Gypsum etc. are backend baskets; names are presentation, stable basket IDs and versions remain authoritative.
5. Edit reuses the existing editor. Add preselects the exact basket. Delete opens the existing impact/confirmation form and never deletes directly from the menu. Preserve lifecycle/update/create permissions and basket status restrictions.
6. Item three-dot menu retains the frontend Open item action. Card selection opens the existing item workspace.
7. Preserve header/search/filter behavior. No backend, shared API, dependency, lockfile, production data or unrelated project-screen changes.

## Compatibility, state and risks
Reuse user/environment query scope and existing invalidation on saved mutations. Menus are modal overlays anchored to the trigger, bounded by viewport/safe area; dismiss with outside tap, platform Back or close. On iOS dispatch destination only after dismissal. Avoid stale action invocation after scope unmount. Counts are page counts with an accessible qualifier; do not invent full-catalog totals. Refresh and pagination must not strand the user on an empty terminal page after deleting its last item.

## Verification
Focused native interaction tests cover expansion, scroll navigation, permissions, exact stable-ID edit/create/delete wiring and deletion confirmation. Run mobile TypeScript, Configuration/navigation tests, Android export and diff hygiene. Render actual components with synthetic data at reference phone width, narrow phone and tablet. No live deletion or physical-device installation is required or authorized.
