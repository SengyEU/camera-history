import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCamera, getCameraLatest, getGroup, getImages, type ImageDto, type PublicGroup } from "./api";
import "./App.css";

const THEMES = ["light", "dark", "forest", "midnight"];

function isValidTheme(theme: string): boolean {
  return THEMES.includes(theme);
}

function resolveTheme(query: URLSearchParams, cameraTheme: string | undefined): string {
  const q = query.get("theme");
  if (q && isValidTheme(q)) return q;
  if (cameraTheme && isValidTheme(cameraTheme)) return cameraTheme;
  return "light";
}

function parseWidgetPath(path: string): { tenant: string; cameraId: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "widget" && parts.length === 3) {
    return { tenant: parts[1]!, cameraId: parts[2]! };
  }
  return null;
}

function parseGroupPath(path: string): { tenant: string; slug: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "group" && parts.length === 3) return { tenant: parts[1]!, slug: parts[2]! };
  return null;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface WidgetBodyProps {
  title: string;
  date: string;
  setDate: (d: string) => void;
  theme: string;
  images: ImageDto[];
  minDate?: string;
  switcher?: ReactNode;
  children?: ReactNode;
}

function WidgetBody({ title, date, setDate, theme, images, minDate, switcher, children }: WidgetBodyProps) {
  const [openImage, setOpenImage] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("img") ?? null;
  });
  const [modalUrl, setModalUrl] = useState<string>("");

  const shiftDay = (delta: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(toLocalInputValue(d));
  };

  const buildShareUrl = (img: ImageDto) => {
    const p = new URLSearchParams({ date, img: img.id });
    p.set("theme", theme);
    return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
  };

  const openImg = openImage ? images.find((i) => i.id === openImage) : undefined;

  return (
    <div className="widget" data-testid="widget" data-theme={theme}>
      <div className="widget-header">
        <span className="widget-title">{title}</span>
        {switcher}
        <div className="widget-nav">
          <button onClick={() => shiftDay(-1)} aria-label="Previous day">
            {"<"}
          </button>
          <input
            type="date"
            value={date}
            min={minDate || undefined}
            max={toLocalInputValue(new Date())}
            onChange={(e) => setDate(e.target.value || date)}
          />
          <button onClick={() => shiftDay(1)} aria-label="Next day">
            {">"}
          </button>
        </div>
      </div>
      <div className="widget-grid" data-testid="image-grid">
        {images.length === 0 && <p className="empty">No images for this date.</p>}
        {images.map((img) => (
          <button
            key={img.id}
            className="widget-cell"
            data-testid={`image-${img.id}`}
            onClick={() => setOpenImage(openImage === img.id ? null : img.id)}
          >
            <img src={img.url} alt={img.timestamp} loading="lazy" />
            <span>{new Date(img.timestamp).toLocaleTimeString()}</span>
          </button>
        ))}
      </div>
      {openImage && openImg && (
        <div className="modal" data-testid="share-modal" onClick={() => setOpenImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setOpenImage(null)}>
              ×
            </button>
            <img src={openImg.url} alt="selected" data-testid="modal-image" />
            <div className="modal-actions">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(buildShareUrl(openImg));
                  setModalUrl(buildShareUrl(openImg));
                }}
              >
                Copy link
              </button>
              <span className="share-url">{modalUrl}</span>
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function App() {
  const widgetRoute = useMemo(() => parseWidgetPath(window.location.pathname), []);
  const groupRoute = useMemo(() => parseGroupPath(window.location.pathname), []);

  const [camera, setCamera] = useState<{ name: string; retentionMonths: number; theme: string } | null>(null);
  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [images, setImages] = useState<ImageDto[]>([]);
  const [date, setDate] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("date") ?? toLocalInputValue(new Date());
  });
  const latestFallbackRef = useRef<Record<string, string>>({});

  const cameraId = groupRoute ? (selectedCameraId ?? "") : (widgetRoute?.cameraId ?? "");
  const selectedCamera =
    groupRoute && group ? (group.cameras.find((c) => c.id === selectedCameraId) ?? null) : null;

  const minDate = camera
    ? toLocalInputValue(new Date(Date.now() - camera.retentionMonths * 30 * 24 * 3600 * 1000))
    : "";

  const theme = useMemo(
    () =>
      resolveTheme(
        new URLSearchParams(window.location.search),
        groupRoute ? selectedCamera?.theme : camera?.theme,
      ),
    [groupRoute, camera, selectedCamera],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (groupRoute || !cameraId) return;
    getCamera(cameraId).then((c) => setCamera(c));
  }, [cameraId, groupRoute]);

  useEffect(() => {
    if (!groupRoute) return;
    getGroup(groupRoute.tenant, groupRoute.slug)
      .then((g) => {
        setGroup(g);
        setSelectedCameraId((prev) => prev ?? g.cameras[0]?.id ?? null);
      })
      .catch(() => setGroup(null));
  }, [groupRoute]);

  useEffect(() => {
    if (!cameraId) return;
    let cancelled = false;
    getImages(cameraId, date)
      .then((imgs) => {
        if (cancelled) return;
        setImages(imgs);
        if (!groupRoute || imgs.length > 0) return;
        if (latestFallbackRef.current[cameraId] === date) return;
        getCameraLatest(cameraId)
          .then((latest) => {
            if (cancelled || !latest) return;
            latestFallbackRef.current[cameraId] = latest;
            if (latest !== date) setDate(latest);
          })
          .catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cameraId, date, groupRoute]);

  if (groupRoute) {
    if (group && group.cameras.length === 0) {
      return (
        <div className="widget" data-testid="widget" data-theme={theme}>
          <p className="empty" data-testid="group-empty">
            No cameras in this group.
          </p>
        </div>
      );
    }
    return (
      <WidgetBody
        title={group?.group.name ?? "Group"}
        date={date}
        setDate={setDate}
        theme={theme}
        images={images}
        switcher={
          group ? (
            <select
              className="camera-switcher"
              data-testid="camera-switcher"
              aria-label="Camera"
              value={selectedCameraId ?? ""}
              onChange={(e) => setSelectedCameraId(e.target.value)}
            >
              {group.cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
    );
  }

  return (
    <WidgetBody
      title={camera?.name ?? "Camera"}
      date={date}
      setDate={setDate}
      theme={theme}
      images={images}
      minDate={minDate || undefined}
    >
      {!widgetRoute && <p className="error">Invalid widget URL. Use /widget/{"{tenant}"}/{"{camera_id}"}</p>}
    </WidgetBody>
  );
}
