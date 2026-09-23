import { useCallback, useEffect, useState } from "react";
import { api, FEED_LABELS, type AdminCamera } from "./api";
import "./App.css";

const STATUS_LABELS: Record<AdminCamera["status"], string> = {
  operational: "V běhu",
  delayed: "Zpožděno",
  offline: "Výpadek",
};

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

interface RowState {
  previewUrl: string | null;
}

function CameraRow({ cam }: { cam: AdminCamera }) {
  const [preview, setPreview] = useState<RowState>({ previewUrl: null });

  useEffect(() => {
    let active = true;
    api
      .preview(cam.id)
      .then((d) => {
        if (active) setPreview({ previewUrl: d.latest?.url ?? null });
      })
      .catch(() => {
        if (active) setPreview({ previewUrl: null });
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
      <td data-testid={`last-error-${cam.id}`}>{cam.lastError ?? "—"}</td>
      <td>{preview.previewUrl ? <img className="thumb" src={preview.previewUrl} alt={`preview ${cam.name}`} /> : "—"}</td>
    </tr>
  );
}

export function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [cameras, setCameras] = useState<AdminCamera[]>([]);

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
        <span className="topbar-user">{email}</span>
        <button className="secondary" onClick={logout} data-testid="logout">
          Odhlásit
        </button>
      </header>
      <section className="panel">
        <div className="panel-head">
          <h2>Kamery</h2>
          <button className="secondary" onClick={refresh} data-testid="refresh">
            Obnovit
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
            </tr>
          </thead>
          <tbody>
            {cameras.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Žádné kamery.
                </td>
              </tr>
            )}
            {cameras.map((cam) => (
              <CameraRow key={cam.id} cam={cam} />
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
