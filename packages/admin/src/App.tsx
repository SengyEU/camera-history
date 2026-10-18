import { useCallback, useEffect, useState } from "react";
import { api, FEED_LABELS, FEED_TYPES, INTERVALS, THEMES, THEME_LABELS, type AdminCamera, type CameraInput, type AdminGroup } from "./api";
import { BillingPage } from "./Billing";
import "./App.css";

const STATUS_LABELS: Record<AdminCamera["status"], string> = {
  operational: "Operational",
  delayed: "Delayed",
  offline: "Offline",
};

const emptyInput = (): CameraInput => ({
  name: "",
  feedType: "static_url",
  feedUrl: "",
  intervalMinutes: 15,
  activeFrom: "00:00",
  activeTo: "23:59",
  timezone: "UTC",
  theme: "light",
});

function currentView(): "cameras" | "groups" | "billing" {
  if (window.location.hash.startsWith("#/billing")) return "billing";
  if (window.location.hash.startsWith("#/groups")) return "groups";
  return "cameras";
}

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
    <form className="auth-card" onSubmit={submit} data-testid="login-form">
      <div className="auth-brand">
        <span className="auth-brand-name">Camera History</span>
        <span className="ts-chip">ADMIN</span>
      </div>
      <h1>Sign in</h1>
      <label className="field" htmlFor="login-email">
        Email
        <input
          id="login-email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="login-email"
        />
      </label>
      <label className="field" htmlFor="login-password">
        Password
        <input
          id="login-password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="login-password"
        />
      </label>
      {error && (
        <p className="error" data-testid="login-error">
          {error}
        </p>
      )}
      <button type="submit" data-testid="login-submit">
        Sign in
      </button>
      <button type="button" className="link" onClick={onRegister} data-testid="goto-register">
        Create account
      </button>
    </form>
  );
}

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
      window.location.hash = "";
      onSuccess(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  return (
    <form className="auth-card" onSubmit={submit} data-testid="register-form">
      <div className="auth-brand">
        <span className="auth-brand-name">Camera History</span>
        <span className="ts-chip">SIGN UP</span>
      </div>
      <h1>Create account</h1>
      <label className="field" htmlFor="register-name">
        Company name
        <input
          id="register-name"
          placeholder="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="register-name"
          required
        />
      </label>
      <label className="field" htmlFor="register-slug">
        Slug
        <input
          id="register-slug"
          placeholder="Slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          data-testid="register-slug"
          required
        />
      </label>
      <label className="field" htmlFor="register-email">
        Email
        <input
          id="register-email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="register-email"
          required
        />
      </label>
      <label className="field" htmlFor="register-password">
        Password
        <input
          id="register-password"
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="register-password"
          required
        />
      </label>
      {error && (
        <p className="error" data-testid="register-error">
          {error}
        </p>
      )}
      <button type="submit" data-testid="register-submit">
        Create account
      </button>
      <button type="button" className="link" onClick={onSignIn} data-testid="goto-signin">
        Already have an account? Sign in
      </button>
    </form>
  );
}

function CameraForm({
  initial,
  onSave,
  onCancel,
  cameraId,
}: {
  initial: CameraInput;
  onSave: (
    input: CameraInput,
    groupUpdates?: { groupId: string; selected: boolean; cameraIds: string[] }[],
  ) => Promise<void>;
  onCancel: () => void;
  cameraId?: string | null;
}) {
  const [input, setInput] = useState<CameraInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupMemberships, setGroupMemberships] = useState<Record<string, boolean>>({});
  const [initialMemberships, setInitialMemberships] = useState<Record<string, boolean>>({});
  const set = (k: keyof CameraInput, v: string | number) => setInput((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    let active = true;
    api
      .listGroups()
      .then((g) => {
        if (active) {
          setGroups(g);
          const initial: Record<string, boolean> = {};
          for (const gr of g) {
            initial[gr.id] = cameraId ? gr.cameraIds.includes(cameraId) : false;
          }
          setGroupMemberships(initial);
          setInitialMemberships(initial);
        }
      })
      .catch(() => {
        if (active) {
          setGroups([]);
          setGroupMemberships({});
          setInitialMemberships({});
        }
      });
    return () => {
      active = false;
    };
  }, [cameraId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updates = groups
        .filter((g) => (groupMemberships[g.id] || false) !== (initialMemberships[g.id] || false))
        .map((g) => ({ groupId: g.id, selected: groupMemberships[g.id] || false, cameraIds: g.cameraIds }));
      await onSave(input, updates.length > 0 ? updates : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="modal">
      <form className="modal-body" onSubmit={submit} data-testid="camera-form">
        <h3>{initial.name ? "Edit camera" : "New camera"}</h3>
        {error && <p className="error">{error}</p>}
        <label>
          Name
          <input value={input.name} onChange={(e) => set("name", e.target.value)} data-testid="form-name" required />
        </label>
        <label>
          Type
          <select value={input.feedType} onChange={(e) => set("feedType", e.target.value)} data-testid="form-feed-type">
            {FEED_TYPES.map((t) => (
              <option key={t} value={t}>
                {FEED_LABELS[t]}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Static image fetches a JPEG URL. MJPEG is a motion-JPEG stream. HLS/RTSP use ffmpeg. Custom is a
            WebSocket that sends JPEG frames.
          </span>
        </label>
        <label>
          Feed URL
          <input value={input.feedUrl} onChange={(e) => set("feedUrl", e.target.value)} data-testid="form-feed-url" />
        </label>
        <label>
          Theme
          <select value={input.theme} onChange={(e) => set("theme", e.target.value)} data-testid="form-theme">
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
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
            Active from
            <input type="time" value={input.activeFrom} onChange={(e) => set("activeFrom", e.target.value)} />
          </label>
          <label>
            Active to
            <input type="time" value={input.activeTo} onChange={(e) => set("activeTo", e.target.value)} />
          </label>
        </div>
        <label>
          Timezone
          <input value={input.timezone} onChange={(e) => set("timezone", e.target.value)} data-testid="form-timezone" />
          <span className="field-hint">IANA timezone, e.g. Europe/Zurich.</span>
        </label>
        {groups.length > 0 && (
          <div className="groups-section">
            <h4>Groups</h4>
            {groups.map((g) => (
              <label key={g.id} className="checkbox-label">
                <input
                  type="checkbox"
                  data-testid={`group-checkbox-${g.id}`}
                  checked={groupMemberships[g.id] || false}
                  onChange={(e) =>
                    setGroupMemberships((s) => ({ ...s, [g.id]: e.target.checked }))
                  }
                />
                {g.name}
              </label>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button type="submit" data-testid="form-submit">
            Save
          </button>
          <button type="button" className="secondary" onClick={onCancel} data-testid="form-cancel">
            Cancel
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
      <td>{cam.enabled ? "yes" : "no"}</td>
      <td>
        <span className={`pill pill-${cam.status}`} data-testid={`status-${cam.id}`}>
          {STATUS_LABELS[cam.status]}
        </span>
      </td>
      <td>
        {cam.lastCaptureAt ? (
          <span className="ts-chip">{new Date(cam.lastCaptureAt).toLocaleString()}</span>
        ) : (
          "—"
        )}
      </td>
      <td data-testid={`last-error-${cam.id}`} className="cell-error">
        {cam.lastError ?? "—"}
      </td>
      <td>{previewUrl ? <img className="thumb" src={previewUrl} alt={`preview ${cam.name}`} /> : "—"}</td>
      <td className="cell-actions">
        <button className="secondary" onClick={onEdit} data-testid={`edit-${cam.id}`}>
          Edit
        </button>
        <button className="danger" onClick={onDelete} data-testid={`delete-${cam.id}`}>
          Delete
        </button>
      </td>
    </tr>
  );
}

function embedSrc(tenantSlug: string, slug: string): string {
  return `${window.location.origin}/group/${tenantSlug}/${slug}`;
}

function GroupsView({
  cameras,
  groups,
  tenantSlug,
  onGroupsChange,
}: {
  cameras: AdminCamera[];
  groups: AdminGroup[];
  tenantSlug: string;
  onGroupsChange: () => void | Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminGroup | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!SLUG_RE.test(slug)) {
      setError("Slug can only contain lowercase letters, numbers and hyphens.");
      return;
    }
    try {
      await api.createGroup({ name, slug });
      setName("");
      setSlug("");
      setSlugTouched(false);
      await onGroupsChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const rename = async (e: React.FormEvent, g: AdminGroup) => {
    e.preventDefault();
    setEditError(null);
    if (!SLUG_RE.test(editSlug)) {
      setEditError("Slug can only contain lowercase letters, numbers and hyphens.");
      return;
    }
    try {
      await api.updateGroup(g.id, { name: editName, slug: editSlug });
      setEditingId(null);
      await onGroupsChange();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const remove = async (g: AdminGroup) => {
    setError(null);
    try {
      await api.deleteGroup(g.id);
      await onGroupsChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const confirmRemove = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    await remove(target);
  };

  const toggleCamera = async (g: AdminGroup, cameraId: string, checked: boolean) => {
    setError(null);
    const next = checked
      ? g.cameraIds.includes(cameraId)
        ? g.cameraIds
        : [...g.cameraIds, cameraId]
      : g.cameraIds.filter((id) => id !== cameraId);
    try {
      await api.setGroupCameras(g.id, next);
      await onGroupsChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Updating cameras failed");
    }
  };

  const copyEmbed = (g: AdminGroup) => {
    if (!tenantSlug) return;
    const url = embedSrc(tenantSlug, g.slug);
    const snippet = `<iframe src="${url}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
    const clip = navigator.clipboard;
    if (!clip?.writeText) return;
    void clip
      .writeText(snippet)
      .then(() => {
        setCopiedId(g.id);
      })
      .catch(() => {
        setCopiedId(null);
      });
  };

  return (
    <section className="panel" data-testid="groups-view">
      <div className="panel-head">
        <h2>Groups</h2>
      </div>
      <form className="group-create" onSubmit={create} data-testid="group-form">
        <input
          placeholder="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="group-name"
          required
        />
        <input
          placeholder="Slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          data-testid="group-slug"
          required
        />
        <button type="submit" data-testid="group-create-submit">
          Create group
        </button>
      </form>
      {error && (
        <p className="error" data-testid="group-error">
          {error}
        </p>
      )}
      {groups.length === 0 ? (
        <p className="empty" data-testid="groups-empty">
          No groups yet. Create a group to embed its camera page on your site.
        </p>
      ) : (
        <ul className="group-list">
          {groups.map((g) => (
            <li key={g.id} className="group-card" data-testid={`group-${g.id}`}>
              {editingId === g.id ? (
                <form className="group-edit" onSubmit={(e) => void rename(e, g)} data-testid="group-edit-form">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    data-testid="group-edit-name"
                    aria-label="Group name"
                    required
                  />
                  <input
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    data-testid="group-edit-slug"
                    aria-label="Group slug"
                    required
                  />
                  {editError && <p className="error">{editError}</p>}
                  <div className="cell-actions">
                    <button type="submit" data-testid="group-edit-save">
                      Save
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setEditingId(null);
                        setEditError(null);
                      }}
                      data-testid="group-edit-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="group-head">
                  <div className="group-meta">
                    <strong>{g.name}</strong>
                    <span className="group-slug">{g.slug}</span>
                    <span className="group-count" data-testid={`group-count-${g.id}`}>
                      {g.cameraIds.length === 1 ? "1 camera" : `${g.cameraIds.length} cameras`}
                    </span>
                  </div>
                  <div className="cell-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditingId(g.id);
                        setEditName(g.name);
                        setEditSlug(g.slug);
                        setEditError(null);
                      }}
                      data-testid={`group-edit-${g.id}`}
                    >
                      Rename
                    </button>
                    <button className="danger" onClick={() => setDeleting(g)} data-testid={`group-delete-${g.id}`}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
              <div className="group-cameras">
                <h4>Cameras in this group</h4>
                {cameras.length === 0 ? (
                  <p className="empty">No cameras yet.</p>
                ) : (
                  cameras.map((cam) => (
                    <label key={cam.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        data-testid={`group-camera-${g.id}-${cam.id}`}
                        checked={g.cameraIds.includes(cam.id)}
                        onChange={(e) => void toggleCamera(g, cam.id, e.target.checked)}
                      />
                      {cam.name}
                    </label>
                  ))
                )}
              </div>
              <div className="group-embed">
                <div className="group-embed-head">
                  <h4>Embed snippet</h4>
                  <span className="ts-chip">EMBED</span>
                </div>
                {tenantSlug ? (
                  <>
                    <iframe
                      data-testid={`group-embed-${g.id}`}
                      src={embedSrc(tenantSlug, g.slug)}
                      title={`${g.name} embed`}
                      width="640"
                      height="360"
                    />
                    <div className="group-embed-actions">
                      <button type="button" className="secondary" onClick={() => copyEmbed(g)} data-testid={`group-copy-${g.id}`}>
                        Copy embed code
                      </button>
                      {copiedId === g.id && <span data-testid={`group-copied-${g.id}`}>Copied</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="embed-placeholder" data-testid={`group-embed-placeholder-${g.id}`}>
                      Tenant not loaded
                    </div>
                    <div className="group-embed-actions">
                      <button type="button" className="secondary" disabled data-testid={`group-copy-${g.id}`}>
                        Copy embed code
                      </button>
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting !== null && (
        <div className="modal">
          <div className="modal-body">
            <p>
              Delete group &quot;{deleting.name}&quot;? Cameras stay — only the group goes away.
            </p>
            <div className="form-actions">
              <button className="danger" onClick={() => void confirmRemove()} data-testid="confirm-delete-group">
                Delete
              </button>
              <button className="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [cameras, setCameras] = useState<AdminCamera[]>([]);
  const [editing, setEditing] = useState<CameraInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminCamera | null>(null);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string>("");
  const [view, setView] = useState<"cameras" | "groups" | "billing">(currentView);
  const [registering, setRegistering] = useState(() => window.location.hash.startsWith("#/register"));
  const [groupNotice, setGroupNotice] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setView(currentView());
      setRegistering(window.location.hash.startsWith("#/register"));
    };
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

  const reloadGroups = useCallback(() => api.listGroups().then(setGroups).catch(() => undefined), []);

  useEffect(() => {
    if (view === "groups") {
      reloadGroups();
      api
        .getTenant()
        .then((t) => setTenantSlug(t.slug))
        .catch(() => setTenantSlug(""));
    }
  }, [view, reloadGroups]);

  const refresh = useCallback(() => {
    api.listCameras().then(setCameras).catch(() => setCameras([]));
  }, []);

  useEffect(() => {
    if (email !== null) refresh();
  }, [email, refresh]);

  const logout = async () => {
    await api.logout();
    window.location.hash = "";
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
    theme: cam.theme,
  });

  const saveCamera = async (
    input: CameraInput,
    groupUpdates?: { groupId: string; selected: boolean; cameraIds: string[] }[],
  ) => {
    setGroupNotice(null);
    let camId = editingId;
    try {
      if (editingId) {
        await api.updateCamera(editingId, input);
      } else {
        const created = await api.createCamera(input);
        camId = created.id;
      }
    } catch (err) {
      throw err;
    }

    const closeAndRefresh = async () => {
      setEditing(null);
      setEditingId(null);
      await refresh();
    };

    if (!camId) {
      await closeAndRefresh();
      return;
    }

    let groupError: Error | null = null;
    try {
      for (const upd of groupUpdates ?? []) {
        const has = upd.cameraIds.includes(camId);
        if (upd.selected === has) continue;
        const next = upd.selected ? [...upd.cameraIds, camId] : upd.cameraIds.filter((id) => id !== camId);
        await api.setGroupCameras(upd.groupId, next);
      }
    } catch (err) {
      groupError = err instanceof Error ? err : new Error("Updating groups failed");
    } finally {
      await closeAndRefresh();
    }
    if (groupError) {
      setGroupNotice(groupError.message || "Updating groups failed");
    }
  };

  const removeCamera = async (cam: AdminCamera) => {
    await api.deleteCamera(cam.id);
    setConfirming(null);
    await refresh();
  };

  if (!checked) return <p className="loading">Loading…</p>;

  if (email === null) {
    return (
      <main className="admin auth-screen">
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

  return (
    <main className="admin" data-testid="admin-app">
      <header className="topbar">
        <span className="topbar-brand">Camera History</span>
        <nav className="topbar-nav">
          <a href="#/cameras" className={view === "cameras" ? "active" : undefined} data-testid="nav-cameras">
            Cameras
          </a>
          <a href="#/groups" className={view === "groups" ? "active" : undefined} data-testid="nav-groups">
            Groups
          </a>
          <a href="#/billing" className={view === "billing" ? "active" : undefined} data-testid="nav-billing">
            Billing
          </a>
        </nav>
        <span className="topbar-user">{email}</span>
        <button className="secondary" onClick={logout} data-testid="logout">
          Sign out
        </button>
      </header>
       {groupNotice && (
         <p className="error" data-testid="group-notice">
           {groupNotice}
         </p>
       )}
       {view === "billing" ? (
         <BillingPage />
       ) : view === "groups" ? (
         <GroupsView cameras={cameras} groups={groups} tenantSlug={tenantSlug} onGroupsChange={reloadGroups} />
       ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Cameras</h2>
            <button
              onClick={() => {
                setEditingId(null);
                setEditing(emptyInput());
              }}
              data-testid="add-camera"
            >
              + New camera
            </button>
          </div>
          <table className="cameras">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Enabled</th>
                <th>Status</th>
                <th>Last capture</th>
                <th>Error</th>
                <th>Preview</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
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
          cameraId={editingId}
        />
      )}
      {confirming !== null && (
        <div className="modal">
          <div className="modal-body">
            <p>
              Delete camera <strong>{confirming.name}</strong>? This also deletes all of its images.
            </p>
            <div className="form-actions">
              <button className="danger" onClick={() => void removeCamera(confirming)} data-testid="confirm-delete">
                Delete
              </button>
              <button className="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
