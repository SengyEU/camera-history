#!/usr/bin/env node
// Idempotentní seed demo tenanta s reálnými veřejnými kamerami.
// Bez deps: volá vlastní Camera History API přes global fetch (Node >= 20).
//
// Použití:
//   API_BASE=https://camera.sengycraft.cz/api/v1 DEMO_PASSWORD=... node scripts/seed-demo.mjs
//
// Strategie historie (dle GTM spec §4): reálný live-capture workerem.
// Žádný syntetický backfill (vyrobená historie z jednoho snímku) — prozradilo by se.
// Kamery = veřejné statické JPEG (Lake Louise, reálné středisko, více úhlů)
//        + custom WS feed (KiteSport) pro ukázku custom adaptéru a multi-tenancy.
//
// Idempotence: tenant se přihlásí (popř. zaregistruje), chybějící kamery se vytvoří,
// existující se srovnají s configem (interval + souřadnice). Opakovatelné spuštění neduplikuje.

const API = (process.env.API_BASE ?? "https://camera.sengycraft.cz/api/v1").replace(/\/+$/, "");
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Resort-2026!";

const TENANTS = [
  {
    name: "Alpine Summit Resort",
    slug: "alpine-summit",
    email: "owner@alpinesummit.example",
    cameras: [
      { name: "Gondola Summit", feedType: "static_url", feedUrl: "https://cams.skilouise.com/cam1.jpg", timezone: "America/Edmonton", latitude: 51.425, longitude: -116.177 },
      { name: "Glacier Bowl", feedType: "static_url", feedUrl: "https://cams.skilouise.com/cam3.jpg", timezone: "America/Edmonton", latitude: 51.425, longitude: -116.177 },
      { name: "Lodge Base", feedType: "static_url", feedUrl: "https://cams.skilouise.com/cam6.jpg", timezone: "America/Edmonton", latitude: 51.425, longitude: -116.177 },
    ],
    groups: [
      { name: "Summit", slug: "summit", cameras: ["Gondola Summit", "Glacier Bowl", "Lodge Base"] },
    ],
  },
  {
    name: "Harbor Kite Beach",
    slug: "harbor-kite",
    email: "owner@harborkite.example",
    cameras: [
      { name: "Kite Cam", feedType: "custom", feedUrl: "wss://cam.kitesportcentre.com/gl-cam", timezone: "Europe/Prague", latitude: 53.35, longitude: -6.267 },
    ],
  },
];

const INTERVAL_MINUTES = 60;

function makeJar() {
  const m = new Map();
  return {
    absorb(res) {
      for (const sc of res.headers.getSetCookie?.() ?? []) {
        const [pair] = sc.split(";");
        const i = pair.indexOf("=");
        if (i > 0) m.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
    header() {
      return [...m.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function call(method, path, { body, jar } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (jar?.header()) headers.Cookie = jar.header();
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res;
}

async function login(email, jar) {
  const res = await call("POST", "/auth/login", { body: { email, password: PASSWORD }, jar });
  jar.absorb(res);
  return res.ok;
}

async function ensureTenant(cfg) {
  const jar = makeJar();
  let ok = await login(cfg.email, jar);
  if (!ok) {
    const reg = await call("POST", "/auth/register", {
      body: { name: cfg.name, slug: cfg.slug, email: cfg.email, password: PASSWORD },
      jar,
    });
    // 409 = slug již existuje (předchozí běh) → přihlásíme se níže.
    if (!reg.ok && reg.status !== 409) throw new Error(`register ${cfg.slug} → ${reg.status}: ${await reg.text()}`);
    ok = await login(cfg.email, jar);
  }
  if (!ok) throw new Error(`login failed for ${cfg.email} (slug ${cfg.slug})`);
  return jar;
}

async function ensureCameras(jar, cfg) {
  const listRes = await call("GET", "/admin/cameras", { jar });
  if (!listRes.ok) throw new Error(`GET /admin/cameras → ${listRes.status}: ${await listRes.text()}`);
  const { cameras = [] } = await listRes.json();
  const have = new Map(cameras.map((c) => [c.name, c]));

  let created = 0;
  let existing = 0;
  let updated = 0;
  for (const cam of cfg.cameras) {
    const live = have.get(cam.name);
    if (live) {
      // Update pass: existující kameru srovnáme s configem (interval + souřadnice).
      // Admin PUT umí částečný patch → posíláme jen skutečně změněná pole.
      const patch = {};
      const fields = [];
      if (live.intervalMinutes !== INTERVAL_MINUTES) {
        patch.intervalMinutes = INTERVAL_MINUTES;
        fields.push("intervalMinutes");
      }
      if (cam.latitude !== undefined && live.latitude !== cam.latitude) {
        patch.latitude = cam.latitude;
        fields.push("latitude");
      }
      if (cam.longitude !== undefined && live.longitude !== cam.longitude) {
        patch.longitude = cam.longitude;
        fields.push("longitude");
      }
      if (fields.length === 0) {
        existing += 1;
        console.log(`   · ${cam.name} (exists)`);
        continue;
      }
      const putRes = await call("PUT", `/admin/cameras/${live.id}`, { jar, body: patch });
      if (!putRes.ok) throw new Error(`update ${cam.name} → ${putRes.status}: ${await putRes.text()}`);
      updated += 1;
      console.log(`   ~ ${cam.name} (updated: ${fields.join(", ")})`);
      continue;
    }
    const res = await call("POST", "/admin/cameras", {
      jar,
      body: {
        ...cam,
        intervalMinutes: INTERVAL_MINUTES,
        theme: cam.theme ?? "light",
        activeFrom: "00:00",
        activeTo: "23:59",
        enabled: true,
        daylightOnly: false,
      },
    });
    if (!res.ok) throw new Error(`create ${cam.name} → ${res.status}: ${await res.text()}`);
    created += 1;
    console.log(`   + ${cam.name} (${cam.feedType} → ${cam.feedUrl})`);
  }
  if (created === 0) return { cameras, created, existing, updated };
  const refetch = await call("GET", "/admin/cameras", { jar });
  if (!refetch.ok) throw new Error(`GET /admin/cameras → ${refetch.status}: ${await refetch.text()}`);
  const { cameras: all = [] } = await refetch.json();
  return { cameras: all, created, existing, updated };
}

async function ensureGroups(jar, cfg, cameras) {
  const groups = cfg.groups ?? [];
  if (groups.length === 0) return { created: 0, existing: 0 };

  const listRes = await call("GET", "/admin/groups", { jar });
  if (!listRes.ok) throw new Error(`GET /admin/groups → ${listRes.status}: ${await listRes.text()}`);
  let existingGroups = (await listRes.json()).groups ?? [];

  const nameToId = new Map(cameras.map((c) => [c.name, c.id]));

  let created = 0;
  let existing = 0;

  for (const g of groups) {
    let group = existingGroups.find((x) => x.slug === g.slug);
    let wasCreated = false;
    if (!group) {
      const createRes = await call("POST", "/admin/groups", {
        jar,
        body: { name: g.name, slug: g.slug },
      });
      if (createRes.status === 409) {
        const list2 = await call("GET", "/admin/groups", { jar });
        if (!list2.ok) throw new Error(`GET /admin/groups → ${list2.status}: ${await list2.text()}`);
        existingGroups = (await list2.json()).groups ?? [];
        group = existingGroups.find((x) => x.slug === g.slug);
        if (!group) throw new Error(`group ${g.slug} not found after 409`);
        existing += 1;
      } else if (!createRes.ok) {
        throw new Error(`create group ${g.name} → ${createRes.status}: ${await createRes.text()}`);
      } else {
        const createdGroup = (await createRes.json()).group;
        group = { id: createdGroup.id, slug: g.slug, name: g.name };
        created += 1;
        wasCreated = true;
      }
    } else {
      existing += 1;
    }
    const cameraIds = (g.cameras ?? [])
      .map((n) => nameToId.get(n))
      .filter((id) => typeof id !== "undefined");
    const putRes = await call("PUT", `/admin/groups/${group.id}/cameras`, {
      jar,
      body: { cameraIds },
    });
    if (!putRes.ok) throw new Error(`PUT /admin/groups/${group.id}/cameras → ${putRes.status}: ${await putRes.text()}`);

    if (wasCreated) {
      console.log(`   + group ${g.name} (${cameraIds.length} cameras)`);
    } else {
      console.log(`   · group ${g.name} (exists)`);
    }
  }

  return { created, existing };
}

console.log(`API: ${API}\n`);

for (const cfg of TENANTS) {
  console.log(`${cfg.name} (${cfg.slug})`);
  const jar = await ensureTenant(cfg);
  const { cameras, created: createdC, existing: existingC, updated: updatedC } = await ensureCameras(jar, cfg);
  const groups = await ensureGroups(jar, cfg, cameras);
  console.log(
    `   → ${createdC} created, ${existingC} already present, ${updatedC} updated, groups: ${groups.created} created, ${groups.existing} already present\n`,
  );
}

console.log("Hotovo. Worker doplňuje historii průběžně reálnými snímky (žádný syntetický backfill).");
console.log(`Přihlášení do adminu: e-maily ${TENANTS.map((t) => t.email).join(", ")} / heslo z DEMO_PASSWORD`);
