import { useCallback, useEffect, useRef, useState } from "react";
import { api, FEED_LABELS, FEED_TYPES, INTERVALS, THEMES, THEME_LABELS, type AdminCamera, type CameraInput, type AdminGroup } from "./api";
import { BillingPage } from "./Billing";
import { formatAge, formatBytes } from "./format";
import { DEFAULT_THEME_COLORS, THEME_COLOR_FIELDS, contrastWarnings } from "./theme";
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
  themeColors: null,
  latitude: null,
  longitude: null,
  daylightOnly: false,
  showNight: false,
});

function currentView(): "cameras" | "groups" | "billing" {
  if (window.location.hash.startsWith("#/billing")) return "billing";
  if (window.location.hash.startsWith("#/groups")) return "groups";
  return "cameras";
}

type CameraRoute = { mode: "new" } | { mode: "edit"; id: string } | null;

function parseCameraRoute(hash: string): CameraRoute {
  const match = hash.match(/^#\/cameras\/([^/?#]+)/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]!);
  return id === "new" ? { mode: "new" } : { mode: "edit", id };
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  testId,
  toggleTestId,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
  toggleTestId: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field" htmlFor={id}>
      {label}
      <span className="password-field">
        <input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          data-testid={toggleTestId}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
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
      <PasswordField
        id="login-password"
        label="Password"
        placeholder="Password"
        value={password}
        onChange={setPassword}
        testId="login-password"
        toggleTestId="login-password-toggle"
        autoComplete="current-password"
      />
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
        <span className="field-hint">Lowercase letters, numbers and dashes.</span>
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
      <PasswordField
        id="register-password"
        label="Password"
        placeholder="Password (min 8 characters)"
        value={password}
        onChange={setPassword}
        testId="register-password"
        toggleTestId="register-password-toggle"
        autoComplete="new-password"
      />
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

function parseCoordinateInput(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : "invalid";
}

function CameraForm({
  initial,
  onSave,
  onCancel,
  cameraId,
  tenantSlug,
}: {
  initial: CameraInput;
  onSave: (
    input: CameraInput,
    groupUpdates?: { groupId: string; selected: boolean; cameraIds: string[] }[],
  ) => Promise<void>;
  onCancel: () => void;
  cameraId?: string | null;
  tenantSlug: string;
}) {
  const [input, setInput] = useState<CameraInput>(initial);
  const [latitudeText, setLatitudeText] = useState(initial.latitude === null ? "" : String(initial.latitude));
  const [longitudeText, setLongitudeText] = useState(initial.longitude === null ? "" : String(initial.longitude));
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupMemberships, setGroupMemberships] = useState<Record<string, boolean>>({});
  const [initialMemberships, setInitialMemberships] = useState<Record<string, boolean>>({});
  const previewRef = useRef<HTMLIFrameElement | null>(null);
  const [themeSaveState, setThemeSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedThemeRef = useRef(
    JSON.stringify({ theme: initial.theme, colors: initial.themeColors ?? null }),
  );
  const set = (k: keyof CameraInput, v: string | number) => setInput((s) => ({ ...s, [k]: v }));

  const postPreviewTheme = useCallback(() => {
    const frame = previewRef.current;
    if (!frame || !cameraId) return;
    frame.contentWindow?.postMessage?.(
      {
        type: "camera-history:theme",
        theme: input.theme,
        colors:
          input.theme === "custom" ? (input.themeColors ?? DEFAULT_THEME_COLORS) : null,
      },
      window.location.origin,
    );
  }, [cameraId, input.theme, input.themeColors]);

  useEffect(() => {
    postPreviewTheme();
  }, [postPreviewTheme]);

  useEffect(() => {
    if (!cameraId) return;
    const signature = JSON.stringify({
      theme: input.theme,
      colors: input.themeColors ?? null,
    });
    if (signature === savedThemeRef.current) return;
    setThemeSaveState("saving");
    const timer = setTimeout(() => {
      api
        .updateCamera(cameraId, {
          theme: input.theme,
          themeColors:
            input.theme === "custom"
              ? (input.themeColors ?? DEFAULT_THEME_COLORS)
              : input.themeColors,
        })
        .then(() => {
          savedThemeRef.current = signature;
          setThemeSaveState("saved");
        })
        .catch(() => setThemeSaveState("error"));
    }, 500);
    return () => clearTimeout(timer);
  }, [cameraId, input.theme, input.themeColors]);

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
    setError(null);
    const latitude = parseCoordinateInput(latitudeText);
    const longitude = parseCoordinateInput(longitudeText);
    if (latitude === "invalid" || (latitude !== null && (latitude < -90 || latitude > 90))) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (longitude === "invalid" || (longitude !== null && (longitude < -180 || longitude > 180))) {
      setError("Longitude must be between -180 and 180.");
      return;
    }
    if (input.daylightOnly && (latitude === null || longitude === null)) {
      setError("Latitude and longitude are required to capture only during daylight.");
      return;
    }
    const payload: CameraInput = { ...input, latitude, longitude };
    try {
      const updates = groups
        .filter((g) => (groupMemberships[g.id] || false) !== (initialMemberships[g.id] || false))
        .map((g) => ({ groupId: g.id, selected: groupMemberships[g.id] || false, cameraIds: g.cameraIds }));
      await onSave(payload, updates.length > 0 ? updates : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <section className="panel camera-editor" data-testid="camera-editor">
      <div className="panel-head">
        <h2>{initial.name ? "Edit camera" : "New camera"}</h2>
        <button type="button" className="secondary" onClick={onCancel} data-testid="form-back">
          ← Back to cameras
        </button>
      </div>
      <div className="camera-editor-body">
        <form className="camera-form" onSubmit={submit} data-testid="camera-form">
          {error && (
          <p className="error" data-testid="form-error">
            {error}
          </p>
        )}
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
          <select
            value={input.theme}
            onChange={(e) => {
              const next = e.target.value;
              setInput((state) => ({
                ...state,
                theme: next,
                themeColors:
                  next === "custom" ? (state.themeColors ?? DEFAULT_THEME_COLORS) : state.themeColors,
              }));
            }}
            data-testid="form-theme"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {input.theme === "custom" && (
          <div className="form-section" data-testid="custom-theme-fields">
            <h4>Custom theme colors</h4>
            <div className="color-grid">
              {THEME_COLOR_FIELDS.map(({ key, label }) => {
                const colors = input.themeColors ?? DEFAULT_THEME_COLORS;
                return (
                  <label key={key} className="color-field">
                    <span>{label}</span>
                    <span className="color-input">
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={(e) =>
                          setInput((state) => ({
                            ...state,
                            themeColors: {
                              ...(state.themeColors ?? DEFAULT_THEME_COLORS),
                              [key]: e.target.value,
                            },
                          }))
                        }
                        data-testid={`form-color-${key}`}
                        aria-label={label}
                      />
                      <code>{colors[key]}</code>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="cell-actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setInput((state) => ({ ...state, themeColors: { ...DEFAULT_THEME_COLORS } }))
                }
                data-testid="form-color-reset"
              >
                Reset to light
              </button>
            </div>
            {contrastWarnings(input.themeColors ?? DEFAULT_THEME_COLORS).length > 0 && (
              <p className="notice danger" data-testid="contrast-warnings">
                Low contrast:{" "}
                {contrastWarnings(input.themeColors ?? DEFAULT_THEME_COLORS).join(", ")}. Text may be
                hard to read.
              </p>
            )}
            <span className="field-hint">Custom colors apply in the widget after saving.</span>
          </div>
        )}
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
        <div className="form-section">
          <h4>Location &amp; schedule</h4>
          <div className="form-row">
            <label>
              Latitude
              <input
                type="number"
                step="0.001"
                value={latitudeText}
                onChange={(e) => setLatitudeText(e.target.value)}
                data-testid="form-latitude"
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="0.001"
                value={longitudeText}
                onChange={(e) => setLongitudeText(e.target.value)}
                data-testid="form-longitude"
              />
            </label>
          </div>
          <span className="field-hint">Used to filter day/night images</span>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={input.daylightOnly}
              onChange={(e) => setInput((s) => ({ ...s, daylightOnly: e.target.checked }))}
              data-testid="form-daylight-only"
            />
            Capture only during daylight
          </label>
          <span className="field-hint">
            Requires latitude and longitude. The camera's active window is ignored while enabled.
          </span>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={input.showNight}
              onChange={(e) => setInput((s) => ({ ...s, showNight: e.target.checked }))}
              data-testid="form-show-night"
            />
            Show night images by default
          </label>
          <span className="field-hint">Night images are shown in the widget only when this is enabled.</span>
        </div>
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
        <aside className="camera-preview">
          <div className="panel-head">
            <h3>Live preview</h3>
            <span className="ts-chip">PREVIEW</span>
          </div>
          {cameraId && tenantSlug ? (
            <iframe
              ref={previewRef}
              data-testid="camera-preview"
              src={`${window.location.origin}/widget/${tenantSlug}/${cameraId}${
                input.theme === "custom" ? "" : `?theme=${encodeURIComponent(input.theme)}`
              }`}
              onLoad={postPreviewTheme}
              title="Camera preview"
              loading="lazy"
              style={{ width: "100%", height: 640, border: 0, borderRadius: 8 }}
            />
          ) : (
            <p className="field-hint">Save the camera to see its live preview.</p>
          )}
          {cameraId && themeSaveState !== "idle" && (
            <p className="field-hint" data-testid="theme-save-state">
              {themeSaveState === "saving"
                ? "Saving theme…"
                : themeSaveState === "saved"
                  ? "Theme saved"
                  : "Theme save failed"}
            </p>
          )}
          <p className="field-hint">
            Theme changes apply to the preview instantly and are saved automatically. Other settings
            apply after saving.
          </p>
        </aside>
      </div>
    </section>
  );
}

function CameraSummary({ cameras }: { cameras: AdminCamera[] }) {
  const images = cameras.reduce((total, cam) => total + (cam.imageCount ?? 0), 0);
  const bytes = cameras.reduce((total, cam) => total + (cam.totalBytes ?? 0), 0);
  const oldest =
    cameras
      .map((cam) => cam.firstCaptureAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;

  return (
    <div className="camera-summary" data-testid="camera-summary">
      <div>
        <span>Cameras</span>
        <strong>{cameras.length}</strong>
      </div>
      <div>
        <span>Images collected</span>
        <strong data-testid="summary-images">{images.toLocaleString()}</strong>
      </div>
      <div>
        <span>Stored</span>
        <strong data-testid="summary-bytes">{formatBytes(bytes)}</strong>
      </div>
      <div>
        <span>Collecting since</span>
        <strong data-testid="summary-since">
          {oldest ? new Date(oldest).toLocaleDateString() : "—"}
        </strong>
      </div>
    </div>
  );
}

function CameraCard({
  cam,
  onEdit,
  onDelete,
}: {
  cam: AdminCamera;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [thumbError, setThumbError] = useState(false);

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

  const showThumb = previewUrl && !thumbError;

  return (
    <article className="camera-card" data-testid={`camera-${cam.id}`}>
      <div className="camera-media">
        {showThumb ? (
          <>
            {!thumbLoaded && <span className="camera-media-placeholder">Loading preview…</span>}
            <img
              className={`camera-thumb${thumbLoaded ? "" : " thumb-hidden"}`}
              src={previewUrl}
              alt={`preview ${cam.name}`}
              ref={(node) => {
                if (node?.complete) setThumbLoaded(true);
              }}
              onLoad={() => setThumbLoaded(true)}
              onError={() => setThumbError(true)}
            />
          </>
        ) : (
          <span className="camera-media-placeholder">No preview yet</span>
        )}
        <span className={`pill pill-${cam.status}`} data-testid={`status-${cam.id}`}>
          {STATUS_LABELS[cam.status]}
        </span>
      </div>
      <div className="camera-card-body">
        <div className="camera-card-head">
          <h3 className="cell-name">{cam.name}</h3>
          <span className={`pill ${cam.enabled ? "pill-operational" : "pill-neutral"}`}>
            {cam.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p className="camera-meta">
          {FEED_LABELS[cam.feedType]} · every {cam.intervalMinutes} min · {cam.timezone}
        </p>
        <dl className="camera-stats">
          <div>
            <dt>Images</dt>
            <dd data-testid={`camera-images-${cam.id}`}>{(cam.imageCount ?? 0).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Stored</dt>
            <dd data-testid={`camera-bytes-${cam.id}`}>{formatBytes(cam.totalBytes ?? 0)}</dd>
          </div>
          <div>
            <dt>Running</dt>
            <dd data-testid={`camera-running-${cam.id}`}>{formatAge(cam.firstCaptureAt ?? null)}</dd>
          </div>
          <div>
            <dt>Last capture</dt>
            <dd>{cam.lastCaptureAt ? new Date(cam.lastCaptureAt).toLocaleString() : "—"}</dd>
          </div>
        </dl>
        {cam.firstCaptureAt && (
          <p className="camera-since">
            Since {new Date(cam.firstCaptureAt).toLocaleDateString()}
          </p>
        )}
        <p className="cell-error camera-error" data-testid={`last-error-${cam.id}`}>
          {cam.lastError ? <span className="cell-error-text">{cam.lastError}</span> : <span className="dash">—</span>}
        </p>
        <div className="camera-actions">
          <button className="secondary" onClick={onEdit} data-testid={`edit-${cam.id}`}>
            Edit
          </button>
          <button className="danger" onClick={onDelete} data-testid={`delete-${cam.id}`}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function embedSrc(tenantSlug: string, slug: string): string {
  return `${window.location.origin}/group/${tenantSlug}/${slug}`;
}

function GroupsView({
  cameras,
  groups,
  loading,
  tenantSlug,
  onGroupsChange,
}: {
  cameras: AdminCamera[];
  groups: AdminGroup[];
  loading: boolean;
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
    const scriptUrl = `${window.location.origin}/embed.js`;
    const snippet = `<script src="${scriptUrl}" defer></script>\n<iframe src="${url}" style="width:100%;height:720px;border:0;border-radius:12px" loading="lazy"></iframe>`;
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
        loading ? (
          <p className="loading">Loading…</p>
        ) : (
          <p className="empty" data-testid="groups-empty">
            No groups yet. Create a group to embed its camera page on your site.
          </p>
        )
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
  const [cameraRoute, setCameraRoute] = useState<CameraRoute>(() => parseCameraRoute(window.location.hash));
  const [confirming, setConfirming] = useState<AdminCamera | null>(null);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [camerasLoading, setCamerasLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [tenantSlug, setTenantSlug] = useState<string>("");
  const [view, setView] = useState<"cameras" | "groups" | "billing">(currentView);
  const [registering, setRegistering] = useState(() => window.location.hash.startsWith("#/register"));
  const [groupNotice, setGroupNotice] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setView(currentView());
      setRegistering(window.location.hash.startsWith("#/register"));
      setCameraRoute(parseCameraRoute(window.location.hash));
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

  const reloadGroups = useCallback(
    () =>
      api
        .listGroups()
        .then(setGroups)
        .catch(() => undefined)
        .finally(() => setGroupsLoading(false)),
    [],
  );

  useEffect(() => {
    if (view === "groups") reloadGroups();
  }, [view, reloadGroups]);

  useEffect(() => {
    if (email === null) return;
    api
      .getTenant()
      .then((t) => setTenantSlug(t.slug))
      .catch(() => setTenantSlug(""));
  }, [email]);

  const refresh = useCallback(() => {
    api
      .listCameras()
      .then(setCameras)
      .catch(() => setCameras([]))
      .finally(() => setCamerasLoading(false));
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
    themeColors: cam.themeColors ?? null,
    latitude: cam.latitude ?? null,
    longitude: cam.longitude ?? null,
    daylightOnly: cam.daylightOnly ?? false,
    showNight: cam.showNight ?? false,
  });

  const editingId = cameraRoute?.mode === "edit" ? cameraRoute.id : null;
  const editingCamera = editingId ? (cameras.find((camera) => camera.id === editingId) ?? null) : null;
  const editing =
    cameraRoute?.mode === "new"
      ? emptyInput()
      : cameraRoute?.mode === "edit" && editingCamera
        ? toInput(editingCamera)
        : null;

  const openNewCamera = () => {
    setCameraRoute({ mode: "new" });
    if (window.location.hash !== "#/cameras/new") window.location.hash = "#/cameras/new";
  };

  const openCamera = (id: string) => {
    setCameraRoute({ mode: "edit", id });
    if (window.location.hash !== `#/cameras/${id}`) window.location.hash = `#/cameras/${id}`;
  };

  const closeCamera = () => {
    setCameraRoute(null);
    if (window.location.hash !== "#/cameras") window.location.hash = "#/cameras";
  };

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
      closeCamera();
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
         <GroupsView cameras={cameras} groups={groups} loading={groupsLoading} tenantSlug={tenantSlug} onGroupsChange={reloadGroups} />
       ) : cameraRoute !== null ? (
         editing !== null ? (
           <CameraForm
             key={editingId ?? "new"}
             initial={editing}
             onSave={saveCamera}
             onCancel={closeCamera}
             cameraId={editingId}
             tenantSlug={tenantSlug}
           />
         ) : camerasLoading ? (
           <p className="loading">Loading…</p>
         ) : (
           <section className="panel camera-editor">
             <div className="panel-head">
               <h2>Camera not found</h2>
               <button className="secondary" onClick={closeCamera} data-testid="camera-not-found-back">
                 ← Back to cameras
               </button>
             </div>
             <p className="empty">This camera does not exist or was removed.</p>
           </section>
         )
       ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Cameras</h2>
            <button onClick={openNewCamera} data-testid="add-camera">
              + New camera
            </button>
          </div>
          {camerasLoading && cameras.length === 0 ? (
            <p className="loading">Loading…</p>
          ) : cameras.length === 0 ? (
            <div className="empty-state" data-testid="empty-state">
              <p className="empty-title">No cameras yet</p>
              <p>Add your first camera to start building its history.</p>
              <button onClick={openNewCamera} data-testid="empty-add-camera">
                Add your first camera
              </button>
            </div>
          ) : (
            <>
              <CameraSummary cameras={cameras} />
              <div className="camera-grid">
                {cameras.map((cam) => (
                  <CameraCard
                    key={cam.id}
                    cam={cam}
                    onEdit={() => openCamera(cam.id)}
                    onDelete={() => setConfirming(cam)}
                  />
                ))}
              </div>
            </>
          )}
        </section>
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
