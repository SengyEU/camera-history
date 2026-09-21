import { useEffect, useMemo, useState } from "react";
import { getCamera, getImages, type ImageDto } from "./api";
import "./App.css";

function parseWidgetPath(path: string): { tenant: string; cameraId: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "widget" && parts.length === 3) {
    return { tenant: parts[1]!, cameraId: parts[2]! };
  }
  return null;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function App() {
  const route = useMemo(() => parseWidgetPath(window.location.pathname), []);
  const [camera, setCamera] = useState<{ name: string; retentionMonths: number } | null>(null);
  const [images, setImages] = useState<ImageDto[]>([]);
  const [date, setDate] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("date") ?? toLocalInputValue(new Date());
  });
  const [openImage, setOpenImage] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("hour") ?? null;
  });
  const [modalUrl, setModalUrl] = useState<string>("");

  const cameraId = route?.cameraId ?? "";

  const minDate = camera
    ? toLocalInputValue(new Date(Date.now() - camera.retentionMonths * 30 * 24 * 3600 * 1000))
    : "";

  useEffect(() => {
    if (!cameraId) return;
    getCamera(cameraId).then((c) => setCamera(c));
  }, [cameraId]);

  useEffect(() => {
    if (!cameraId) return;
    getImages(cameraId, date)
      .then(setImages)
      .catch(() => setImages([]));
  }, [cameraId, date]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(toLocalInputValue(d));
  };

  const buildShareUrl = (img: ImageDto) => {
    const hour = new Date(img.timestamp).getHours();
    const p = new URLSearchParams({ date, hour: String(hour) });
    return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
  };

  const openImg = openImage ? images.find((i) => i.id === openImage) : undefined;

  return (
    <div className="widget" data-testid="widget">
      <div className="widget-header">
        <span className="widget-title">{camera?.name ?? "Camera"}</span>
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
        {images.length === 0 && <p className="empty">Žádné snímky pro toto datum.</p>}
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
      {!route && <p className="error">Invalid widget URL. Use /widget/{"{tenant}"}/{"{camera_id}"}</p>}
    </div>
  );
}