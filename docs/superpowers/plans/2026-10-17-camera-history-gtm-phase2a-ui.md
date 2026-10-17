# Camera History — GTM Fáze 2A: Admin & Widget UI polish — Implementační plán

**Datum:** 2026-10-17
**Spec:** `docs/superpowers/specs/2026-10-17-camera-history-gtm-phase2a-ui-design.md`
**Navazuje na:** Fáze 1 (`42c8fa3`..`498d531`)
**Base commit:** `2410084` (docs: GTM phase 2A UI design spec)

## Cíl

Uvést admin a widget do prezentovatelného stavu: úplná angličtina, self-service registrace s onboardingem a jednotný vizuál „Alpine clean".

## Konvence a poznámky pro implementátora

- Práce **inline na `main`** (jako M5/M6), conventional commits.
- Po každém úkolu: `npm run typecheck`, `npm test`, `npm run lint` (root). Build ověřen v Task 4.
- Balíčky `@ch/web`/`@ch/admin` **nezávisí** na `@ch/core`; CSS tokeny se záměrně duplikují.
- Testy: `vitest` + `@testing-library/react`. Admin testy mockují `fetch` přes `vi.stubGlobal`.
- **Zachovat všechny `data-testid`** a strukturu DOM (jen texty/třídy/CSS) — kvůli testům.
- Nepřekládat `data-testid`, názvy kamer v testech (`Beach cam`, …), ani `feedType`/`theme` hodnoty (jsou to klíče API).

## Mapování textů (CS → EN) — referenční tabulka

Použij tuto tabulku napříč úkoly:

| Kontext | Klíč / místo | CS (současné) | EN (nové) |
|---|---|---|---|
| core billing | tier 0.5 | `14 dní` | `14 days` |
| core billing | tier 1 | `1 měsíc` | `1 month` |
| core billing | tier 3 | `3 měsíce` | `3 months` |
| core billing | tier 6 | `6 měsíců` | `6 months` |
| core billing | tier 12 | `12 měsíců` | `12 months` |
| core billing | tier 24 | `24 měsíců` | `24 months` |
| core billing | tier 36 | `36 měsíců` | `36 months` |
| admin label map | FEED_LABELS.static_url | `Statický obrázek (HTTP)` | `Static image (HTTP)` |
| admin label map | FEED_LABELS.mjpeg | `MJPEG stream` | `MJPEG stream` |
| admin label map | FEED_LABELS.hls | `HLS (ffmpeg)` | `HLS (ffmpeg)` |
| admin label map | FEED_LABELS.rtsp | `RTSP (ffmpeg)` | `RTSP (ffmpeg)` |
| admin label map | FEED_LABELS.custom | `Custom WebSocket` | `Custom WebSocket` |
| admin label map | THEME_LABELS.light | `Světlé` | `Light` |
| admin label map | THEME_LABELS.dark | `Tmavé` | `Dark` |
| admin label map | THEME_LABELS.forest | `Lesní` | `Forest` |
| admin label map | THEME_LABELS.midnight | `Půlnoc` | `Midnight` |
| admin status | STATUS_LABELS.operational | `V běhu` | `Operational` |
| admin status | STATUS_LABELS.delayed | `Zpožděno` | `Delayed` |
| admin status | STATUS_LABELS.offline | `Výpadek` | `Offline` |
| login | button | `Přihlásit se` | `Sign in` |
| camera form | heading | `Upravit kameru` / `Nová kamera` | `Edit camera` / `New camera` |
| camera form | label | `Název` | `Name` |
| camera form | label | `Typ` | `Type` |
| camera form | label | `Téma` | `Theme` |
| camera form | label | `Aktivní od` / `Aktivní do` | `Active from` / `Active to` |
| camera form | label | `Časové pásmo` | `Timezone` |
| camera form | buttons | `Uložit` / `Zrušit` | `Save` / `Cancel` |
| app | loading | `Načítám…` | `Loading…` |
| app | logout | `Odhlásit` | `Sign out` |
| app | nav | `Kamery` | `Cameras` |
| app | button | `+ Nová kamera` | `+ New camera` |
| app | headers | `Název`/`Typ`/`Povolena`/`Stav`/`Poslední snímek`/`Chyba`/`Náhled` | `Name`/`Type`/`Enabled`/`Status`/`Last capture`/`Error`/`Preview` |
| app | enabled cell | `ano` / `ne` | `yes` / `no` |
| app | row buttons | `Upravit` / `Smazat` | `Edit` / `Delete` |
| app | empty (plain) | `Žádné kamery.` | `No cameras.` |
| app | confirm | `Smazat kameru <x>? Smažou se i všechny snímky.` | `Delete camera <x>? This also deletes all of its images.` |
| app | confirm buttons | `Smazat` / `Zrušit` | `Delete` / `Cancel` |
| billing | none | `není aktivováno` | `not activated` |
| billing | active | `aktivní` | `active` |
| billing | past_due | `po splatnosti` | `past due` |
| billing | unpaid | `není zaplaceno` | `unpaid` |
| billing | canceled | `zrušeno` | `canceled` |
| billing | notice | `Platba proběhla úspěšně.` | `Payment completed.` |
| billing | notice | `Platba byla zrušena.` | `Payment was canceled.` |
| billing | notice | `Změna tarifu se projeví na příští faktuře.` | `The plan change will apply on your next invoice.` |
| billing | loading | `Načítám…` | `Loading…` |
| billing | notice | `Platební integrace není aktuálně zapnutá.` | `Billing is not enabled right now.` |
| billing | warning | `Platba po splatnosti — aktivace do <d>.` | `Payment past due — activation by <d>.` |
| billing | warning | `Účet není aktivní. Obnovte platbu pro zapnutí kamer.` | `Account is not active. Restore payment to enable cameras.` |
| billing | current | `Aktuální tarif: <l> · <p> € / kamera` | `Current plan: <l> · <p> € / camera` |
| billing | tier card | `<p> € / kamera / měsíc` | `<p> € / camera / month` |
| billing | tier current | `aktuální` | `current` |
| billing | button | `Změnit tarif` | `Change plan` |
| billing | button | `Platby / faktury` | `Payments / invoices` |
| billing | stats | `Kamery` | `Cameras` |
| billing | stats | `Uloženo` | `Stored` |
| billing | stats | `Odhad plné retence` | `Estimated full retention` |
| widget | empty | `Žádné snímky pro toto datum.` | `No images for this date.` |

---

## Task 1 — Anglické texty (core + admin + widget)

**Deliverable:** Všechny viditelné texty core billing labelů, adminu a widget prázdného stavu jsou anglicky; testy aktualizované a zelené.

**Files:**
- Modify: `packages/core/src/billing.ts`
- Modify: `packages/core/test/billing.test.ts`
- Modify: `packages/admin/src/api.ts`
- Modify: `packages/admin/src/App.tsx`
- Modify: `packages/admin/src/Billing.tsx`
- Modify: `packages/admin/src/test/App.test.tsx`
- Modify: `packages/admin/src/test/Billing.test.tsx`
- Modify: `packages/web/src/App.tsx`

### Step 1.1 — Uprav testy na angličtinu (RED)

`packages/core/test/billing.test.ts:13`:
```ts
    expect(BILLING_TIERS[3]).toMatchObject({ label: "6 months", eurPerCamera: 22 });
```

`packages/admin/src/test/App.test.tsx:103-104`:
```tsx
    expect(screen.getByTestId("status-cam-1")).toHaveTextContent("Delayed");
    expect(screen.getByTestId("status-cam-2")).toHaveTextContent("Operational");
```

`packages/admin/src/test/Billing.test.tsx` — fixture labelů tierů přeložit a aserce:
```tsx
    { months: 0.5, label: "14 days", eurPerCamera: 5, current: false },
    { months: 1, label: "1 month", eurPerCamera: 9, current: false },
    { months: 3, label: "3 months", eurPerCamera: 15, current: false },
    { months: 6, label: "6 months", eurPerCamera: 22, current: false },
    { months: 12, label: "12 months", eurPerCamera: 29, current: true },
    { months: 24, label: "24 months", eurPerCamera: 49, current: false },
    { months: 36, label: "36 months", eurPerCamera: 69, current: false },
```
řádek 48: `expect(plan).toHaveTextContent("12 months");`
řádek 50: `expect(screen.getByText("past due")).toBeInTheDocument();`
řádek 56: `expect(await screen.findByText(/activation by/i)).toBeInTheDocument();`

### Step 1.2 — Ověř, že testy padají

Run:
```bash
npm run test --workspace @ch/core --workspace @ch/admin
```
Expected: FAIL (core billing label, admin status labely, billing texty).

### Step 1.3 — Přelož zdroje

`packages/core/src/billing.ts:8-14` — labely dle tabulky.

`packages/admin/src/api.ts:57-74` — `FEED_LABELS`, `THEME_LABELS` dle tabulky.

`packages/admin/src/App.tsx` — dle tabulky:
- `STATUS_LABELS` (ř. 7-9)
- login button (ř. 65)
- camera form heading/labely/tlačítka (ř. 96, 99, 117, 138, 142, 147, 152, 155)
- loading (ř. 280), logout (ř. 304), nav `Kamery` (ř. 296)
- `+ Nová kamera` (ř. 320)
- table headers (ř. 326-332)
- `ano`/`ne` (ř. 193)
- `Žádné kamery.` (ř. 340)
- `Upravit`/`Smazat` (ř. 206, 209)
- confirm text a tlačítka (ř. 370, 374, 377)

`packages/admin/src/Billing.tsx` — dle tabulky (STATUS_LABELS ř. 4-10, notices ř. 31-32, 42, 61, 69, 77, 81, 84, 97-98, 104, 107, 112, 116, 120).

`packages/web/src/App.tsx:104`:
```tsx
        {images.length === 0 && <p className="empty">No images for this date.</p>}
```

### Step 1.4 — Testy zelené

Run:
```bash
npm run test --workspace @ch/core --workspace @ch/admin --workspace @ch/web
```
Expected: PASS.

### Step 1.5 — Gates

Run:
```bash
npm run typecheck && npm run lint
```
Expected: clean.

### Step 1.6 — Commit
```bash
git add packages/core/src/billing.ts packages/core/test/billing.test.ts \
  packages/admin/src/api.ts packages/admin/src/App.tsx packages/admin/src/Billing.tsx \
  packages/admin/src/test/App.test.tsx packages/admin/src/test/Billing.test.tsx \
  packages/web/src/App.tsx
git commit -m "feat(ui): translate admin, widget and billing copy to English"
```

---

## Task 2 — Registrace a onboarding

**Deliverable:** Návštěvník se zaregistruje z login obrazovky, po úspěchu je v adminu; seznam kamer má vodící prázdný stav; formulář kamery má anglické hinty.

**Files:**
- Modify: `packages/admin/src/api.ts` (přidat `register`)
- Modify: `packages/admin/src/App.tsx` (`Register`, route `#/register`, empty state, hinty)
- Modify: `packages/admin/src/App.css` (třídy `button.link`, `.field-hint`, `.empty-state`)
- Modify: `packages/admin/src/test/App.test.tsx` (nové testy)

### Step 2.1 — Napiš testy registrace (RED)

Přidej do `packages/admin/src/test/App.test.tsx` nové `describe`:

```tsx
describe("App registration", () => {
  const registerServer = (registerStatus = 201, detail = "tenant slug already taken") =>
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/api/v1/admin/cameras")) return jsonResponse({ detail: "unauthorized" }, 401);
      if (u.endsWith("/api/v1/auth/register")) {
        if (registerStatus !== 201) return jsonResponse({ detail }, registerStatus);
        return jsonResponse({ status: "created", tenantId: "t1", billing: { required: false } }, 201);
      }
      return jsonResponse({ detail: "not found" }, 404);
    });

  it("registers and lands on the empty camera list", async () => {
    vi.stubGlobal("fetch", registerServer());
    window.location.hash = "#/register";
    render(<App />);

    await screen.findByTestId("register-form");
    await userEvent.type(screen.getByTestId("register-name"), "Alpine Resort");
    await userEvent.type(screen.getByTestId("register-email"), "owner@alpine.dev");
    await userEvent.type(screen.getByTestId("register-password"), "supersecret");
    expect((screen.getByTestId("register-slug") as HTMLInputElement).value).toBe("alpine-resort");
    await userEvent.click(screen.getByTestId("register-submit"));

    expect(await screen.findByTestId("empty-state")).toBeInTheDocument();
    window.location.hash = "";
  });

  it("shows an inline error when the slug is taken", async () => {
    vi.stubGlobal("fetch", registerServer(409));
    window.location.hash = "#/register";
    render(<App />);

    await screen.findByTestId("register-form");
    await userEvent.type(screen.getByTestId("register-name"), "Taken Co");
    await userEvent.type(screen.getByTestId("register-email"), "a@b.dev");
    await userEvent.type(screen.getByTestId("register-password"), "supersecret");
    await userEvent.click(screen.getByTestId("register-submit"));

    await waitFor(() => expect(screen.getByTestId("register-error")).toHaveTextContent("tenant slug already taken"));
    window.location.hash = "";
  });

  it("links from login to the register screen", async () => {
    vi.stubGlobal("fetch", registerServer());
    window.location.hash = "";
    render(<App />);
    await screen.findByTestId("login-form");
    await userEvent.click(screen.getByTestId("goto-register"));
    expect(window.location.hash).toBe("#/register");
    window.location.hash = "";
  });
});
```

> Pozn.: testy ověřují i `empty-state` (Step 2.3). `window.location.hash` reset na začátku i na konci kvůli izolaci mezi testy. Test odkazu záměrně asertuje `window.location.hash` (nikoli re-render), protože jsdom nespolehlivě spouští `hashchange` při změně hashe.

### Step 2.2 — Ověř, že testy padají

Run:
```bash
npm run test --workspace @ch/admin
```
Expected: FAIL (`register-form` nenalezeno).

### Step 2.3 — Implementuj

`packages/admin/src/api.ts` — přidej do objektu `api` (za `login`):
```ts
  register: (input: { name: string; slug: string; email: string; password: string }) =>
    json<{ status: string; tenantId: string; billing?: { required: boolean; checkoutUrl?: string } }>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify(input) },
    ),
```

`packages/admin/src/App.tsx`:

1) Nahraď `Login` (ř. 27-69) novou verzí s odkazem na registraci:
```tsx
function Login({ onSuccess, onRegister }: { onSuccess: (email: string) => void; onRegister: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.login(email, password);
      onSuccess(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <form className="login" onSubmit={submit} data-testid="login-form">
      <h1>Camera History Admin</h1>
      {error && (
        <p className="error" data-testid="login-error">
          {error}
        </p>
      )}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        data-testid="login-email"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        data-testid="login-password"
      />
      <button type="submit" data-testid="login-submit">
        Sign in
      </button>
      <button type="button" className="link" onClick={onRegister} data-testid="goto-register">
        Create account
      </button>
    </form>
  );
}
```

2) Za `Login` přidej helper a `Register`:
```tsx
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function Register({ onSuccess, onSignIn }: { onSuccess: (email: string) => void; onSignIn: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!SLUG_RE.test(slug)) {
      setError("Slug can only contain lowercase letters, numbers and hyphens.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      const res = await api.register({ name, slug, email, password });
      if (res.billing?.checkoutUrl) {
        window.location.assign(res.billing.checkoutUrl);
        return;
      }
      onSuccess(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  return (
    <form className="login" onSubmit={submit} data-testid="register-form">
      <h1>Create account</h1>
      {error && (
        <p className="error" data-testid="register-error">
          {error}
        </p>
      )}
      <input
        placeholder="Company name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-testid="register-name"
        required
      />
      <input
        placeholder="Slug"
        value={slug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value);
        }}
        data-testid="register-slug"
        required
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        data-testid="register-email"
        required
      />
      <input
        type="password"
        placeholder="Password (min 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        data-testid="register-password"
        required
      />
      <button type="submit" data-testid="register-submit">
        Create account
      </button>
      <button type="button" className="link" onClick={onSignIn} data-testid="goto-signin">
        Already have an account? Sign in
      </button>
    </form>
  );
}
```

3) V `App` přidej stav `registering` a napojení na hash. Nahraď první `useEffect` (ř. 225-229):
```tsx
  const [registering, setRegistering] = useState(() => window.location.hash.startsWith("#/register"));

  useEffect(() => {
    const onHash = () => {
      setView(currentView());
      setRegistering(window.location.hash.startsWith("#/register"));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
```

Nahraď blok pro nepřihlášeného (ř. 282-288):
```tsx
  if (email === null) {
    return (
      <main className="admin">
        {registering ? (
          <Register
            onSuccess={setEmail}
            onSignIn={() => {
              window.location.hash = "";
            }}
          />
        ) : (
          <Login
            onSuccess={setEmail}
            onRegister={() => {
              window.location.hash = "#/register";
            }}
          />
        )}
      </main>
    );
  }
```

4) Prázdný stav v tabulce (ř. 337-343) nahraď:
```tsx
            {cameras.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  <div className="empty-state" data-testid="empty-state">
                    <p className="empty-title">No cameras yet</p>
                    <p>Add your first camera to start building its history.</p>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditing(emptyInput());
                      }}
                      data-testid="empty-add-camera"
                    >
                      Add your first camera
                    </button>
                  </div>
                </td>
              </tr>
            )}
```

5) Hinty ve formuláři kamery (`CameraForm`). Za `Typ` select (ř. 110-111) přidej:
```tsx
          <span className="field-hint">
            Static image fetches a JPEG URL. MJPEG is a motion-JPEG stream. HLS/RTSP use ffmpeg. Custom is a
            WebSocket that sends JPEG frames.
          </span>
```
Za `Timezone` input (ř. 148) přidej:
```tsx
          <span className="field-hint">IANA timezone, e.g. Europe/Zurich.</span>
```

`packages/admin/src/App.css` — přidej (do Tasku 3 se přepíše barvami; nyní funkční minimum):
```css
button.link {
  background: none;
  border: none;
  color: inherit;
  text-decoration: underline;
  padding: 0;
}
.field-hint {
  color: #666;
  font-size: 0.78rem;
  font-weight: 400;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem 1rem;
}
.empty-title {
  font-weight: 600;
  margin: 0;
}
```

### Step 2.4 — Testy zelené

Run:
```bash
npm run test --workspace @ch/admin
```
Expected: PASS.

### Step 2.5 — Gates

Run:
```bash
npm run typecheck && npm run lint
```
Expected: clean.

### Step 2.6 — Commit
```bash
git add packages/admin/src/api.ts packages/admin/src/App.tsx packages/admin/src/App.css packages/admin/src/test/App.test.tsx
git commit -m "feat(admin): self-serve registration and camera onboarding"
```

---

## Task 3 — Vizuál „Alpine clean"

**Deliverable:** Admin i widget mají jednotnou čistou paletu dle spec; widget témata `dark`/`forest`/`midnight` zachována; testy nezměněné a zelené.

**Files:**
- Modify: `packages/admin/src/App.css` (plná náhrada)
- Modify: `packages/web/src/App.css` (jen `light` tokeny + radius)

### Step 3.1 — Admin: nahraď `App.css` celý

```css
:root {
  color-scheme: light;
  --bg: #f6f8fb;
  --surface: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --accent: #2563eb;
  --accent-weak: #eff6ff;
  --danger: #dc2626;
  --radius: 10px;
  --shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}

.login {
  max-width: 340px;
  margin: 12vh auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: var(--surface);
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.login h1 {
  font-size: 1.15rem;
  margin: 0 0 0.4rem;
}

input,
select,
button {
  font: inherit;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
}

button {
  cursor: pointer;
  background: var(--accent);
  color: #fff;
  border-color: transparent;
}

button:hover {
  filter: brightness(1.05);
}

button.secondary {
  background: var(--surface);
  color: var(--accent);
  border-color: var(--border);
}

button.danger {
  background: var(--surface);
  color: var(--danger);
  border-color: var(--border);
}

button.link {
  background: none;
  border: none;
  color: var(--accent);
  text-decoration: underline;
  padding: 0;
}

.error {
  color: var(--danger);
  font-size: 0.85rem;
}

.placeholder,
.loading {
  padding: 3rem;
  text-align: center;
  color: var(--muted);
}

.admin {
  max-width: 1080px;
  margin: 0 auto;
  padding: 1rem;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--surface);
  padding: 0.7rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  margin-bottom: 1rem;
}

.topbar-title {
  font-weight: 600;
}

.topbar-user {
  margin-left: auto;
  color: var(--muted);
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  box-shadow: var(--shadow);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.8rem;
}

.panel-head h2 {
  margin: 0;
  font-size: 1rem;
}

.cameras {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.cameras th {
  text-align: left;
  padding: 0.5rem;
  color: var(--muted);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.cameras td {
  text-align: left;
  padding: 0.55rem 0.5rem;
  border-bottom: 1px solid var(--border);
}

.cameras tbody tr:hover {
  background: var(--accent-weak);
}

.cell-name {
  font-weight: 600;
}

.empty {
  color: var(--muted);
  text-align: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem 1rem;
}

.empty-title {
  font-weight: 600;
  margin: 0;
}

.status {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.status-operational {
  background: #e7f6ec;
  color: #157347;
}

.status-delayed {
  background: #fef3c7;
  color: #b45309;
}

.status-offline {
  background: #fde8e8;
  color: #b91c1c;
}

.thumb {
  height: 40px;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-body {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 1.2rem;
  min-width: 380px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  box-shadow: var(--shadow);
}

.modal-body h3 {
  margin: 0;
  font-size: 1rem;
}

.modal-body label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}

.form-row {
  display: flex;
  gap: 0.7rem;
}

.form-row label {
  flex: 1;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.4rem;
}

.field-hint {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 400;
}

.cell-error {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--danger);
}

.cell-actions {
  display: flex;
  gap: 0.4rem;
}

.topbar-nav {
  display: flex;
  gap: 12px;
  margin-left: 24px;
}

.topbar-nav a {
  color: var(--muted);
  text-decoration: none;
}

.topbar-nav a:hover {
  color: var(--text);
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.plan-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: var(--radius);
  cursor: pointer;
}

.plan-card:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-weak);
}

.plan-card input {
  accent-color: var(--accent);
}

.usage-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.usage-stats div {
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: var(--radius);
}

.usage-stats dt {
  color: var(--muted);
  font-size: 0.85em;
}

.notice {
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--accent-weak);
  border: 1px solid var(--border);
  margin: 12px 0;
}

.notice.danger {
  background: #fdeaea;
  color: #991b1b;
  border-color: #f5c2c2;
}
```

### Step 3.2 — Widget: srovnej `light` tokeny

`packages/web/src/App.css:3-10` nahraď `:root` blok:
```css
:root {
  --bg: #f6f8fb;
  --surface: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --accent: #2563eb;
}
```
Bloky `[data-theme="dark"]`, `[data-theme="forest"]`, `[data-theme="midnight"]` **ponech beze změny**.

V `.widget-cell` (ř. 45) změň `border-radius: 6px` → `10px`; v `.modal-content` (ř. 50) `border-radius: 8px` → `10px`.

### Step 3.3 — Testy + gates

Run:
```bash
npm test && npm run typecheck && npm run lint
```
Expected: PASS / clean (CSS nemá testy).

### Step 3.4 — Commit
```bash
git add packages/admin/src/App.css packages/web/src/App.css
git commit -m "style(ui): apply Alpine clean visual system"
```

---

## Task 4 — Verifikace

**Deliverable:** Všechny gates zelené + potvrzený manuální QA checklist.

### Step 4.1 — Plné gates
```bash
npm run typecheck && npm test && npm run lint && npm run build
```
Expected: vše PASS, build bez chyb.

### Step 4.2 — Manuální QA (vyžaduje běžící stack)

Stack: použij override kvůli konfliktům portů na hostu:
```bash
docker compose -f docker-compose.yml -f /tmp/opencode/ch-override.yml up -d --build
```
(admin na `http://localhost:18080/admin/`, widget `/embed/<tenant>`; viz M6 runbook)

Checklist:
- [ ] Login obrazovka je anglicky; „Create account" vede na `#/register`.
- [ ] Registrace: slug se auto-generuje z názvu a jde editovat; krátké heslo / špatný slug → inline chyba.
- [ ] Po registraci prázdný stav „No cameras yet" + CTA otevře formulář.
- [ ] Formulář kamery: anglické labely + hinty; uložení funguje.
- [ ] Widget: prázdný stav anglicky; přepnutí témat `dark`/`forest`/`midnight` beze změny, `light` v nové paletě.
- [ ] Mobilní šířka (~380px): admin i widget čitelné, modaly se vejdou.
- [ ] Vizuální kontrola: konzistentní tokeny, žádné zbytkové české texty (`grep -rnE '[Á-ž]' packages/admin/src packages/web/src`).

### Step 4.3 — Úklid
```bash
docker compose -f docker-compose.yml -f /tmp/opencode/ch-override.yml down
```

---

## Závěrečná kontrola (whole-branch)

Po Tasku 4 proběhne review celé větve Fáze 2A (`2410084..HEAD`): angličtina úplná, registrace funguje, vizuál jednotný, gates zelené. Případné nálezy opravit samostatným commitem a re-review.

## Mimo rozsah (pozdější fáze)

- Fáze 2B: demo tenant s reálnými daty + seed.
- Onboarding/outreach kit (co žádat od firem, WP plugin vs. iframe snippet, per-kamera integrace) — sales enablement, samostatná fáze dle GTM spec.
