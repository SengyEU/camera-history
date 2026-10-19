import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getCamera,
  getCameraLatest,
  getGroup,
  getImages,
  type GroupCamera,
  type ImageDto,
  type PublicCamera,
  type PublicGroup,
  type ThemeColors,
} from "./api";
import { FilmStrip, viewerCaptureLabel } from "./FilmStrip";
import { SharePopup } from "./SharePopup";
import { ContentTransition } from "./ContentTransition";import { formatCameraHour, localDateInZone, localHourInZone, safeMinDate } from "./time";
import "./App.css";

const THEMES = ["light", "dark", "forest", "midnight"];
const VIEWER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function isValidTheme(theme: string): boolean {
  return THEMES.includes(theme);
}

function resolveTheme(query: URLSearchParams, cameraTheme: string | undefined): string {
  const q = query.get("theme");
  if (q && isValidTheme(q)) return q;
  if (cameraTheme && isValidTheme(cameraTheme)) return cameraTheme;
  return "light";
}

const CUSTOM_THEME_VARS: Record<keyof ThemeColors, string> = {
  bg: "--bg",
  surface: "--surface",
  ink: "--ink",
  muted: "--muted",
  line: "--line",
  accent: "--accent",
  onAccent: "--on-accent",
  pine: "--pine",
  onPine: "--on-pine",
};

function CameraSwitcher({
  cameras,
  selectedId,
  onSelect,
}: {
  cameras: GroupCamera[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const selected = cameras.find((camera) => camera.id === selectedId);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target =
      menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      menuRef.current?.querySelector<HTMLElement>('[role="option"]');
    target?.focus();
  }, [open]);

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="camera-switcher" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="camera-switcher-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        data-testid="camera-switcher"
      >
        <span>{selected?.name ?? "Camera"}</span>
        <span className="camera-switcher-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul
          ref={menuRef}
          className="camera-menu"
          role="listbox"
          aria-label="Camera"
          onKeyDown={(event) => {
            const options = Array.from(
              menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
            );
            const index = options.indexOf(document.activeElement as HTMLElement);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              options[Math.min(index + 1, options.length - 1)]?.focus();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              options[Math.max(index - 1, 0)]?.focus();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
        >
          {cameras.map((camera) => (
            <li
              key={camera.id}
              role="option"
              aria-selected={camera.id === selectedId}
              tabIndex={0}
              data-testid={`camera-option-${camera.id}`}
              onClick={() => choose(camera.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  choose(camera.id);
                }
              }}
            >
              {camera.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

const PRELOAD_TIMEOUT_MS = 1500;
const PRELOAD_MAX_IMAGES = 30;

function preloadImages(urls: string[]): Promise<void> {
  const unique = Array.from(new Set(urls)).slice(0, PRELOAD_MAX_IMAGES);
  if (unique.length === 0) return Promise.resolve();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const loaded = Promise.all(
    unique.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => resolve();
          image.src = url;
        }),
    ),
  ).then(() => {});
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, PRELOAD_TIMEOUT_MS);
  });
  return Promise.race([loaded, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

interface WidgetBodyProps {
  date: string;
  onDateChange: (date: string) => void;
  today: string;
  minDate?: string;
  timezone: string;
  theme: string;
  loading: boolean;
  hasLoadedOnce: boolean;
  images: ImageDto[];
  visibleImages: ImageDto[];
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onShare: (image: ImageDto) => void;
  shareImage: ImageDto | null;
  shareUrl: string;
  onCloseShare: () => void;
  switcher?: ReactNode;
  children?: ReactNode;
  contentKey: string;
  showEmbedNotice: boolean;
}

function WidgetBody({
  date,
  onDateChange,
  today,
  minDate,
  timezone,
  theme,
  loading,
  hasLoadedOnce,
  images,
  visibleImages,
  openId,
  onOpenChange,
  onShare,
  shareImage,
  shareUrl,
  onCloseShare,
  switcher,
  children,
  contentKey,
  showEmbedNotice,
}: WidgetBodyProps) {
  return (
    <div className="widget" data-testid="widget" data-theme={theme}>
      {showEmbedNotice && (
        <div className="embed-warning" role="status">
          <strong>Embed script missing.</strong> Add{" "}
          <code>{'<script src="https://camera.sengycraft.cz/embed.js"></script>'}</code> to
          this page so the widget can size itself.
        </div>
      )}
      {switcher && <div className="widget-header">{switcher}</div>}
      {loading && !hasLoadedOnce ? (
        <FilmStrip
          images={[]}
          loading
          timezone={timezone}
          openId={null}
          onOpenChange={() => {}}
          onShare={() => {}}
        />
      ) : (
        <ContentTransition transitionKey={contentKey}>
          {images.length === 0 ? (
            <div className="empty-state" data-testid="empty-state">
              <p className="empty">No images for this date.</p>
              <p className="empty-hint">Use the arrows or the date field to browse other days.</p>
            </div>
          ) : visibleImages.length === 0 ? (
            <div className="empty-state" data-testid="empty-state">
              <p className="empty" data-testid="day-only-empty">
                No daytime captures for this date.
              </p>
            </div>
          ) : (
            <FilmStrip
              images={visibleImages}
              loading={false}
              timezone={timezone}
              openId={openId}
              onOpenChange={onOpenChange}
              onShare={onShare}
            />
          )}
        </ContentTransition>
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
            const next = event.target.value;
            if (!next) return;
            if (minDate && next < minDate) return;
            if (next > today) return;
            onDateChange(next);
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
          title={viewerCaptureLabel(shareImage.timestamp, timezone)}
          hourLabel={formatCameraHour(shareImage.timestamp, timezone)}
          imageUrl={shareImage.url}
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

  const [camera, setCamera] = useState<PublicCamera | null>(null);
  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [images, setImages] = useState<ImageDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shareImage, setShareImage] = useState<ImageDto | null>(null);
  const [embedScriptMissing, setEmbedScriptMissing] = useState(false);
  const initialDateRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get("date"),
  );
  const [date, setDate] = useState(
    () => initialDateRef.current ?? toLocalInputValue(new Date()),
  );
  const [dateReady, setDateReady] = useState(() => initialDateRef.current !== null);
  const fallbackRef = useRef<{ attempted: Set<string>; latest: Map<string, string> }>({
    attempted: new Set(),
    latest: new Map(),
  });
  const deepLinkAppliedRef = useRef(false);
  const deepLinkOpenedIdRef = useRef<string | null>(null);
  const previousMetaReadyRef = useRef(false);
  const defaultDateAppliedRef = useRef(false);
  const dateTouchedRef = useRef(false);
  const loadedCameraRef = useRef<string | null>(null);

  const cameraId = groupRoute ? (selectedCameraId ?? "") : (widgetRoute?.cameraId ?? "");
  const hasLoadedOnce = loadedCameraRef.current !== null;
  const selectedCamera =
    groupRoute && group ? (group.cameras.find((c) => c.id === selectedCameraId) ?? null) : null;
  const timezone =
    (groupRoute ? selectedCamera?.timezone : camera?.timezone) ?? VIEWER_TIMEZONE;
  const today = localDateInZone(new Date(), timezone);

  const retentionCamera = groupRoute ? selectedCamera : camera;
  const minDate = safeMinDate(retentionCamera?.retentionMonths, timezone);

  const theme = useMemo(
    () =>
      resolveTheme(
        new URLSearchParams(window.location.search),
        groupRoute ? selectedCamera?.theme : camera?.theme,
      ),
    [groupRoute, camera, selectedCamera],
  );

  const customTheme = useMemo(() => {
    const queryTheme = new URLSearchParams(window.location.search).get("theme");
    if (queryTheme && isValidTheme(queryTheme)) return null;
    const cameraTheme = groupRoute ? selectedCamera?.theme : camera?.theme;
    if (cameraTheme !== "custom") return null;
    const colors = groupRoute ? selectedCamera?.themeColors : camera?.themeColors;
    return colors ?? null;
  }, [groupRoute, camera, selectedCamera]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (!customTheme) return;
    for (const [key, cssVar] of Object.entries(CUSTOM_THEME_VARS)) {
      root.style.setProperty(cssVar, customTheme[key as keyof ThemeColors]);
    }
    return () => {
      for (const cssVar of Object.values(CUSTOM_THEME_VARS)) root.style.removeProperty(cssVar);
    };
  }, [customTheme]);

  useEffect(() => {
    const onMissing = () => setEmbedScriptMissing(true);
    const onReady = () => setEmbedScriptMissing(false);
    window.addEventListener("camera-history:script-missing", onMissing);
    window.addEventListener("camera-history:script-ok", onReady);
    return () => {
      window.removeEventListener("camera-history:script-missing", onMissing);
      window.removeEventListener("camera-history:script-ok", onReady);
    };
  }, []);

  useEffect(() => {
    if (groupRoute || !cameraId) return;
    getCamera(cameraId)
      .then((c) => setCamera(c))
      .catch(() => {
        defaultDateAppliedRef.current = true;
        setDateReady(true);
        if (!initialDateRef.current && !dateTouchedRef.current) {
          setDate(localDateInZone(new Date(), VIEWER_TIMEZONE));
        }
      });
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
      .catch(() => {
        setGroup(null);
        defaultDateAppliedRef.current = true;
        setDateReady(true);
        setLoading(false);
        if (!initialDateRef.current && !dateTouchedRef.current) {
          setDate(localDateInZone(new Date(), VIEWER_TIMEZONE));
        }
      });
  }, [groupRoute]);

  const isGroup = !!groupRoute;

  useEffect(() => {
    setOpenId(null);
    setShareImage(null);
  }, [cameraId]);

  useEffect(() => {
    if (defaultDateAppliedRef.current) return;
    if (initialDateRef.current || dateTouchedRef.current) {
      defaultDateAppliedRef.current = true;
      setDateReady(true);
      return;
    }
    const metaTimezone = groupRoute ? selectedCamera?.timezone : camera?.timezone;
    if (!metaTimezone) return;
    defaultDateAppliedRef.current = true;
    setDate(localDateInZone(new Date(), metaTimezone));
    setDateReady(true);
  }, [groupRoute, selectedCamera, camera]);

  const showNight = groupRoute ? selectedCamera?.showNight === true : camera?.showNight === true;
  const visibleImages = useMemo(
    () => (showNight ? images : images.filter((image) => image.isDaylight !== false)),
    [images, showNight],
  );
  const contentKey = `${images[0]?.id ?? ""}|${images.length}`;

  useEffect(() => {
    if (!cameraId) {
      if (!groupRoute) setLoading(false);
      return;
    }
    if (!dateReady) return;
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
        const nextVisible = showNight
          ? imgs
          : imgs.filter((image) => image.isDaylight !== false);
        await preloadImages(nextVisible.map((image) => image.url));
        if (cancelled) return;
        setImages(imgs);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      })
      .finally(() => {
        if (!cancelled) {
          loadedCameraRef.current = cameraId;
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cameraId, date, dateReady, isGroup, groupRoute]);

  const metaReady = groupRoute ? selectedCamera !== null : camera !== null;

  useEffect(() => {
    if (!metaReady || previousMetaReadyRef.current) return;
    previousMetaReadyRef.current = true;
    deepLinkAppliedRef.current = false;
  }, [metaReady]);

  useEffect(() => {
    if (loading || images.length === 0 || deepLinkAppliedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const hourParam = params.get("hour");
    const imgParam = params.get("img");
    let match: ImageDto | undefined;
    if (hourParam !== null) {
      const hour = Number.parseInt(hourParam, 10);
      if (Number.isFinite(hour)) {
        match = visibleImages.find(
          (image) => localHourInZone(image.timestamp, timezone) === hour,
        );
      }
    } else if (imgParam) {
      match = visibleImages.find((image) => image.id === imgParam);
    }
    deepLinkAppliedRef.current = true;
    if (match) {
      deepLinkOpenedIdRef.current = match.id;
      setOpenId(match.id);
    } else {
      const previouslyOpened = deepLinkOpenedIdRef.current;
      deepLinkOpenedIdRef.current = null;
      if (previouslyOpened) {
        setOpenId((current) => (current === previouslyOpened ? null : current));
      }
    }
  }, [loading, metaReady, images, visibleImages, timezone]);

  const changeDate = (next: string) => {
    if (!next) return;
    if (minDate && next < minDate) return;
    if (next > today) return;
    fallbackRef.current.attempted.add(`${cameraId}:${next}`);
    dateTouchedRef.current = true;
    setDateReady(true);
    setDate(next);
    setOpenId(null);
    setShareImage(null);
    const params = new URLSearchParams(window.location.search);
    params.set("date", next);
    params.delete("hour");
    params.delete("img");
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const buildShareUrl = useCallback(
    (image: ImageDto) => {
      const params = new URLSearchParams();
      const current = new URLSearchParams(window.location.search);
      const themeParam = current.get("theme");
      if (themeParam) params.set("theme", themeParam);
      if (isGroup && selectedCameraId) params.set("camera", selectedCameraId);
      params.set("date", date);
      params.set("hour", String(localHourInZone(image.timestamp, timezone)));
      return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    },
    [date, isGroup, selectedCameraId, timezone],
  );

  const shareUrl = useMemo(
    () => (shareImage ? buildShareUrl(shareImage) : ""),
    [shareImage, buildShareUrl],
  );

  const handleShare = (image: ImageDto) => {
    setShareImage(image);
  };

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
        date={date}
        onDateChange={changeDate}
        today={today}
        minDate={minDate}
        timezone={timezone}
        theme={theme}
        loading={loading}
        hasLoadedOnce={hasLoadedOnce}
        contentKey={contentKey}
        showEmbedNotice={embedScriptMissing}
        images={images}
        visibleImages={visibleImages}
        openId={openId}
        onOpenChange={handleOpenChange}
        onShare={handleShare}
        shareImage={shareImage}
        shareUrl={shareUrl}
        onCloseShare={() => setShareImage(null)}
        switcher={
          group ? (
            <CameraSwitcher
              cameras={group.cameras}
              selectedId={selectedCameraId}
              onSelect={setSelectedCameraId}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <WidgetBody
      date={date}
      onDateChange={changeDate}
      today={today}
      minDate={minDate}
      timezone={timezone}
      theme={theme}
      loading={loading}
      hasLoadedOnce={hasLoadedOnce}
      contentKey={contentKey}
      showEmbedNotice={embedScriptMissing}
      images={images}
      visibleImages={visibleImages}
      openId={openId}
      onOpenChange={handleOpenChange}
      onShare={handleShare}
      shareImage={shareImage}
      shareUrl={shareUrl}
      onCloseShare={() => setShareImage(null)}
    >
      {!widgetRoute && <p className="error">Invalid widget URL. Use /widget/{"{tenant}"}/{"{camera_id}"}</p>}
    </WidgetBody>
  );
}
