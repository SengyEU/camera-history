import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCamera, getCameraLatest, getGroup, getImages, type ImageDto, type PublicGroup } from "./api";
import { FilmStrip, viewerCaptureLabel } from "./FilmStrip";
import { SharePopup } from "./SharePopup";
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

function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toLocalInputValue(d);
}

interface WidgetBodyProps {
  title: string;
  date: string;
  onDateChange: (date: string) => void;
  minDate?: string;
  theme: string;
  loading: boolean;
  images: ImageDto[];
  visibleImages: ImageDto[];
  nightOn: boolean;
  onToggleNight: () => void;
  onShowNight: () => void;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onShare: (image: ImageDto) => void;
  shareImage: ImageDto | null;
  shareUrl: string;
  onCloseShare: () => void;
  switcher?: ReactNode;
  children?: ReactNode;
}

function WidgetBody({
  title,
  date,
  onDateChange,
  minDate,
  theme,
  loading,
  images,
  visibleImages,
  nightOn,
  onToggleNight,
  onShowNight,
  openId,
  onOpenChange,
  onShare,
  shareImage,
  shareUrl,
  onCloseShare,
  switcher,
  children,
}: WidgetBodyProps) {
  const today = toLocalInputValue(new Date());

  return (
    <div className="widget" data-testid="widget" data-theme={theme}>
      <div className="widget-header">
        <span className="widget-title">{title}</span>
        {switcher}
        <button
          type="button"
          className="night-toggle"
          data-testid="night-toggle"
          role="switch"
          aria-checked={nightOn}
          onClick={onToggleNight}
        >
          <span className="night-toggle-track" aria-hidden="true">
            <span className="night-toggle-thumb" />
          </span>
          Night images
        </button>
      </div>
      {loading ? (
        <FilmStrip images={[]} loading openId={null} onOpenChange={() => {}} onShare={() => {}} />
      ) : images.length === 0 ? (
        <>
          <p className="empty">No images for this date.</p>
          <p className="empty-hint">Use the arrows or the date field to browse other days.</p>
        </>
      ) : visibleImages.length === 0 ? (
        <div className="night-empty">
          <p>Every capture today is a night shot.</p>
          <button type="button" className="show-night" data-testid="show-night" onClick={onShowNight}>
            Show night images
          </button>
        </div>
      ) : (
        <FilmStrip
          images={visibleImages}
          loading={false}
          openId={openId}
          onOpenChange={onOpenChange}
          onShare={onShare}
        />
      )}
      <div className="date-nav" data-testid="date-nav">
        <button
          type="button"
          aria-label="Previous day"
          disabled={minDate ? date <= minDate : false}
          onClick={() => onDateChange(shiftDay(date, -1))}
        >
          ‹
        </button>
        <input
          type="date"
          aria-label="Date"
          value={date}
          min={minDate || undefined}
          max={today}
          onChange={(event) => {
            if (event.target.value) onDateChange(event.target.value);
          }}
        />
        <button
          type="button"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => onDateChange(shiftDay(date, 1))}
        >
          ›
        </button>
      </div>
      {shareImage && (
        <SharePopup
          title={viewerCaptureLabel(shareImage.timestamp)}
          url={shareUrl}
          onClose={onCloseShare}
        />
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
  const [loading, setLoading] = useState<boolean>(true);
  const [nightOn, setNightOn] = useState<boolean>(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shareImage, setShareImage] = useState<ImageDto | null>(null);
  const [date, setDate] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("date") ?? toLocalInputValue(new Date());
  });
  const fallbackRef = useRef<{ attempted: Set<string>; latest: Map<string, string> }>({
    attempted: new Set(),
    latest: new Map(),
  });
  const deepLinkAppliedRef = useRef(false);

  const cameraId = groupRoute ? (selectedCameraId ?? "") : (widgetRoute?.cameraId ?? "");
  const selectedCamera =
    groupRoute && group ? (group.cameras.find((c) => c.id === selectedCameraId) ?? null) : null;

  const minDate = camera
    ? toLocalInputValue(new Date(Date.now() - camera.retentionMonths * 30 * 24 * 3600 * 1000))
    : undefined;

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
        const requested = new URLSearchParams(window.location.search).get("camera");
        setSelectedCameraId((prev) => {
          if (prev) return prev;
          if (requested && g.cameras.some((c) => c.id === requested)) return requested;
          return g.cameras[0]?.id ?? null;
        });
      })
      .catch(() => setGroup(null));
  }, [groupRoute]);

  const isGroup = !!groupRoute;

  useEffect(() => {
    setOpenId(null);
    setShareImage(null);
  }, [cameraId]);

  useEffect(() => {
    if (!cameraId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getImages(cameraId, date)
      .then(async (imgs) => {
        if (cancelled) return;
        if (isGroup && imgs.length === 0) {
          const key = `${cameraId}:${date}`;
          if (!fallbackRef.current.attempted.has(key)) {
            fallbackRef.current.attempted.add(key);
            let latest = fallbackRef.current.latest.get(cameraId) ?? null;
            if (!latest) {
              latest = await getCameraLatest(cameraId);
              if (cancelled) return;
              if (latest) fallbackRef.current.latest.set(cameraId, latest);
            }
            if (latest && latest !== date) {
              setDate(latest);
              return;
            }
          }
        }
        setImages(imgs);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cameraId, date, isGroup]);

  const visibleImages = useMemo(
    () => (nightOn ? images : images.filter((i) => i.isDaylight !== false)),
    [images, nightOn],
  );

  useEffect(() => {
    if (loading || images.length === 0 || deepLinkAppliedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const hourParam = params.get("hour");
    const imgParam = params.get("img");
    let match: ImageDto | undefined;
    if (hourParam !== null) {
      const hour = Number.parseInt(hourParam, 10);
      if (Number.isFinite(hour)) {
        match = images.find((image) => new Date(image.timestamp).getHours() === hour);
      }
    } else if (imgParam) {
      match = images.find((image) => image.id === imgParam);
    }
    deepLinkAppliedRef.current = true;
    if (match) {
      if (match.isDaylight === false) setNightOn(true);
      setOpenId(match.id);
    }
  }, [loading, images]);

  const changeDate = (next: string) => {
    if (!next) return;
    if (minDate && next < minDate) return;
    if (next > toLocalInputValue(new Date())) return;
    setDate(next);
    setOpenId(null);
    setShareImage(null);
    const params = new URLSearchParams(window.location.search);
    params.set("date", next);
    params.delete("hour");
    params.delete("img");
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const shareUrl = useMemo(() => {
    if (!shareImage) return "";
    const params = new URLSearchParams();
    const current = new URLSearchParams(window.location.search);
    const themeParam = current.get("theme");
    if (themeParam) params.set("theme", themeParam);
    if (isGroup && selectedCameraId) params.set("camera", selectedCameraId);
    params.set("date", date);
    params.set("hour", String(new Date(shareImage.timestamp).getHours()));
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }, [shareImage, date, isGroup, selectedCameraId]);

  const handleOpenChange = (id: string | null) => {
    setOpenId(id);
    if (id === null) setShareImage(null);
  };

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
        onDateChange={changeDate}
        theme={theme}
        loading={loading}
        images={images}
        visibleImages={visibleImages}
        nightOn={nightOn}
        onToggleNight={() => setNightOn((value) => !value)}
        onShowNight={() => setNightOn(true)}
        openId={openId}
        onOpenChange={handleOpenChange}
        onShare={setShareImage}
        shareImage={shareImage}
        shareUrl={shareUrl}
        onCloseShare={() => setShareImage(null)}
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
      onDateChange={changeDate}
      minDate={minDate}
      theme={theme}
      loading={loading}
      images={images}
      visibleImages={visibleImages}
      nightOn={nightOn}
      onToggleNight={() => setNightOn((value) => !value)}
      onShowNight={() => setNightOn(true)}
      openId={openId}
      onOpenChange={handleOpenChange}
      onShare={setShareImage}
      shareImage={shareImage}
      shareUrl={shareUrl}
      onCloseShare={() => setShareImage(null)}
    >
      {!widgetRoute && <p className="error">Invalid widget URL. Use /widget/{"{tenant}"}/{"{camera_id}"}</p>}
    </WidgetBody>
  );
}
