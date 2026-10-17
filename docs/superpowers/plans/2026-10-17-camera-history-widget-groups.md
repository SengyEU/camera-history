# Widget Camera Groups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tenant group its cameras and embed one iframe per group whose dropdown switches between the group's cameras, keeping the selected date (falling back to the camera's latest date when empty).

**Architecture:** A `camera_groups` entity + `camera_group_members` join table (many-to-many). A public endpoint resolves a group by `tenantSlug/groupSlug` and returns its enabled cameras; the widget fetches images per selected camera and switches client-side. Admin gets a Groups tab plus group checkboxes in the camera editor, both writing through idempotent `PUT /groups/:id/cameras`.

**Tech Stack:** Drizzle ORM (Postgres) + drizzle-kit migrations; Fastify API; React (Vite, vitest) for widget (`packages/web`) and admin (`packages/admin`).

## Global Constraints
- English-only UI copy (no Czech in shipped UI/test assertions; existing benign exceptions `×`, fixture `"Pláž"` stay).
- Admin nav `currentView()` gains a `"groups"` member (currently `"cameras" | "billing"`).
- Gates must stay green: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.
- Slug rule (existing): `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
- Public group returns **only `enabled` cameras, ordered by `name` asc**.
- Widget switch: **keep selected date**; if empty for the new camera, jump to its **latest** date via `GET /api/v1/cameras/:id/latest`.
- Docker compose on this host uses the persistent `docker-compose.override.yml` (postgres→15432); never run bare `docker compose up` expecting host port 5432/8080.

---

### Task 1: Data model — types, schema, migration, Repos (real + fake), db integration test

**Files:**
- Modify: `packages/core/src/types.ts` (append group types)
- Modify: `packages/db/src/schema.ts` (append tables)
- Create: `packages/db/drizzle/0003_*.sql` (via `npm run db:generate`)
- Modify: `packages/db/src/repos.types.ts` (add group methods to `Repos`)
- Modify: `packages/db/src/repos.ts` (real implementations)
- Modify: `packages/db/src/testing/fakeRepos.ts` (in-memory implementations)
- Test: `packages/api/test/integration/db.integration.test.ts` (append group repo cases)

**Interfaces:**
- Produces (used by Tasks 2–5):
  - Core types: `CameraGroup { id; tenantId; name; slug }`, `NewCameraGroup { name; slug }`, `AdminCameraGroup { id; name; slug; cameraIds: string[] }`, `PublicGroupCamera { id; name; theme }`, `PublicGroupWithCameras { group: { id; name; slug }; cameras: PublicGroupCamera[] }`.
  - `Repos` methods:
    - `createGroup(tenantId: string, input: NewCameraGroup): Promise<CameraGroup>`
    - `listGroups(tenantId: string): Promise<AdminCameraGroup[]>`
    - `getGroup(id: string): Promise<CameraGroup | null>`
    - `updateGroup(id: string, patch: { name?: string; slug?: string }): Promise<CameraGroup | null>`
    - `deleteGroup(id: string): Promise<void>`
    - `setGroupCameras(groupId: string, cameraIds: string[]): Promise<void>`
    - `getGroupBySlug(tenantSlug: string, groupSlug: string): Promise<PublicGroupWithCameras | null>`

- [ ] **Step 1: Add group types to `packages/core/src/types.ts`** (append at end of file)

```ts
export interface CameraGroup {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
}

export interface NewCameraGroup {
  name: string;
  slug: string;
}

export interface AdminCameraGroup {
  id: string;
  name: string;
  slug: string;
  cameraIds: string[];
}

export interface PublicGroupCamera {
  id: string;
  name: string;
  theme: string;
}

export interface PublicGroupWithCameras {
  group: { id: string; name: string; slug: string };
  cameras: PublicGroupCamera[];
}
```

- [ ] **Step 2: Add tables to `packages/db/src/schema.ts`** (append at end; import `uniqueIndex` alongside existing drizzle imports)

```ts
export const cameraGroups = pgTable(
  "camera_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("camera_groups_tenant_slug_unique").on(t.tenantId, t.slug)],
);

export const cameraGroupMembers = pgTable(
  "camera_group_members",
  {
    cameraGroupId: uuid("camera_group_id")
      .notNull()
      .references(() => cameraGroups.id, { onDelete: "cascade" }),
    cameraId: uuid("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.cameraGroupId, t.cameraId] }),
    index("camera_group_members_camera_idx").on(t.cameraId),
  ],
);
```
(Import `primaryKey` from `drizzle-orm/pg-core` if not already imported.)

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Expected: a new `packages/db/drizzle/0003_*.sql` creating `camera_groups` and `camera_group_members` with the unique index + PK.

- [ ] **Step 4: Add group methods to `Repos` in `packages/db/src/repos.types.ts`** (import the new core types; append methods inside `interface Repos`)

```ts
  createGroup(tenantId: string, input: NewCameraGroup): Promise<CameraGroup>;
  listGroups(tenantId: string): Promise<AdminCameraGroup[]>;
  getGroup(id: string): Promise<CameraGroup | null>;
  updateGroup(id: string, patch: { name?: string; slug?: string }): Promise<CameraGroup | null>;
  deleteGroup(id: string): Promise<void>;
  setGroupCameras(groupId: string, cameraIds: string[]): Promise<void>;
  getGroupBySlug(tenantSlug: string, groupSlug: string): Promise<PublicGroupWithCameras | null>;
```

- [ ] **Step 5: Implement real repos in `packages/db/src/repos.ts`** (import `inArray` from `drizzle-orm`; import `cameraGroups`, `cameraGroupMembers` from `./schema.js`; import the new core types; add these methods to the returned object)

```ts
    async createGroup(tenantId: string, input: NewCameraGroup): Promise<CameraGroup> {
      const [row] = await db
        .insert(cameraGroups)
        .values({ tenantId, name: input.name, slug: input.slug })
        .returning();
      return row!;
    },
    async listGroups(tenantId: string): Promise<AdminCameraGroup[]> {
      const groups = await db.select().from(cameraGroups).where(eq(cameraGroups.tenantId, tenantId));
      const members = await db
        .select({ groupId: cameraGroupMembers.cameraGroupId, cameraId: cameraGroupMembers.cameraId })
        .from(cameraGroupMembers)
        .innerJoin(cameraGroups, eq(cameraGroups.id, cameraGroupMembers.cameraGroupId))
        .where(eq(cameraGroups.tenantId, tenantId));
      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        cameraIds: members.filter((m) => m.groupId === g.id).map((m) => m.cameraId),
      }));
    },
    async getGroup(id: string) {
      const [row] = await db.select().from(cameraGroups).where(eq(cameraGroups.id, id));
      return row ?? null;
    },
    async updateGroup(id: string, patch: { name?: string; slug?: string }) {
      const [row] = await db.update(cameraGroups).set(patch).where(eq(cameraGroups.id, id)).returning();
      return row ?? null;
    },
    async deleteGroup(id: string) {
      await db.delete(cameraGroups).where(eq(cameraGroups.id, id));
    },
    async setGroupCameras(groupId: string, cameraIds: string[]) {
      const existing = await db
        .select()
        .from(cameraGroupMembers)
        .where(eq(cameraGroupMembers.cameraGroupId, groupId));
      const existingIds = new Set(existing.map((m) => m.cameraId));
      const want = new Set(cameraIds);
      const toDelete = [...existingIds].filter((id) => !want.has(id));
      const toInsert = cameraIds.filter((id) => !existingIds.has(id));
      if (toDelete.length > 0) {
        await db
          .delete(cameraGroupMembers)
          .where(
            and(
              eq(cameraGroupMembers.cameraGroupId, groupId),
              inArray(cameraGroupMembers.cameraId, toDelete),
            ),
          );
      }
      if (toInsert.length > 0) {
        await db
          .insert(cameraGroupMembers)
          .values(toInsert.map((cameraId) => ({ cameraGroupId: groupId, cameraId })));
      }
    },
    async getGroupBySlug(tenantSlug: string, groupSlug: string): Promise<PublicGroupWithCameras | null> {
      const rows = await db
        .select({
          groupId: cameraGroups.id,
          gname: cameraGroups.name,
          gslug: cameraGroups.slug,
          cameraId: cameras.id,
          cname: cameras.name,
          ctheme: cameras.theme,
          cenabled: cameras.enabled,
        })
        .from(cameraGroups)
        .innerJoin(tenants, eq(tenants.id, cameraGroups.tenantId))
        .leftJoin(cameraGroupMembers, eq(cameraGroupMembers.cameraGroupId, cameraGroups.id))
        .leftJoin(cameras, eq(cameras.id, cameraGroupMembers.cameraId))
        .where(and(eq(tenants.slug, tenantSlug), eq(cameraGroups.slug, groupSlug)));
      if (rows.length === 0) return null;
      const group = { id: rows[0]!.groupId, name: rows[0]!.gname, slug: rows[0]!.gslug };
      const cams = rows
        .filter((r) => r.cameraId && r.cenabled)
        .map((r) => ({ id: r.cameraId!, name: r.cname!, theme: r.ctheme! }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { group, cameras: cams };
    },
```

- [ ] **Step 6: Implement in-memory fakes in `packages/db/src/testing/fakeRepos.ts`** (import `CameraGroup`, `NewCameraGroup`, `AdminCameraGroup`, `PublicGroupWithCameras` from `@ch/core`; extend `FakeDb` + state + methods)

Extend `FakeDb` interface and the `db` object:
```ts
export interface FakeDb {
  tenants: Tenant[];
  users: User[];
  cameras: Camera[];
  images: ImageRecord[];
  cameraGroups: CameraGroup[];
  cameraGroupMembers: { cameraGroupId: string; cameraId: string }[];
}
```
```ts
  const db: FakeDb = {
    tenants: seed.tenants ?? [],
    users: seed.users ?? [],
    cameras: seed.cameras ?? [],
    images: seed.images ?? [],
    cameraGroups: seed.cameraGroups ?? [],
    cameraGroupMembers: seed.cameraGroupMembers ?? [],
  };
```
Add these methods to the `repos: Repos` object:
```ts
    async createGroup(tenantId: string, input: NewCameraGroup): Promise<CameraGroup> {
      const group: CameraGroup = { id: randomUUID(), tenantId, name: input.name, slug: input.slug };
      db.cameraGroups.push(group);
      return group;
    },
    async listGroups(tenantId: string): Promise<AdminCameraGroup[]> {
      return db.cameraGroups
        .filter((g) => g.tenantId === tenantId)
        .map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          cameraIds: db.cameraGroupMembers.filter((m) => m.cameraGroupId === g.id).map((m) => m.cameraId),
        }));
    },
    async getGroup(id: string) {
      return db.cameraGroups.find((g) => g.id === id) ?? null;
    },
    async updateGroup(id: string, patch: { name?: string; slug?: string }) {
      const idx = db.cameraGroups.findIndex((g) => g.id === id);
      if (idx === -1) return null;
      const updated: CameraGroup = { ...db.cameraGroups[idx]!, ...patch, id };
      db.cameraGroups[idx] = updated;
      return updated;
    },
    async deleteGroup(id: string) {
      db.cameraGroups = db.cameraGroups.filter((g) => g.id !== id);
      db.cameraGroupMembers = db.cameraGroupMembers.filter((m) => m.cameraGroupId !== id);
    },
    async setGroupCameras(groupId: string, cameraIds: string[]) {
      db.cameraGroupMembers = db.cameraGroupMembers.filter((m) => m.cameraGroupId !== groupId);
      for (const cameraId of cameraIds) db.cameraGroupMembers.push({ cameraGroupId: groupId, cameraId });
    },
    async getGroupBySlug(tenantSlug: string, groupSlug: string): Promise<PublicGroupWithCameras | null> {
      const tenant = db.tenants.find((t) => t.slug === tenantSlug);
      if (!tenant) return null;
      const group = db.cameraGroups.find((g) => g.tenantId === tenant.id && g.slug === groupSlug);
      if (!group) return null;
      const cams = db.cameraGroupMembers
        .filter((m) => m.cameraGroupId === group.id)
        .map((m) => db.cameras.find((c) => c.id === m.cameraId))
        .filter((c): c is Camera => !!c && c.enabled)
        .map((c) => ({ id: c.id, name: c.name, theme: c.theme }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { group: { id: group.id, name: group.name, slug: group.slug }, cameras: cams };
    },
```

- [ ] **Step 7: Append group repo cases to `packages/api/test/integration/db.integration.test.ts`** (inside the existing `describe.skipIf(!RUN)` block)

```ts
  it("creates groups, sets membership idempotently, resolves public group by slug", async () => {
    const cfg = loadConfig(process.env);
    const db = createDb(cfg.databaseUrl);
    const repos = createRepos(db);
    const tenant = await repos.createTenant({ name: "GRP", slug: `grp-${Date.now()}` });
    const a = await repos.createCamera(tenant.id, {
      name: "Alpha", feedType: "static_url", feedUrl: "https://e.com/a.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    const b = await repos.createCamera(tenant.id, {
      name: "Beta", feedType: "static_url", feedUrl: "https://e.com/b.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC", enabled: false,
    });
    const g = await repos.createGroup(tenant.id, { name: "Summit", slug: "summit" });
    await repos.setGroupCameras(g.id, [a.id, b.id]);
    await repos.setGroupCameras(g.id, [a.id]); // idempotent replace → only Alpha remains

    const list = await repos.listGroups(tenant.id);
    expect(list.find((x) => x.id === g.id)?.cameraIds).toEqual([a.id]);

    const pub = await repos.getGroupBySlug(tenant.slug, "summit");
    expect(pub?.group.slug).toBe("summit");
    expect(pub?.cameras.map((c) => c.id)).toEqual([a.id]); // disabled Beta excluded
    expect(await repos.getGroupBySlug(tenant.slug, "nope")).toBeNull();
  });
```

- [ ] **Step 8: Verify — typecheck + fake-repo-backed api tests still compile, integration passes if DB reachable**

Run: `npm run typecheck && npm test`
Expected: all green (integration test skipped unless `RUN_INTEGRATION=1`; run it if a DB is up: `RUN_INTEGRATION=1 DATABASE_URL=postgres://camera:bf16d93362b919ef189d1be5d0ba0f7f97c4fd3e82f72bb5@127.0.0.1:15432/camera_history npx vitest run packages/api/test/integration/db.integration.test.ts` → PASS).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types.ts packages/db/src/schema.ts packages/db/drizzle packages/db/src/repos.types.ts packages/db/src/repos.ts packages/db/src/testing/fakeRepos.ts packages/api/test/integration/db.integration.test.ts
git commit -m "feat(db): camera groups schema, repos and fakes"
```

---

### Task 2: Public API — group resolve + latest date

**Files:**
- Modify: `packages/api/src/routes/public.ts` (append two routes)
- Test: `packages/api/test/public.test.ts` (append cases)

**Interfaces:**
- Consumes: `repos.getGroupBySlug`, `repos.getPublicCamera`, `repos.latestImageForCamera`, `repos.getCameraById` (Task 1).
- Produces (used by Task 4 widget):
  - `GET /api/v1/groups/{tenantSlug}/{groupSlug}` → `{ group: { id, name, slug }, cameras: [{ id, name, theme }] }`; `404` problem+json when missing.
  - `GET /api/v1/cameras/:id/latest` → `{ date: "YYYY-MM-DD", timestamp: string }` or `{ date: null }`; `404` if camera missing.

- [ ] **Step 1: Write failing tests in `packages/api/test/public.test.ts`** (append; follow existing `makeApp` usage in this file)

```ts
  it("returns public group with enabled cameras ordered by name", async () => {
    const { app, repos } = makeApp();
    const t = await repos.createTenant({ name: "T", slug: "t-one" });
    const cam = await repos.createCamera(t.id, {
      name: "Zulu", feedType: "static_url", feedUrl: "https://e.com/z.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC", theme: "dark",
    });
    const off = await repos.createCamera(t.id, {
      name: "Off", feedType: "static_url", feedUrl: "https://e.com/o.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC", enabled: false,
    });
    const g = await repos.createGroup(t.id, { name: "G", slug: "g-one" });
    await repos.setGroupCameras(g.id, [cam.id, off.id]);

    const res = await app.inject({ method: "GET", url: "/api/v1/groups/t-one/g-one" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.group.slug).toBe("g-one");
    expect(body.cameras).toEqual([{ id: cam.id, name: "Zulu", theme: "dark" }]);
  });

  it("404s for unknown public group", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/groups/none/none" });
    expect(res.statusCode).toBe(404);
  });

  it("returns latest capture date, or null when none", async () => {
    const { app, repos } = makeApp();
    const t = await repos.createTenant({ name: "T", slug: "t-latest" });
    const cam = await repos.createCamera(t.id, {
      name: "C", feedType: "static_url", feedUrl: "https://e.com/c.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    await repos.insertImage({
      cameraId: cam.id, timestamp: new Date("2026-10-10T09:00:00Z"),
      storageKey: "org/x/2026-10-10/090000.jpg", sizeBytes: 1,
    });

    const ok = await app.inject({ method: "GET", url: `/api/v1/cameras/${cam.id}/latest` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().date).toBe("2026-10-10");

    const empty = await repos.createCamera(t.id, {
      name: "E", feedType: "static_url", feedUrl: "https://e.com/e.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });
    const none = await app.inject({ method: "GET", url: `/api/v1/cameras/${empty.id}/latest` });
    expect(none.json()).toEqual({ date: null });

    const missing = await app.inject({ method: "GET", url: "/api/v1/cameras/00000000-0000-0000-0000-000000000000/latest" });
    expect(missing.statusCode).toBe(404);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/api/test/public.test.ts`
Expected: FAIL (routes not found → 404 on the 200 cases).

- [ ] **Step 3: Implement routes in `packages/api/src/routes/public.ts`** (append inside `registerPublicRoutes`; `dateRe` already exists)

```ts
  app.get<{ Params: { tenantSlug: string; groupSlug: string } }>(
    "/api/v1/groups/:tenantSlug/:groupSlug",
    async (req, reply) => {
      const data = await repos.getGroupBySlug(req.params.tenantSlug, req.params.groupSlug);
      if (!data) return reply.code(404).type("application/problem+json").send(notFound());
      return data;
    },
  );

  app.get<{ Params: { id: string } }>("/api/v1/cameras/:id/latest", async (req, reply) => {
    const cam = await repos.getPublicCamera(req.params.id);
    if (!cam) return reply.code(404).type("application/problem+json").send(notFound());
    const latest = await repos.latestImageForCamera(req.params.id);
    if (!latest) return { date: null };
    const d = latest.timestamp;
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    return { date, timestamp: d.toISOString() };
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/api/test/public.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/public.ts packages/api/test/public.test.ts
git commit -m "feat(api): public group resolve and latest capture date"
```

---

### Task 3: Admin API — group CRUD + membership

**Files:**
- Modify: `packages/api/src/routes/admin.ts` (append group routes; extend `currentView`-independent handler set)
- Test: `packages/api/test/admin.test.ts` (append cases)

**Interfaces:**
- Consumes: `Repos` group methods (Task 1).
- Produces (used by Task 5 admin UI):
  - `GET /api/v1/admin/groups` → `{ groups: AdminCameraGroup[] }`
  - `POST /api/v1/admin/groups` `{ name, slug }` → `201 { group }` (`400` on missing name/slug or bad slug; `409` if `(tenant,slug)` taken)
  - `GET /api/v1/admin/groups/:id` → `{ group: AdminCameraGroup }` (`404` if missing/not owned)
  - `PATCH /api/v1/admin/groups/:id` `{ name?, slug? }` → `{ group }` (`409` on slug conflict)
  - `DELETE /api/v1/admin/groups/:id` → `204`
  - `PUT /api/v1/admin/groups/:id/cameras` `{ cameraIds: string[] }` → `204` (idempotent replace; `400` if not an array)

- [ ] **Step 1: Write failing tests in `packages/api/test/admin.test.ts`** (append; reuse the file's existing auth helper/`login` pattern — it already logs in and passes cookies to admin routes)

```ts
  it("creates, lists, updates, sets cameras and deletes a group", async () => {
    const { app, repos } = makeApp();
    // register+login via /api/v1/auth/register then reuse the cookie (mirror existing admin tests)
    const reg = await app.inject({
      method: "POST", url: "/api/v1/auth/register",
      payload: { name: "G", slug: "grp-admin", email: "g@x.dev", password: "password1" },
    });
    const cookie = reg.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const tenantId = reg.json().tenantId as string;
    const cam = await repos.createCamera(tenantId, {
      name: "C1", feedType: "static_url", feedUrl: "https://e.com/c.jpg",
      intervalMinutes: 15, activeFrom: "00:00", activeTo: "23:59", timezone: "UTC",
    });

    const created = await app.inject({
      method: "POST", url: "/api/v1/admin/groups", headers: { cookie },
      payload: { name: "Summit", slug: "summit" },
    });
    expect(created.statusCode).toBe(201);
    const gid = created.json().group.id as string;

    const dup = await app.inject({
      method: "POST", url: "/api/v1/admin/groups", headers: { cookie },
      payload: { name: "Dup", slug: "summit" },
    });
    expect(dup.statusCode).toBe(409);

    await app.inject({
      method: "PUT", url: `/api/v1/admin/groups/${gid}/cameras`, headers: { cookie },
      payload: { cameraIds: [cam.id] },
    });
    await app.inject({
      method: "PUT", url: `/api/v1/admin/groups/${gid}/cameras`, headers: { cookie },
      payload: { cameraIds: [cam.id] }, // idempotent
    });

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/groups", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().groups.find((g: { id: string }) => g.id === gid).cameraIds).toEqual([cam.id]);

    const patched = await app.inject({
      method: "PATCH", url: `/api/v1/admin/groups/${gid}`, headers: { cookie },
      payload: { name: "Summit2" },
    });
    expect(patched.json().group.name).toBe("Summit2");

    const del = await app.inject({ method: "DELETE", url: `/api/v1/admin/groups/${gid}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/v1/admin/groups/${gid}`, headers: { cookie } })).statusCode).toBe(404);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/api/test/admin.test.ts`
Expected: FAIL (group routes missing → 404).

- [ ] **Step 3: Implement routes in `packages/api/src/routes/admin.ts`** (append; reuse the existing `pre` preHandler and `VALID_SLUG`-style validation — add `const GROUP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;`)

```ts
  app.get("/api/v1/admin/groups", { preHandler: pre }, async (req) => {
    return { groups: await deps.repos.listGroups(req.user!.tenantId) };
  });

  app.post("/api/v1/admin/groups", { preHandler: pre, config: { rateLimit: RATE_LIMIT } }, async (req, reply) => {
    const body = req.body as { name?: string; slug?: string };
    if (!body.name || !body.slug) throw new HttpError(400, "bad_request", "name and slug are required");
    if (!GROUP_SLUG.test(body.slug)) throw new HttpError(400, "bad_request", "slug must be lowercase alphanumeric with dashes");
    const all = await deps.repos.listGroups(req.user!.tenantId);
    if (all.some((g) => g.slug === body.slug)) throw new HttpError(409, "conflict", "group slug already taken");
    const group = await deps.repos.createGroup(req.user!.tenantId, { name: body.name, slug: body.slug });
    return reply.code(201).send({ group });
  });

  app.get<{ Params: { id: string } }>("/api/v1/admin/groups/:id", { preHandler: pre }, async (req, reply) => {
    const group = await deps.repos.getGroup(req.params.id);
    if (!group || group.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Group not found"));
    }
    const all = await deps.repos.listGroups(req.user!.tenantId);
    return { group: all.find((g) => g.id === group.id)! };
  });

  app.patch<{ Params: { id: string } }>("/api/v1/admin/groups/:id", { preHandler: pre }, async (req, reply) => {
    const group = await deps.repos.getGroup(req.params.id);
    if (!group || group.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Group not found"));
    }
    const body = req.body as { name?: string; slug?: string };
    if (body.slug !== undefined && !GROUP_SLUG.test(body.slug)) {
      throw new HttpError(400, "bad_request", "slug must be lowercase alphanumeric with dashes");
    }
    if (body.slug !== undefined) {
      const all = await deps.repos.listGroups(req.user!.tenantId);
      if (all.some((g) => g.slug === body.slug && g.id !== group.id)) {
        throw new HttpError(409, "conflict", "group slug already taken");
      }
    }
    await deps.repos.updateGroup(group.id, body);
    const all2 = await deps.repos.listGroups(req.user!.tenantId);
    return { group: all2.find((g) => g.id === group.id)! };
  });

  app.delete<{ Params: { id: string } }>("/api/v1/admin/groups/:id", { preHandler: pre }, async (req, reply) => {
    const group = await deps.repos.getGroup(req.params.id);
    if (!group || group.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Group not found"));
    }
    await deps.repos.deleteGroup(group.id);
    return reply.code(204).send();
  });

  app.put<{ Params: { id: string } }>("/api/v1/admin/groups/:id/cameras", { preHandler: pre }, async (req, reply) => {
    const group = await deps.repos.getGroup(req.params.id);
    if (!group || group.tenantId !== req.user!.tenantId) {
      return reply.code(404).type("application/problem+json").send(rfc7807(404, "not_found", "Group not found"));
    }
    const body = req.body as { cameraIds?: unknown };
    if (!Array.isArray(body.cameraIds) || body.cameraIds.some((x) => typeof x !== "string")) {
      throw new HttpError(400, "bad_request", "cameraIds must be an array of camera ids");
    }
    await deps.repos.setGroupCameras(group.id, body.cameraIds as string[]);
    return reply.code(204).send();
  });
```
(Import `rfc7807` from `@ch/core` if not already imported in `admin.ts`; `HttpError`, `pre`, `RATE_LIMIT` already exist in this file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/api/test/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/admin.ts packages/api/test/admin.test.ts
git commit -m "feat(api): admin group CRUD and membership routes"
```

---

### Task 4: Widget — group route, dropdown, keep-date + latest fallback

**Files:**
- Modify: `packages/web/src/api.ts` (append `getGroup`, `getCameraLatest`)
- Modify: `packages/web/src/App.tsx` (route parse + group view + dropdown)
- Modify: `packages/web/src/App.css` (dropdown styling)
- Test: `packages/web/src/test/App.test.tsx` (append cases)

**Interfaces:**
- Consumes: `GET /api/v1/groups/{tenant}/{slug}`, `GET /api/v1/cameras/:id/latest`, existing `getCamera`/`getImages` (Task 2).
- Produces: widget route `/group/{tenant}/{slug}` rendering a camera `<select>`; existing `/widget/{tenant}/{cameraId}` unchanged.

- [ ] **Step 1: Append API helpers to `packages/web/src/api.ts`**

```ts
export interface GroupCamera {
  id: string;
  name: string;
  theme: string;
}

export interface PublicGroup {
  group: { id: string; name: string; slug: string };
  cameras: GroupCamera[];
}

export async function getGroup(tenant: string, slug: string): Promise<PublicGroup> {
  const res = await fetch(`/api/v1/groups/${tenant}/${slug}`);
  if (!res.ok) throw new Error(`group fetch failed: ${res.status}`);
  return (await res.json()) as PublicGroup;
}

export async function getCameraLatest(cameraId: string): Promise<string | null> {
  const res = await fetch(`/api/v1/cameras/${cameraId}/latest`);
  if (!res.ok) throw new Error(`latest fetch failed: ${res.status}`);
  const body = (await res.json()) as { date: string | null };
  return body.date;
}
```

- [ ] **Step 2: Write failing tests in `packages/web/src/test/App.test.tsx`** (append; follow the file's existing fetch-stubbing + `render` pattern)

```tsx
  it("renders group widget with camera dropdown and switches keeping date, falling back to latest", async () => {
    const group = {
      group: { id: "g1", name: "Summit", slug: "summit" },
      cameras: [
        { id: "cam-a", name: "Alpha", theme: "light" },
        { id: "cam-b", name: "Beta", theme: "dark" },
      ],
    };
    const byUrl: Record<string, unknown> = {
      "/api/v1/groups/t/summit": group,
      "/api/v1/cameras/cam-a/images?date=2026-10-10": {
        images: [{ id: "i1", timestamp: "2026-10-10T09:00:00Z", url: "http://x/i1.jpg" }],
      },
      "/api/v1/cameras/cam-b/images?date=2026-10-10": { images: [] }, // empty → triggers fallback
      "/api/v1/cameras/cam-b/latest": { date: "2026-10-09" },
    };
    globalThis.fetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => byUrl[url] ?? { images: [] },
    })) as never;

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);
    expect(await screen.findByText("Alpha")).toBeInTheDocument();

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.options.length).toBe(2);

    await userEvent.selectOptions(select, "cam-b");
    expect(await screen.findByTestId("image-grid")).toBeInTheDocument();
    // fell back to latest date for cam-b
    expect((screen.getByDisplayValue("2026-10-09") as HTMLInputElement).value).toBe("2026-10-09");
  });

  it("shows empty state for a group with no cameras", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ group: { id: "g", name: "Empty", slug: "empty" }, cameras: [] }),
    })) as never;
    window.history.pushState({}, "", "/group/t/empty");
    render(<App />);
    expect(await screen.findByTestId("group-empty")).toBeInTheDocument();
  });
```
(Adjust helper imports — `vi`, `render`, `screen`, `userEvent`, `App` — to whatever the file already imports.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/web/src/test/App.test.tsx`
Expected: FAIL (group route not handled).

- [ ] **Step 4: Implement in `packages/web/src/App.tsx`**

Add route parsing (top of file, next to `parseWidgetPath`):
```ts
function parseGroupPath(path: string): { tenant: string; slug: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "group" && parts.length === 3) return { tenant: parts[1]!, slug: parts[2]! };
  return null;
}
```
In `App()`, compute `const groupRoute = useMemo(() => parseGroupPath(window.location.pathname), []);` and render a group view when `groupRoute` is set (before the widget return). Add state: `group`, `groupId`, `selectedCameraId`. On mount fetch group; on camera/date change fetch images; on empty images for a non-today date fetch latest and `setDate`. Add a `<select data-testid="camera-switcher">` in the header listing `group.cameras` (`value={selectedCameraId}`, `onChange` sets it). Theme resolves from `?theme=` else the selected camera's `theme`. Empty group → `<p data-testid="group-empty">No cameras in this group.</p>`.

Extract the existing header/grid/modal JSX into a reusable `<WidgetBody ... />` used by both the single and group paths to avoid duplication; the group path supplies `cameraId`, `date`, `setDate`, and the switcher.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/web/src/test/App.test.tsx`
Expected: PASS (new + existing single-widget tests).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api.ts packages/web/src/App.tsx packages/web/src/App.css packages/web/src/test/App.test.tsx
git commit -m "feat(web): group widget with camera switcher and latest fallback"
```

---

### Task 5: Admin UI — Groups tab + camera editor assignment + embed snippet

**Files:**
- Modify: `packages/admin/src/api.ts` (append group types + methods)
- Modify: `packages/admin/src/App.tsx` (nav `currentView` + `Groups` view + camera editor checkboxes)
- Modify: `packages/admin/src/App.css` (group styles)
- Test: `packages/admin/src/test/App.test.tsx` (append cases)

**Interfaces:**
- Consumes: admin group API (Task 3).
- Produces: `api.listGroups/createGroup/updateGroup/deleteGroup/setGroupCameras`; `currentView()` includes `"groups"`; embed snippet copy control.

- [ ] **Step 1: Append to `packages/admin/src/api.ts`**

```ts
export interface AdminGroup {
  id: string;
  name: string;
  slug: string;
  cameraIds: string[];
}
```
Add to the `api` object:
```ts
  listGroups: () => json<{ groups: AdminGroup[] }>("/api/v1/admin/groups").then((r) => r.groups),
  createGroup: (input: { name: string; slug: string }) =>
    json<{ group: AdminGroup }>("/api/v1/admin/groups", { method: "POST", body: JSON.stringify(input) }).then((r) => r.group),
  updateGroup: (id: string, patch: { name?: string; slug?: string }) =>
    json<{ group: AdminGroup }>(`/api/v1/admin/groups/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then((r) => r.group),
  deleteGroup: (id: string) => json<undefined>(`/api/v1/admin/groups/${id}`, { method: "DELETE" }),
  setGroupCameras: (id: string, cameraIds: string[]) =>
    json<undefined>(`/api/v1/admin/groups/${id}/cameras`, { method: "PUT", body: JSON.stringify({ cameraIds }) }),
```

- [ ] **Step 2: Write failing tests in `packages/admin/src/test/App.test.tsx`** (append; follow existing login + fetch-stub pattern)

```tsx
  it("creates a group and assigns a camera, showing the embed snippet", async () => {
    // stub login, listCameras (one camera), listGroups (empty → after create one group)
    // click Groups nav, fill name (auto-slug), submit → group row appears with embed iframe src /group/{tenant}/{slug}
    // assert camera checkbox present; toggle → setGroupCameras PUT called with camera id
  });

  it("toggles group membership from the camera editor", async () => {
    // open camera edit modal; assert group checkboxes render; toggle one → setGroupCameras called
  });
```
(Fill with the concrete `globalThis.fetch` stubbing + `userEvent` flow matching the file's existing camera tests; assert `screen.findByText("Summit")`, embed `iframe` `src`, and the PUT payload.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/admin/src/test/App.test.tsx`
Expected: FAIL (no Groups nav / view).

- [ ] **Step 4: Implement in `packages/admin/src/App.tsx`**

- Extend `currentView()` to `"cameras" | "groups" | "billing"` and add a Groups nav button.
- Add a `Groups` view component: lists groups (name, slug, camera count), create form (name → auto-`slugify`, reuse existing `slugify`), edit/delete, per-group camera checkboxes writing `setGroupCameras`, and an **embed snippet** `<iframe src={`${origin}/group/${tenantSlug}/${group.slug}`} …>` with a copy button (`navigator.clipboard.writeText`). Fetch tenant slug from an existing admin endpoint (or add `GET /api/v1/admin/me` if none — prefer reusing the login response / stored tenant slug if available; otherwise read `group` list + a small `GET /api/v1/admin/tenant` if needed).
- In `CameraForm`, load `api.listGroups()` and render group checkboxes; on save, for any group whose membership changed, call `api.setGroupCameras(groupId, nextIds)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/admin/src/test/App.test.tsx`
Expected: PASS (new + existing).

- [ ] **Step 6: Commit**

```bash
git add packages/admin/src/api.ts packages/admin/src/App.tsx packages/admin/src/App.css packages/admin/src/test/App.test.tsx
git commit -m "feat(admin): groups tab, camera group assignment and embed snippet"
```

---

### Task 6: Verification — gates, build, docker smoke, seeded group e2e

**Files:**
- Modify: `scripts/seed-demo.mjs` (optionally create one group so the demo tenant has an embeddable group)
- No new source otherwise.

**Interfaces:**
- Consumes: everything above.
- Produces: green gates + a live group widget on `camera.sengycraft.cz/group/{tenant}/{slug}`.

- [ ] **Step 1: Run full gates**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: all exit 0.

- [ ] **Step 2: Rebuild + restart production containers so the API applies the new migration and bundles**

Run: `docker compose up -d --build api worker`
Expected: api logs show `migrations applied`; api healthy.

- [ ] **Step 3: Seed a group and verify the public group widget end-to-end**

Append to `scripts/seed-demo.mjs` (inside the Alpine Summit loop, after cameras exist) a step that creates group `summit` containing the three Alpine cameras via `PUT /admin/groups/:id/cameras`, then run `node scripts/seed-demo.mjs`.

Verify:
```bash
# public group resolves
curl -s -k https://camera.sengycraft.cz/api/v1/groups/alpine-summit/summit | head -c 300
# widget page loads
curl -s -k -o /dev/null -w "%{http_code}\n" https://camera.sengycraft.cz/group/alpine-summit/summit
# latest endpoint works
curl -s -k https://camera.sengycraft.cz/api/v1/cameras/<id>/latest
```
Expected: group JSON lists 3 cameras; `/group/...` returns 200; latest returns a date.

- [ ] **Step 4: Commit any seed change**

```bash
git add scripts/seed-demo.mjs
git commit -m "feat(demo): seed a demo camera group for the group widget"
```

---

## Self-Review
- **Spec coverage:** schema (T1), repos (T1), public group + latest (T2), admin CRUD + membership (T3), widget dropdown/keep-date/fallback/theme/empty (T4), admin tab + camera editor + embed (T5), testing + gates (T6). All spec sections map to a task.
- **Placeholder scan:** Task 5 test bodies and the tenant-slug source for the embed snippet are the only soft spots — Task 5 Step 4 tells the implementer to reuse an existing tenant-slug source or add a minimal `GET /admin/tenant`. Acceptable (admin already has auth context); flagged for the implementer.
- **Type consistency:** `CameraGroup`, `AdminCameraGroup`, `PublicGroupWithCameras`, `setGroupCameras(groupId, cameraIds)`, `getGroupBySlug(tenantSlug, groupSlug)`, endpoints `/api/v1/groups/:tenantSlug/:groupSlug` and `/api/v1/cameras/:id/latest` used identically across T1–T6.
