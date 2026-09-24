import { useCallback, useEffect, useState } from "react";
import { api, FEED_LABELS, FEED_TYPES, INTERVALS, type AdminCamera, type CameraInput } from "./api";
import { BillingPage } from "./Billing";
import "./App.css";

const STATUS_LABELS: Record<AdminCamera["status"], string> = {
  operational: "V běhu",
  delayed: "Zpožděno",
  offline: "Výpadek",
};

const emptyInput = (): CameraInput => ({
  name: "",
  feedType: "static_url",
  feedUrl: "",
  intervalMinutes: 15,
  activeFrom: "00:00",
  activeTo: "23:59",
  timezone: "UTC",
});

function currentView(): "cameras" | "billing" {
  return window.location.hash.startsWith("#/billing") ? "billing" : "cameras";
}

function Login({ onSuccess }: { onSuccess: (email: string) => void }) {
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
        Přihlásit se
      </button>
    </form>
  );
}

function CameraForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: CameraInput;
  onSave: (input: CameraInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [input, setInput] = useState<CameraInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CameraInput, v: string | number) => setInput((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSave(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <div className="modal">
      <form className="modal-body" onSubmit={submit} data-testid="camera-form">
        <h3>{initial.name ? "Upravit kameru" : "Nová kamera"}</h3>
        {error && <p className="error">{error}</p>}
        <label>
          Název
          <input value={input.name} onChange={(e) => set("name", e.target.value)} data-testid="form-name" required />
        </label>
        <label>
          Typ
          <select value={input.feedType} onChange={(e) => set("feedType", e.target.value)} data-testid="form-feed-type">
            {FEED_TYPES.map((t) => (
              <option key={t} value={t}>
                {FEED_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Feed URL
          <input value={input.feedUrl} onChange={(e) => set("feedUrl", e.target.value)} data-testid="form-feed-url" />
        </label>
        <label>
          Interval (min)
          <select value={input.intervalMinutes} onChange={(e) => set("intervalMinutes", Number(e.target.value))} data-testid="form-interval">
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            Aktivní od
            <input type="time" value={input.activeFrom} onChange={(e) => set("activeFrom", e.target.value)} />
          </label>
          <label>
            Aktivní do
            <input type="time" value={input.activeTo} onChange={(e) => set("activeTo", e.target.value)} />
          </label>
        </div>
        <label>
          Časové pásmo
          <input value={input.timezone} onChange={(e) => set("timezone", e.target.value)} data-testid="form-timezone" />
        </label>
        <div className="form-actions">
          <button type="submit" data-testid="form-submit">
            Uložit
          </button>
          <button type="button" className="secondary" onClick={onCancel} data-testid="form-cancel">
            Zrušit
          </button>
        </div>
      </form>
    </div>
  );
}

function CameraRow({
  cam,
  onEdit,
  onDelete,
}: {
  cam: AdminCamera;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .preview(cam.id)
      .then((d) => {
        if (active) setPreviewUrl(d.latest?.url ?? null);
      })
      .catch(() => {
        if (active) setPreviewUrl(null);
      });
    return () => {
      active = false;
    };
  }, [cam.id]);

  return (
    <tr data-testid={`camera-${cam.id}`}>
      <td className="cell-name">{cam.name}</td>
      <td>{FEED_LABELS[cam.feedType]}</td>
      <td>{cam.enabled ? "ano" : "ne"}</td>
      <td>
        <span className={`status status-${cam.status}`} data-testid={`status-${cam.id}`}>
          {STATUS_LABELS[cam.status]}
        </span>
      </td>
      <td>{cam.lastCaptureAt ? new Date(cam.lastCaptureAt).toLocaleString() : "—"}</td>
      <td data-testid={`last-error-${cam.id}`} className="cell-error">
        {cam.lastError ?? "—"}
      </td>
      <td>{previewUrl ? <img className="thumb" src={previewUrl} alt={`preview ${cam.name}`} /> : "—"}</td>
      <td className="cell-actions">
        <button className="secondary" onClick={onEdit} data-testid={`edit-${cam.id}`}>
          Upravit
        </button>
        <button className="danger" onClick={onDelete} data-testid={`delete-${cam.id}`}>
          Smazat
        </button>
      </td>
    </tr>
  );
}

export function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [cameras, setCameras] = useState<AdminCamera[]>([]);
  const [editing, setEditing] = useState<CameraInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminCamera | null>(null);
  const [view, setView] = useState<"cameras" | "billing">(currentView);

  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    api
      .listCameras()
      .then(() => setEmail(""))
      .catch(() => setEmail(null))
      .finally(() => setChecked(true));
  }, []);

  const refresh = useCallback(() => {
    api.listCameras().then(setCameras).catch(() => setCameras([]));
  }, []);

  useEffect(() => {
    if (email !== null) refresh();
  }, [email, refresh]);

  const logout = async () => {
    await api.logout();
    setEmail(null);
  };

  const toInput = (cam: AdminCamera): CameraInput => ({
    name: cam.name,
    feedType: cam.feedType,
    feedUrl: cam.feedUrl,
    intervalMinutes: cam.intervalMinutes,
    activeFrom: cam.activeFrom,
    activeTo: cam.activeTo,
    timezone: cam.timezone,
  });

  const saveCamera = async (input: CameraInput) => {
    if (editingId) {
      await api.updateCamera(editingId, input);
    } else {
      await api.createCamera(input);
    }
    setEditing(null);
    setEditingId(null);
    await refresh();
  };

  const removeCamera = async (cam: AdminCamera) => {
    await api.deleteCamera(cam.id);
    setConfirming(null);
    await refresh();
  };

  if (!checked) return <p className="loading">Načítám…</p>;

  if (email === null) {
    return (
      <main className="admin">
        <Login onSuccess={setEmail} />
      </main>
    );
  }

  return (
    <main className="admin" data-testid="admin-app">
      <header className="topbar">
        <span className="topbar-title">Camera History Admin</span>
        <nav className="topbar-nav">
          <a href="#/cameras" data-testid="nav-cameras">
            Kamery
          </a>
          <a href="#/billing" data-testid="nav-billing">
            Billing
          </a>
        </nav>
        <span className="topbar-user">{email}</span>
        <button className="secondary" onClick={logout} data-testid="logout">
          Odhlásit
        </button>
      </header>
      {view === "billing" ? (
        <BillingPage />
      ) : (
        <section className="panel">
        <div className="panel-head">
          <h2>Kamery</h2>
          <button
            onClick={() => {
              setEditingId(null);
              setEditing(emptyInput());
            }}
            data-testid="add-camera"
          >
            + Nová kamera
          </button>
        </div>
        <table className="cameras">
          <thead>
            <tr>
              <th>Název</th>
              <th>Typ</th>
              <th>Povolena</th>
              <th>Stav</th>
              <th>Poslední snímek</th>
              <th>Chyba</th>
              <th>Náhled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cameras.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  Žádné kamery.
                </td>
              </tr>
            )}
            {cameras.map((cam) => (
              <CameraRow
                key={cam.id}
                cam={cam}
                onEdit={() => {
                  setEditingId(cam.id);
                  setEditing(toInput(cam));
                }}
                onDelete={() => setConfirming(cam)}
              />
            ))}
          </tbody>
        </table>
        </section>
      )}
      {editing !== null && (
        <CameraForm
          initial={editing}
          onSave={saveCamera}
          onCancel={() => setEditing(null)}
        />
      )}
      {confirming !== null && (
        <div className="modal">
          <div className="modal-body">
            <p>
              Smazat kameru <strong>{confirming.name}</strong>? Smažou se i všechny snímky.
            </p>
            <div className="form-actions">
              <button className="danger" onClick={() => void removeCamera(confirming)} data-testid="confirm-delete">
                Smazat
              </button>
              <button className="secondary" onClick={() => setConfirming(null)}>
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
