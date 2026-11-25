import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, FEED_LABELS, FEED_TYPES, SESSION_EXPIRED_EVENT, THEMES, THEME_LABELS, type AdminCamera, type CameraInput, type AdminGroup, type BillingStatus } from "./api";
import { AuthSplash, Login, Register } from "./Auth";
import { BillingPage } from "./Billing";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmbedCodePanel } from "./EmbedCodePanel";
import { cameraEmbedId, cameraEmbedSrc, embedSnippet } from "./embed";
import { formatAge, formatDate, formatDateTime } from "./format";
import { GroupEditor, GroupsView, type GroupInput } from "./Groups";
import { PageHeader } from "./PageHeader";
import { SLUG_RE, slugify } from "./slug";
import { DEFAULT_THEME_COLORS, THEME_COLOR_FIELDS, contrastWarnings } from "./theme";
import "./App.css";

const STATUS_LABELS: Record<AdminCamera["status"], string> = {
  operational: "Operational",
  delayed: "Delayed",
  offline: "Offline",
};

const PACKAGE_LABELS: Record<string, string> = {
  solo: "Solo",
  starter: "Starter",
  plus: "Plus",
  pro: "Pro",
  network: "Network",
};

const emptyInput = (): CameraInput => ({
  name: "",
  slug: "",
  feedType: "static_url",
  feedUrl: "",
  intervalMinutes: 60,
  activeFrom: "00:00",
  activeTo: "23:59",
  timezone: "UTC",
  theme: "light",
  themeColors: null,
  timeFormat: "12h",
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

type GroupRoute = { mode: "new" } | { mode: "edit"; id: string } | null;

function parseGroupRoute(hash: string): GroupRoute {
  const match = hash.match(/^#\/groups\/([^/?#]+)/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]!);
  return id === "new" ? { mode: "new" } : { mode: "edit", id };
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
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const initialSnapshot = useRef({
    name: initial.name,
    slug: initial.slug,
    feedType: initial.feedType,
    feedUrl: initial.feedUrl,
    activeFrom: initial.activeFrom,
    activeTo: initial.activeTo,
    timezone: initial.timezone,
    timeFormat: initial.timeFormat,
    daylightOnly: initial.daylightOnly,
    showNight: initial.showNight,
    latitude: initial.latitude,
    longitude: initial.longitude,
  });
  const [fieldErrors, setFieldErrors] = useState<{
    slug?: string;
    latitude?: string;
    longitude?: string;
    daylight?: string;
  }>({});
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupMemberships, setGroupMemberships] = useState<Record<string, boolean>>({});
  const [initialMemberships, setInitialMemberships] = useState<Record<string, boolean>>({});
  const previewRef = useRef<HTMLIFrameElement | null>(null);
  const [themeSaveState, setThemeSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedThemeRef = useRef(
    JSON.stringify({ theme: initial.theme, colors: initial.themeColors ?? null }),
  );
  const set = (k: keyof CameraInput, v: string | number) => {
    setInput((s) => ({ ...s, [k]: v }));
  };

  const dirty = useMemo(() => {
    const initialValues = initialSnapshot.current;
    const latitude = parseCoordinateInput(latitudeText);
    const longitude = parseCoordinateInput(longitudeText);
    const coordinatesChanged =
      (latitude === "invalid" ? latitudeText.trim() !== "" : latitude !== initialValues.latitude) ||
      (longitude === "invalid" ? longitudeText.trim() !== "" : longitude !== initialValues.longitude);
    const membershipsChanged = groups.some(
      (group) =>
        Boolean(groupMemberships[group.id]) !== Boolean(initialMemberships[group.id]),
    );

    return (
      input.name !== initialValues.name ||
      input.slug !== initialValues.slug ||
      input.feedType !== initialValues.feedType ||
      input.feedUrl !== initialValues.feedUrl ||
      input.activeFrom !== initialValues.activeFrom ||
      input.activeTo !== initialValues.activeTo ||
      input.timezone !== initialValues.timezone ||
      input.timeFormat !== initialValues.timeFormat ||
      input.daylightOnly !== initialValues.daylightOnly ||
      input.showNight !== initialValues.showNight ||
      coordinatesChanged ||
      membershipsChanged
    );
  }, [input, latitudeText, longitudeText, groups, groupMemberships, initialMemberships]);

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
    const nextErrors: typeof fieldErrors = {};
    if (!input.slug || input.slug.length > 40 || !SLUG_RE.test(input.slug)) {
      nextErrors.slug = "Slug must be 1–40 lowercase letters, numbers and dashes.";
    }
    if (latitude === "invalid" || (latitude !== null && (latitude < -90 || latitude > 90))) {
      nextErrors.latitude = "Latitude must be between -90 and 90.";
    }
    if (longitude === "invalid" || (longitude !== null && (longitude < -180 || longitude > 180))) {
      nextErrors.longitude = "Longitude must be between -180 and 180.";
    }
    if (input.daylightOnly && (latitude === null || longitude === null)) {
      nextErrors.daylight = "Latitude and longitude are required to capture only during daylight.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }, 0);
      return;
    }
    const payload: CameraInput = {
      ...input,
      latitude: typeof latitude === "number" ? latitude : null,
      longitude: typeof longitude === "number" ? longitude : null,
    };
    try {
      const updates = groups
        .filter((g) => (groupMemberships[g.id] || false) !== (initialMemberships[g.id] || false))
        .map((g) => ({ groupId: g.id, selected: groupMemberships[g.id] || false, cameraIds: g.cameraIds }));
      await onSave(payload, updates.length > 0 ? updates : undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      if (/slug already taken/i.test(message)) {
        setFieldErrors((current) => ({
          ...current,
          slug: "This slug is already used by another camera.",
        }));
      }
      setError(message);
    }
  };

  const requestCancel = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onCancel();
  };

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const embedId = cameraId && tenantSlug ? cameraEmbedId(tenantSlug, cameraId) : "";
  const embedCode =
    cameraId && tenantSlug
      ? embedSnippet(
          cameraEmbedSrc(tenantSlug, input.slug || cameraId),
          embedId,
          `${initial.name || "Camera"} — Camera History`,
        )
      : "";

  return (
    <section className="panel camera-editor" data-testid="camera-editor">
      <header className="editor-head">
        <button
          type="button"
          className="link editor-back"
          onClick={requestCancel}
          data-testid="form-back"
        >
          ← Back to cameras
        </button>
        <div className="editor-head-row">
          <div>
            <p className="page-kicker">Cameras</p>
            <h1>{initial.name ? "Edit camera" : "New camera"}</h1>
          </div>
          <span
            className={`editor-save-state${dirty ? " is-dirty" : ""}`}
            role="status"
            aria-live="polite"
          >
            {dirty ? "Unsaved changes" : cameraId ? "Saved" : "Not saved yet"}
          </span>
        </div>
      </header>
      <div className="camera-editor-body">
        <form className="camera-form" onSubmit={submit} data-testid="camera-form">
          {error && (
            <p className="error" data-testid="form-error">
              {error}
            </p>
          )}

          <section className="form-section">
            <h4>Basics</h4>
            <label>
              Name
              <input
                value={input.name}
                onChange={(e) => {
                  const next = e.target.value;
                  set("name", next);
                  if (!slugTouched) {
                    setInput((state) => ({ ...state, slug: slugify(next) }));
                  }
                }}
                data-testid="form-name"
                maxLength={80}
                required
              />
            </label>
            <label>
              Slug
              <input
                value={input.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                  setFieldErrors((current) => ({ ...current, slug: undefined }));
                }}
                data-testid="form-slug"
                aria-invalid={Boolean(fieldErrors.slug)}
                aria-describedby={fieldErrors.slug ? "camera-slug-error" : undefined}
                maxLength={40}
                required
              />
              {fieldErrors.slug && (
                <span className="field-error" id="camera-slug-error">
                  {fieldErrors.slug}
                </span>
              )}
              <span className="field-hint">
                Used in the camera embed URL. Changes apply after saving.
              </span>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSlugTouched(false);
                  setInput((state) => ({ ...state, slug: slugify(state.name) }));
                  setFieldErrors((current) => ({ ...current, slug: undefined }));
                }}
                data-testid="form-slug-regenerate"
              >
                Regenerate from name
              </button>
            </label>
            <label>
              Type
              <select
                value={input.feedType}
                onChange={(e) => set("feedType", e.target.value)}
                data-testid="form-feed-type"
              >
                {FEED_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FEED_LABELS[t]}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Static image fetches a JPEG URL. MJPEG is a motion-JPEG stream. HLS/RTSP use ffmpeg.
                Custom is a WebSocket that sends JPEG frames.
              </span>
            </label>
            <label>
              Feed URL
              <input
                value={input.feedUrl}
                onChange={(e) => set("feedUrl", e.target.value)}
                data-testid="form-feed-url"
              />
            </label>
          </section>

          <section className="form-section">
            <h4>Schedule</h4>
            <div className="form-row">
              <label>
                Active from
                <input
                  type="time"
                  value={input.activeFrom}
                  onChange={(e) => set("activeFrom", e.target.value)}
                />
              </label>
              <label>
                Active to
                <input
                  type="time"
                  value={input.activeTo}
                  onChange={(e) => set("activeTo", e.target.value)}
                />
              </label>
            </div>
            <label>
              Timezone
              <input
                value={input.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                data-testid="form-timezone"
              />
              <span className="field-hint">IANA timezone, e.g. Europe/Zurich.</span>
            </label>
            <label>
              Time format
              <select
                value={input.timeFormat}
                onChange={(e) => set("timeFormat", e.target.value)}
                data-testid="form-time-format"
              >
                <option value="12h">12-hour (AM/PM)</option>
                <option value="24h">24-hour</option>
              </select>
              <span className="field-hint">How capture times appear in the widget.</span>
            </label>
          </section>

          <section className="form-section">
            <h4>Location &amp; daylight</h4>
            <div className="form-row">
              <label>
                Latitude
                <input
                  type="number"
                  step="0.001"
                  value={latitudeText}
                  onChange={(e) => {
                    setLatitudeText(e.target.value);
                    setFieldErrors((current) => ({
                      ...current,
                      latitude: undefined,
                      daylight: undefined,
                    }));
                  }}
                  data-testid="form-latitude"
                  aria-invalid={Boolean(fieldErrors.latitude)}
                  aria-describedby={fieldErrors.latitude ? "latitude-error" : undefined}
                />
                {fieldErrors.latitude && (
                  <span className="field-error" id="latitude-error">
                    {fieldErrors.latitude}
                  </span>
                )}
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="0.001"
                  value={longitudeText}
                  onChange={(e) => {
                    setLongitudeText(e.target.value);
                    setFieldErrors((current) => ({
                      ...current,
                      longitude: undefined,
                      daylight: undefined,
                    }));
                  }}
                  data-testid="form-longitude"
                  aria-invalid={Boolean(fieldErrors.longitude)}
                  aria-describedby={fieldErrors.longitude ? "longitude-error" : undefined}
                />
                {fieldErrors.longitude && (
                  <span className="field-error" id="longitude-error">
                    {fieldErrors.longitude}
                  </span>
                )}
              </label>
            </div>
            <span className="field-hint">Used to filter day/night images</span>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={input.daylightOnly}
                onChange={(e) => {
                  setFieldErrors((current) => ({ ...current, daylight: undefined }));
                  setInput((s) => ({ ...s, daylightOnly: e.target.checked }));
                }}
                data-testid="form-daylight-only"
                aria-invalid={Boolean(fieldErrors.daylight)}
                aria-describedby={fieldErrors.daylight ? "daylight-error" : undefined}
              />
              Capture only during daylight
            </label>
            {fieldErrors.daylight && (
              <span className="field-error" id="daylight-error" role="alert">
                {fieldErrors.daylight}
              </span>
            )}
            <span className="field-hint" data-testid="form-daylight-state">
              {input.daylightOnly
                ? "Current: daylight-only capture."
                : "Current: 24-hour capture. Night images stay hidden in the widget unless enabled below."}
            </span>
            <span className="field-hint">
              Requires latitude and longitude. The camera&apos;s active window is ignored while enabled.
            </span>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={input.showNight}
                onChange={(e) => {
                  setInput((s) => ({ ...s, showNight: e.target.checked }));
                }}
                data-testid="form-show-night"
              />
              Show night images
            </label>
            <span className="field-hint">
              Night images are shown in the widget only when this is enabled.
            </span>
          </section>

          {groups.length > 0 && (
            <section className="form-section">
              <h4>Groups</h4>
              {groups.map((g) => (
                <label key={g.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    data-testid={`group-checkbox-${g.id}`}
                    checked={groupMemberships[g.id] || false}
                    onChange={(e) => {
                      setGroupMemberships((s) => ({ ...s, [g.id]: e.target.checked }));
                    }}
                  />
                  {g.name}
                </label>
              ))}
            </section>
          )}

          <section className="form-section">
            <h4>Theme</h4>
            <div className="theme-options" role="group" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`theme-option${input.theme === t ? " is-selected" : ""}`}
                  aria-pressed={input.theme === t}
                  data-testid={`form-theme-${t}`}
                  onClick={() => {
                    setInput((state) => ({
                      ...state,
                      theme: t,
                      themeColors:
                        t === "custom"
                          ? (state.themeColors ?? DEFAULT_THEME_COLORS)
                          : state.themeColors,
                    }));
                  }}
                >
                  {THEME_LABELS[t]}
                </button>
              ))}
            </div>
            {input.theme === "custom" && (
              <div className="form-subsection" data-testid="custom-theme-fields">
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
                      setInput((state) => ({
                        ...state,
                        themeColors: { ...DEFAULT_THEME_COLORS },
                      }))
                    }
                    data-testid="form-color-reset"
                  >
                    Reset to light
                  </button>
                </div>
                {contrastWarnings(input.themeColors ?? DEFAULT_THEME_COLORS).length > 0 && (
                  <p className="notice danger" data-testid="contrast-warnings">
                    Low contrast:{" "}
                    {contrastWarnings(input.themeColors ?? DEFAULT_THEME_COLORS).join(", ")}. Text may
                    be hard to read.
                  </p>
                )}
                <span className="field-hint">
                  Custom colors apply in the widget after saving.
                </span>
              </div>
            )}
          </section>

          <div className="form-actions editor-actions">
            <button type="submit" data-testid="form-submit">
              Save
            </button>
            <button
              type="button"
              className="secondary"
              onClick={requestCancel}
              data-testid="form-cancel"
            >
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
              src={`${window.location.origin}/widget/${tenantSlug}/${cameraId}?${
                input.theme === "custom" ? "" : `theme=${encodeURIComponent(input.theme)}&`
              }noembed=1`}
              onLoad={postPreviewTheme}
              title="Camera preview"
              loading="lazy"
              data-camera-history-preview="1"
              style={{ width: "100%", height: 520, border: 0, borderRadius: 8 }}
            />
          ) : (
            <p className="field-hint">Save the camera to see its live preview.</p>
          )}
          <p className="field-hint" data-testid="preview-fallback-hint">
            If today has no captures, the preview shows the latest available day.
          </p>
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
          <p className="field-hint" data-testid="camera-history">
            History · 12 months included.
          </p>
          {cameraId && tenantSlug ? (
            <EmbedCodePanel
              code={embedCode}
              id={embedId}
              hint="Share your page URL with"
              suffix="to scroll straight to this camera."
              testId="camera-embed"
            />
          ) : (
            <p className="field-hint">Save the camera to get its embed code.</p>
          )}
        </aside>
      </div>
    </section>
  );
}


function CameraSummary({
  cameras,
  limit,
  packageCode,
}: {
  cameras: AdminCamera[];
  limit: number;
  packageCode: string | null;
}) {
  const images = cameras.reduce((total, cam) => total + (cam.imageCount ?? 0), 0);
  const oldest =
    cameras
      .map((cam) => cam.firstCaptureAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  const planName = packageCode ? (PACKAGE_LABELS[packageCode] ?? packageCode) : "—";
  const atLimit = cameras.length >= limit;

  return (
    <div className="camera-summary" data-testid="camera-summary">
      <div className="camera-summary-stat">
        <span>Cameras</span>
        <strong>
          {cameras.length} <span className="summary-limit">/ {limit}</span>
        </strong>
      </div>
      <div className="camera-summary-stat">
        <span>Images collected</span>
        <strong data-testid="summary-images">{images.toLocaleString()}</strong>
      </div>
      <div className="camera-summary-stat">
        <span>Collecting since</span>
        <strong data-testid="summary-since">
          {formatDate(oldest)}
        </strong>
      </div>
      <div className="camera-summary-stat camera-summary-plan">
        <span>Plan</span>
        <strong data-testid="summary-plan">{planName}</strong>
        {atLimit && (
          <a href="#/billing" title="Upgrade in Billing">
            Upgrade in Billing
          </a>
        )}
      </div>
    </div>
  );
}

function CameraCard({
  cam,
  tenantSlug,
  onEdit,
  onDelete,
}: {
  cam: AdminCamera;
  tenantSlug: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current);
    },
    [],
  );

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

  const copyEmbed = () => {
    if (!tenantSlug) return;
    const id = cameraEmbedId(tenantSlug, cam.id);
    const snippet = embedSnippet(
      cameraEmbedSrc(tenantSlug, cam.slug || cam.id),
      id,
      `${cam.name} — Camera History`,
    );
    const clip = navigator.clipboard;
    if (!clip?.writeText) return;
    void clip
      .writeText(snippet)
      .then(() => {
        setCopied(true);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => setCopied(false));
  };

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
          <div className="camera-card-name">
            <h3 className="cell-name">{cam.name}</h3>
            <span className="camera-slug">{cam.slug}</span>
          </div>
          <span className={`pill ${cam.enabled ? "pill-operational" : "pill-neutral"}`}>
            {cam.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p className="camera-meta">
          {FEED_LABELS[cam.feedType]} · hourly · {cam.timezone} ·{" "}
          {cam.timeFormat === "24h" ? "24h" : "12h"}
        </p>
        <dl className="camera-stats">
          <div>
            <dt>Images</dt>
            <dd data-testid={`camera-images-${cam.id}`}>{(cam.imageCount ?? 0).toLocaleString()}</dd>
          </div>
          <div>
            <dt>History</dt>
            <dd data-testid={`camera-history-${cam.id}`}>12 months</dd>
          </div>
          <div>
            <dt>Running</dt>
            <dd data-testid={`camera-running-${cam.id}`}>{formatAge(cam.firstCaptureAt ?? null)}</dd>
          </div>
          <div>
            <dt>Last capture</dt>
            <dd>{formatDateTime(cam.lastCaptureAt, cam.timezone, cam.timeFormat)}</dd>
          </div>
        </dl>
        {cam.firstCaptureAt && (
          <p className="camera-since">
            Since {formatDate(cam.firstCaptureAt)}
          </p>
        )}
        <p
          className={`cell-error camera-error ${cam.lastError ? "camera-error-active" : "camera-error-clear"}`}
          data-testid={`last-error-${cam.id}`}
        >
          {cam.lastError ? (
            <span className="cell-error-text" title={cam.lastError}>
              Last error: {cam.lastError}
            </span>
          ) : (
            <span>No errors</span>
          )}
        </p>
        <div className="camera-actions">
          <button
            onClick={copyEmbed}
            data-testid={`embed-${cam.id}`}
            className={copied ? "is-copied" : undefined}
            aria-live="polite"
            disabled={!tenantSlug}
          >
            {copied ? "Copied" : "Copy embed"}
          </button>
          <button className="secondary" onClick={onEdit} data-testid={`edit-${cam.id}`}>
            Edit
          </button>
          <button
            className="danger camera-delete"
            onClick={onDelete}
            data-testid={`delete-${cam.id}`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const emailRef = useRef<string | null>(null);
  const [cameras, setCameras] = useState<AdminCamera[]>([]);
  const [cameraRoute, setCameraRoute] = useState<CameraRoute>(() => parseCameraRoute(window.location.hash));
  const [groupRoute, setGroupRoute] = useState<GroupRoute>(() => parseGroupRoute(window.location.hash));
  const [confirming, setConfirming] = useState<AdminCamera | null>(null);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [camerasLoading, setCamerasLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [camerasError, setCamerasError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string>("");
  const [tenantCameraLimit, setTenantCameraLimit] = useState<number>(3);
  const [tenantBilling, setTenantBilling] = useState<{
    billingStatus: BillingStatus;
    isPilot: boolean;
    pilotUntil: string | null;
    packageCode: string;
  } | null>(null);
  const [view, setView] = useState<"cameras" | "groups" | "billing">(currentView);
  const [registering, setRegistering] = useState(() => window.location.hash.startsWith("#/register"));
  const [groupNotice, setGroupNotice] = useState<string | null>(null);
  const [cameraSavedNotice, setCameraSavedNotice] = useState<string | null>(null);
  const [groupSavedNotice, setGroupSavedNotice] = useState<string | null>(null);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [groupVersion, setGroupVersion] = useState(0);

  useEffect(() => {
    emailRef.current = email;
  }, [email]);

  useEffect(() => {
    const onExpired = () => {
      if (emailRef.current === null) return;
      setSessionNotice("Your session expired. Sign in again.");
      setEmail(null);
      setChecked(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  useEffect(() => {
    const onHash = () => {
      setView(currentView());
      setRegistering(window.location.hash.startsWith("#/register"));
      setCameraRoute(parseCameraRoute(window.location.hash));
      setGroupRoute(parseGroupRoute(window.location.hash));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let active = true;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const checkSession = async () => {
      try {
        await api.listCameras();
        if (!active) return;
        setEmail("");
        setChecked(true);
      } catch (err) {
        if (!active) return;
        // A rebuilt API may be unavailable for a few seconds; retry transient
        // failures instead of dropping the user back to the login screen.
        if (!(err instanceof ApiError && err.status === 401) && attempt < 6) {
          attempt += 1;
          timer = setTimeout(() => void checkSession(), 500 * attempt);
          return;
        }
        setEmail(null);
        setChecked(true);
      }
    };

    void checkSession();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  const reloadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      setGroups(await api.listGroups());
    } catch {
      setGroupsError("Groups couldn’t be loaded. Check your connection and try again.");
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "groups") reloadGroups();
  }, [view, reloadGroups]);

  useEffect(() => {
    if (email === null) return;
    api
      .getTenant()
      .then((t) => {
        setTenantSlug(t.slug);
        setTenantCameraLimit(t.cameraLimit);
        setTenantBilling({
          billingStatus: t.billingStatus,
          isPilot: t.isPilot,
          pilotUntil: t.pilotUntil,
          packageCode: t.packageCode,
        });
      })
      .catch(() => {
        setTenantSlug("");
        setTenantBilling(null);
      });
  }, [email, view]);

  const refresh = useCallback(async () => {
    setCamerasLoading(true);
    setCamerasError(null);
    try {
      setCameras(await api.listCameras());
    } catch {
      setCameras([]);
      setCamerasError("Cameras couldn’t be loaded. Check your connection and try again.");
    } finally {
      setCamerasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (email !== null) refresh();
  }, [email, refresh]);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Clear the local session even if the API is unavailable.
    }
    window.location.hash = "";
    setSessionNotice(null);
    setEmail(null);
  };

  const toInput = (cam: AdminCamera): CameraInput => ({
    name: cam.name,
    slug: cam.slug,
    feedType: cam.feedType,
    feedUrl: cam.feedUrl,
    intervalMinutes: 60,
    activeFrom: cam.activeFrom,
    activeTo: cam.activeTo,
    timezone: cam.timezone,
    theme: cam.theme,
    themeColors: cam.themeColors ?? null,
    timeFormat: cam.timeFormat ?? "12h",
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
    setCameraSavedNotice(null);
    setCameraRoute({ mode: "new" });
    if (window.location.hash !== "#/cameras/new") window.location.hash = "#/cameras/new";
  };

  const openCamera = (id: string) => {
    setCameraSavedNotice(null);
    setCameraRoute({ mode: "edit", id });
    if (window.location.hash !== `#/cameras/${id}`) window.location.hash = `#/cameras/${id}`;
  };

  const closeCamera = () => {
    setCameraSavedNotice(null);
    setCameraRoute(null);
    if (window.location.hash !== "#/cameras") window.location.hash = "#/cameras";
  };

  const openNewGroup = () => {
    setGroupSavedNotice(null);
    setGroupRoute({ mode: "new" });
    if (window.location.hash !== "#/groups/new") window.location.hash = "#/groups/new";
  };

  const openGroup = (id: string) => {
    setGroupSavedNotice(null);
    setGroupRoute({ mode: "edit", id });
    if (window.location.hash !== `#/groups/${id}`) window.location.hash = `#/groups/${id}`;
  };

  const closeGroup = () => {
    setGroupSavedNotice(null);
    setGroupRoute(null);
    if (window.location.hash !== "#/groups") window.location.hash = "#/groups";
  };

  const saveGroup = async (input: GroupInput) => {
    setGroupNotice(null);
    setGroupSavedNotice(null);
    if (groupRoute?.mode === "edit") {
      const current = groups.find((group) => group.id === groupRoute.id);
      if (!current) throw new Error("Group not found");
      if (input.name !== current.name || input.slug !== current.slug) {
        await api.updateGroup(current.id, { name: input.name, slug: input.slug });
      }
      if (input.cameraIds.join(",") !== current.cameraIds.join(",")) {
        await api.setGroupCameras(current.id, input.cameraIds);
      }
      await reloadGroups();
      setGroupVersion((version) => version + 1);
      setGroupSavedNotice("Saved");
      return;
    }

    const created = await api.createGroup({ name: input.name, slug: input.slug });
    let cameraError: Error | null = null;
    try {
      await api.setGroupCameras(created.id, input.cameraIds);
    } catch (err) {
      cameraError = err instanceof Error ? err : new Error("Updating cameras failed");
    }
    await reloadGroups();
    openGroup(created.id);
    setGroupVersion((version) => version + 1);
    if (cameraError) {
      setGroupNotice(`Group created, but the camera order was not saved: ${cameraError.message}`);
    } else {
      setGroupSavedNotice("Saved");
    }
  };

  const saveCamera = async (
    input: CameraInput,
    groupUpdates?: { groupId: string; selected: boolean; cameraIds: string[] }[],
  ) => {
    setGroupNotice(null);
    setCameraSavedNotice(null);
    let camId = editingId;
    if (editingId) {
      await api.updateCamera(editingId, input);
    } else {
      const created = await api.createCamera(input);
      camId = created.id;
    }

    let groupError: Error | null = null;
    if (camId) {
      try {
        for (const upd of groupUpdates ?? []) {
          const has = upd.cameraIds.includes(camId);
          if (upd.selected === has) continue;
          const next = upd.selected ? [...upd.cameraIds, camId] : upd.cameraIds.filter((id) => id !== camId);
          await api.setGroupCameras(upd.groupId, next);
        }
      } catch (err) {
        groupError = err instanceof Error ? err : new Error("Updating groups failed");
      }
    }

    await refresh();
    setCameraVersion((version) => version + 1);
    setCameraSavedNotice("Saved");
    if (!editingId && camId) {
      setCameraRoute({ mode: "edit", id: camId });
      if (window.location.hash !== `#/cameras/${camId}`) window.location.hash = `#/cameras/${camId}`;
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

  if (!checked) return <AuthSplash />;

  if (email === null) {
    return registering ? (
      <Register
        onSuccess={(nextEmail) => {
          setSessionNotice(null);
          setEmail(nextEmail);
        }}
        onSignIn={() => {
          window.location.hash = "";
        }}
      />
    ) : (
      <Login
        notice={sessionNotice}
        onSuccess={(nextEmail) => {
          setSessionNotice(null);
          setEmail(nextEmail);
        }}
        onRegister={() => {
          window.location.hash = "#/register";
        }}
      />
    );
  }

  const pilotEnded =
    Boolean(tenantBilling?.isPilot) &&
    tenantBilling?.pilotUntil !== null &&
    tenantBilling?.pilotUntil !== undefined &&
    new Date(tenantBilling.pilotUntil).getTime() <= Date.now();
  const pilotUntilLabel = tenantBilling?.pilotUntil
    ? formatDate(tenantBilling.pilotUntil)
    : "further notice";
  const pilotActive = Boolean(tenantBilling?.isPilot) && !pilotEnded;

  const accountNotice = (() => {
    if (!tenantBilling) return null;

    if (pilotEnded) {
      return (
        <p className="notice danger" data-testid="account-notice">
          Pilot ended — captures are paused. <a href="mailto:hello@sengycraft.cz">Contact us</a> to continue.
        </p>
      );
    }
    if (tenantBilling.isPilot) {
      return null;
    }
    if (tenantBilling.billingStatus === "none") {
      return (
        <p className="notice danger" data-testid="account-notice">
          Account not activated — captures are paused. <a href="#/billing">Activate billing</a> to start.
        </p>
      );
    }
    if (tenantBilling.billingStatus === "past_due") {
      return (
        <p className="notice danger" data-testid="account-notice">
          Payment past due — captures continue during grace. <a href="#/billing">Update billing</a>.
        </p>
      );
    }
    if (tenantBilling.billingStatus === "unpaid" || tenantBilling.billingStatus === "canceled") {
      return (
        <p className="notice danger" data-testid="account-notice">
          Account inactive — captures are paused. <a href="#/billing">Reactivate billing</a>.
        </p>
      );
    }
    return null;
  })();

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
        <div className="topbar-account">
          {pilotActive && (
            <span
              className="topbar-pilot"
              title={`Pilot account — free until ${pilotUntilLabel}`}
              data-testid="pilot-badge"
            >
              Pilot
              <span className="topbar-pilot-date"> · free until {pilotUntilLabel}</span>
            </span>
          )}
          <span className="topbar-user" title={email}>
            {email}
          </span>
          <button className="secondary topbar-signout" onClick={logout} data-testid="logout">
            Sign out
          </button>
        </div>
      </header>
      <div className="notice-stack">
        {view !== "billing" && accountNotice}
        {groupNotice && (
          <p className="error" data-testid="group-notice">
            {groupNotice}
          </p>
        )}
        {cameraRoute !== null && cameraSavedNotice && (
          <p className="notice" data-testid="camera-saved">
            {cameraSavedNotice}
          </p>
        )}
        {groupRoute !== null && groupSavedNotice && (
          <p className="notice" data-testid="group-saved">
            {groupSavedNotice}
          </p>
        )}
      </div>
       {view === "billing" ? (
         <BillingPage />
       ) : view === "groups" ? (
         groupRoute !== null ? (
           groupRoute.mode === "new" ? (
             <GroupEditor
               key={`new-${groupVersion}`}
               group={null}
               cameras={cameras}
               tenantSlug={tenantSlug}
               onSave={saveGroup}
               onCancel={closeGroup}
               onOrderSaved={reloadGroups}
             />
           ) : groupsLoading ? (
             <p className="loading">Loading…</p>
           ) : (
             (() => {
               const group = groups.find((item) => item.id === groupRoute.id);
               return group ? (
                 <GroupEditor
                   key={`${group.id}-${groupVersion}`}
                   group={group}
                   cameras={cameras}
                   tenantSlug={tenantSlug}
                   onSave={saveGroup}
                   onCancel={closeGroup}
                   onOrderSaved={reloadGroups}
                 />
               ) : (
                 <section className="panel camera-editor">
                   <div className="panel-head">
                     <h2>Group not found</h2>
                     <button type="button" className="secondary" onClick={closeGroup} data-testid="group-not-found-back">
                       ← Back to groups
                     </button>
                   </div>
                   <p className="empty">This group does not exist or was removed.</p>
                 </section>
               );
             })()
           )
         ) : (
           <GroupsView
              cameras={cameras}
              groups={groups}
              loading={groupsLoading}
              loadError={groupsError}
              onRetry={() => void reloadGroups()}
              onNew={openNewGroup}
              onEdit={(group) => openGroup(group.id)}
              onGroupsChange={reloadGroups}
            />
         )
       ) : cameraRoute !== null ? (
         editing !== null ? (
           <CameraForm
             key={`${editingId ?? "new"}-${cameraVersion}`}
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
        <>
          <PageHeader
            title="Cameras"
            description="Add feeds, watch their status and grab the embed code for your site."
          >
            <div className="page-action-stack">
              <button
                onClick={openNewCamera}
                data-testid="add-camera"
                className={cameras.length >= tenantCameraLimit ? "secondary" : undefined}
                disabled={cameras.length >= tenantCameraLimit}
                title={
                  cameras.length >= tenantCameraLimit
                    ? "Camera limit reached. Upgrade in Billing."
                    : undefined
                }
              >
                + New camera
              </button>
              {cameras.length >= tenantCameraLimit && (
                <span className="page-action-hint">
                  {cameras.length} / {tenantCameraLimit} cameras · <a href="#/billing">Upgrade</a>
                </span>
              )}
            </div>
          </PageHeader>
          <section className="panel">
            {camerasLoading && cameras.length === 0 ? (
              <div className="camera-grid" data-testid="cameras-skeleton" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <div className="camera-card skeleton-card" key={index}>
                    <div className="skeleton-media" />
                    <div className="skeleton-body">
                      <span className="skeleton-line skeleton-line-title" />
                      <span className="skeleton-line" />
                      <span className="skeleton-line skeleton-line-short" />
                      <span className="skeleton-line skeleton-line-button" />
                    </div>
                  </div>
                ))}
              </div>
            ) : camerasError && cameras.length === 0 ? (
              <div className="empty-state" data-testid="cameras-error">
                <p className="empty-title">Cameras couldn’t be loaded.</p>
                <p>{camerasError}</p>
                <button onClick={() => void refresh()}>Try again</button>
              </div>
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
                <CameraSummary
                  cameras={cameras}
                  limit={tenantCameraLimit}
                  packageCode={tenantBilling?.packageCode ?? null}
                />
                <div className="camera-grid">
                  {cameras.map((cam) => (
                    <CameraCard
                      key={cam.id}
                      cam={cam}
                      tenantSlug={tenantSlug}
                      onEdit={() => openCamera(cam.id)}
                      onDelete={() => setConfirming(cam)}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}
      {confirming !== null && (
        <ConfirmDialog
          title="Delete camera?"
          confirmLabel="Delete"
          confirmTestId="confirm-delete"
          onConfirm={() => void removeCamera(confirming)}
          onCancel={() => setConfirming(null)}
        >
          <p>
            Delete camera <strong>{confirming.name}</strong>? This also deletes all of its images.
          </p>
        </ConfirmDialog>
      )}
    </main>
  );
}
