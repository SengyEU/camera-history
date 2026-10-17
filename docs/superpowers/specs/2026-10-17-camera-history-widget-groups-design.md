# Design — Widget camera groups (multi-camera group widget)

Date: 2026-10-17
Status: Approved (brainstorm)
Scope: Product feature — camera groups + a second, group-based widget with a camera-switcher dropdown.

## 1. Goal

Let a tenant organise its cameras into **named groups** and embed a **single iframe per group** whose dropdown switches between the group's cameras. The existing single-camera widget (`/widget/{tenant}/{cameraId}`) stays unchanged.

Decisions captured in brainstorm:
- **Many-to-many**: a camera can belong to multiple groups.
- **Group is a first-class entity with a slug**; embed is `/group/{tenant}/{slug}`; admin-managed.
- **Switch behaviour**: keep the selected date; if the newly selected camera has no images that day, fall back to its **latest** available date. Theme carries over (with `?theme=` override).
- **Admin**: both a dedicated **Groups** tab (create + assign + embed snippet) **and** group assignment inside the camera editor.

## 2. Data model (migration)

New tables (Drizzle, `packages/db/src/schema.ts`):

`camera_groups`
- `id` uuid PK default random
- `tenant_id` uuid NOT NULL FK → `tenants.id` ON DELETE CASCADE
- `name` text NOT NULL
- `slug` text NOT NULL
- `created_at` timestamptz NOT NULL default now
- **unique index `camera_groups_tenant_slug_unique` on (`tenant_id`, `slug`)**

`camera_group_members`
- `camera_group_id` uuid NOT NULL FK → `camera_groups.id` ON DELETE CASCADE
- `camera_id` uuid NOT NULL FK → `cameras.id` ON DELETE CASCADE
- **PK (`camera_group_id`, `camera_id`)**
- index on (`camera_id`)

Deleting a camera or group cleans up membership via cascade. Deleting a tenant cascades to its groups.

## 3. Repos (`packages/db`)

- `createGroup(tenantId, {name, slug})`, `listGroups(tenantId)`, `getGroup(id)`, `updateGroup(id, patch)`, `deleteGroup(id)`.
- `getGroupBySlug(tenantSlug, groupSlug)` → group + its cameras (`id`, `name`, `theme`) for the public widget; only `enabled` cameras, ordered by `name` asc.
- `setGroupCameras(groupId, cameraIds: string[])` — idempotent replace of the membership set (delete missing, insert new).
- `getCameraGroupIds(cameraId)` (for the camera editor) or expose groups-with-member-ids in `listGroups`.
- `latestImageForCamera(cameraId)` already exists (reused for `/latest`).

## 4. Public API (`packages/api`)

- `GET /api/v1/groups/{tenantSlug}/{groupSlug}` → `{ group: { id, name, slug }, cameras: [{ id, name, theme }] }`. `404` (problem+json) if the group/tenant is missing. Only `enabled` cameras.
- `GET /api/v1/cameras/:id/latest` → `{ date: "YYYY-MM-DD", timestamp } | null` — latest capture date for the fallback. `404` if camera not found.
- `GET /api/v1/cameras/:id/images?date=` — **unchanged** (the widget repeats it per selected camera).

## 5. Widget (`packages/web`)

- Route parsing extended: `/group/{tenant}/{slug}` (existing `/widget/{tenant}/{cameraId}` unchanged).
- Load group once via `getGroup(tenant, slug)` → `{ group, cameras }`; default selection = first camera.
- Header gains a `<select>` listing the group's cameras (label = camera name).
- On switch: **keep the current date**; if `getImages(newCamera, date)` returns empty, call `getCamera(newCamera, ...) latest` and jump to that date; if no images at all, show the empty state.
- Theme resolution mirrors the single widget: `?theme=` override, else the selected camera's `theme`.
- Share modal / deep-link (`?img=`, `?date=`) behave as in the single widget.
- Empty group (no cameras) → friendly empty state.

## 6. Admin UI (`packages/admin`) + admin API

Admin API:
- `GET /api/v1/admin/groups`, `POST /api/v1/admin/groups` `{name, slug}`.
- `GET /api/v1/admin/groups/:id`, `PATCH /api/v1/admin/groups/:id` `{name?, slug?}`, `DELETE /api/v1/admin/groups/:id`.
- `PUT /api/v1/admin/groups/:id/cameras` `{ cameraIds: string[] }` — idempotent membership replace.
- Group list DTO includes member `cameraIds` so the camera editor can render checkboxes without an extra per-camera call.

Admin UI:
- New **Groups** tab: table of groups (name, slug, camera count, **embed snippet with copy**), create/edit (name + auto-slug), delete, and a camera multi-checkbox assignment.
- **Camera editor** additionally shows group checkboxes to add/remove the camera from groups (writes via `PUT /groups/:id/cameras`).
- Embed snippet: `<iframe src="{origin}/group/{tenantSlug}/{groupSlug}" width="…" height="…" frameborder="0" allowfullscreen></iframe>`.

## 7. Embed

A group is embedded with a single iframe pointing at `/group/{tenant}/{slug}`; the dropdown lives inside the widget.

## 8. Testing

- `packages/db`: migration + repo tests — group CRUD, unique (tenant,slug), membership replace idempotence, cascade on camera/group delete, public `getGroupBySlug` returns only enabled cameras ordered by name.
- `packages/api`: admin group routes (create/list/update/delete, `PUT .../cameras`), public `GET /groups/{tenant}/{slug}` (200 + 404), `GET /cameras/:id/latest` (200 + null + 404).
- `packages/web`: group route renders dropdown with all cameras; switching keeps date; empty-date triggers fallback to latest; theme override; empty group state.
- Existing single-widget tests keep passing.
- Gates: `typecheck` / `test` / `lint` / `build` all green.

## 9. Out of scope

- Manual drag-and-drop ordering of cameras in the dropdown (order = name asc).
- Group-level theme/branding overrides.
- Publishing/unpublishing groups (if a group exists, it is embeddable).
- Landing page / deck (separate GTM phase).
