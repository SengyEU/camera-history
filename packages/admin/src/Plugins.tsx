import { useEffect, useRef, useState } from "react";
import type { AdminCamera } from "./api";
import { PageHeader } from "./PageHeader";

function CopyButton({
  value,
  label,
  testId,
  onCopy,
  copied,
}: {
  value: string;
  label: string;
  testId: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <button
      type="button"
      className="secondary plugin-copy"
      onClick={onCopy}
      disabled={!value}
      data-testid={testId}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      aria-live="polite"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function PluginsPage({
  tenantSlug,
  cameras,
}: {
  tenantSlug: string;
  cameras: AdminCamera[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const apiUrl = window.location.origin;
  const cameraSlug = cameras[0]?.slug ?? "your-camera-slug";
  const shortcode = `[camera-history camera="${cameraSlug}"]`;

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = (key: string, value: string) => {
    if (!value || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), 2500);
    });
  };

  const values = [
    { key: "api", label: "API URL", value: apiUrl, testId: "copy-api-url" },
    {
      key: "slug",
      label: "Workspace slug",
      value: tenantSlug,
      testId: "copy-workspace-slug",
    },
    { key: "shortcode", label: "Shortcode", value: shortcode, testId: "copy-shortcode" },
  ];

  return (
    <>
      <PageHeader
        title="Plugins"
        description="Connect Camera History to the tools your site uses."
      />
      <section className="panel plugins-page" data-testid="plugins-page">
        <div className="plugin-card">
          <div className="plugin-card-head">
            <div>
              <p className="page-kicker">WordPress</p>
              <h2>Camera History for WordPress</h2>
              <p>Show your camera history on any WordPress site.</p>
            </div>
            <a
              className="plugin-download"
              href="/downloads/camera-history.zip?v=2.0.0"
              download
              data-testid="download-plugin"
            >
              Download plugin ZIP
            </a>
          </div>

          <ol className="plugin-steps">
            <li>
              <strong>Upload the plugin</strong>
              <span>In WordPress, open Plugins → Add New → Upload Plugin and activate it.</span>
            </li>
            <li>
              <strong>Open the settings</strong>
              <span>Go to Settings → Camera History.</span>
            </li>
            <li>
              <strong>Paste the connection values</strong>
              <span>Use the API URL and workspace slug below.</span>
            </li>
          </ol>

          <div className="plugin-values">
            {values.map((item) => (
              <div className="plugin-value" key={item.key}>
                <span>{item.label}</span>
                <code>{item.value || "—"}</code>
                <CopyButton
                  value={item.value}
                  label={item.label}
                  testId={item.testId}
                  copied={copied === item.key}
                  onCopy={() => copy(item.key, item.value)}
                />
              </div>
            ))}
          </div>

          <p className="field-hint">
            The plugin only needs these values. It never stores your Camera History password.
          </p>
        </div>
      </section>
    </>
  );
}
