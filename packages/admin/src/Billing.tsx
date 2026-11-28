import { useCallback, useEffect, useState } from "react";
import { api, type BillingDto, type BillingStatus } from "./api";
import { formatDate, formatDateTime } from "./format";
import { PageHeader } from "./PageHeader";

const STATUS_LABELS: Record<BillingStatus, string> = {
  none: "not activated",
  active: "active",
  past_due: "past due",
  unpaid: "unpaid",
  canceled: "canceled",
};

const STATUS_PILL: Record<BillingStatus, string> = {
  none: "pill pill-neutral",
  active: "pill pill-operational",
  past_due: "pill pill-delayed",
  unpaid: "pill pill-offline",
  canceled: "pill pill-offline",
};

export function BillingPage() {
  const [data, setData] = useState<BillingDto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .getBilling()
      .then((next) => {
        setData(next);
        setSelected((current) => current ?? next.packageCode);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    if (params.get("paid") === "1") setNotice("Payment completed.");
    if (params.get("pay") === "cancelled") setNotice("Payment was canceled.");
  }, [load]);

  const savePackage = async () => {
    if (selected === null || !data) return;
    setError(null);
    try {
      if (data.hasSubscription) {
        await api.billingPackage(selected);
        setNotice("Package updated.");
        load();
      } else {
        const res = await api.billingCheckout(selected);
        if (res.url) window.location.assign(res.url);
        else {
          setNotice("Package saved. Start billing when you are ready.");
          load();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const openPortal = async () => {
    setError(null);
    try {
      const res = await api.billingPortal();
      window.location.assign(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  if (!data) {
    return (
      <>
        <PageHeader
          title="Billing"
          description="Manage your package, camera limit and payment details."
        />
        <section className="panel">
          {error ? (
            <div className="empty-state" data-testid="billing-error">
              <p className="empty-title">Billing couldn’t be loaded.</p>
              <p>{error}</p>
              <button onClick={load}>Try again</button>
            </div>
          ) : (
            <div data-testid="billing-skeleton" aria-hidden="true">
              <div className="camera-summary">
                <div className="camera-summary-stat">
                  <span className="skeleton-line skeleton-line-short" />
                  <span className="skeleton-line skeleton-line-title" />
                </div>
                <div className="camera-summary-stat">
                  <span className="skeleton-line skeleton-line-short" />
                  <span className="skeleton-line skeleton-line-title" />
                </div>
              </div>
              <div className="plan-grid">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div className="plan-card skeleton-card" key={index}>
                    <span className="skeleton-line skeleton-line-title" />
                    <span className="skeleton-line" />
                    <span className="skeleton-line skeleton-line-short" />
                    <span className="skeleton-line" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </>
    );
  }

  const canStart = data.billingEnabled && data.pricesConfigured && !data.isPilot;
  const atLimit = data.cameraCount >= data.cameraLimit;
  const usagePercent =
    data.cameraLimit > 0 ? Math.min(100, (data.cameraCount / data.cameraLimit) * 100) : 0;
  const pilotEnded =
    data.isPilot &&
    data.pilotUntil !== null &&
    new Date(data.pilotUntil).getTime() <= Date.now();
  const disabledReason = !data.billingEnabled
    ? "Billing is not enabled right now."
    : !data.pricesConfigured
      ? "Package prices are not configured yet."
      : pilotEnded
        ? "Your pilot has ended — contact us to continue on a paid package."
        : data.hasSubscription && selected === data.packageCode
          ? "This is your current package."
          : !data.hasSubscription && data.isPilot
            ? "Billing starts after your pilot ends."
            : null;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Manage your package, camera limit and payment details."
      >
        {!data.isPilot && (
          <span className={STATUS_PILL[data.billingStatus]} data-testid="billing-status">
            {STATUS_LABELS[data.billingStatus]}
          </span>
        )}
      </PageHeader>
      <section className="panel billing-page" data-testid="billing-page">
        {error && (
          <p className="notice danger" data-testid="billing-error" role="alert">
            {error}
          </p>
        )}
        {!data.billingEnabled && !data.isPilot && (
          <p className="notice" data-testid="billing-disabled-notice">
            Billing is currently turned off. To use Camera History, contact{" "}
            <a href="mailto:support@camera-history.com">support@camera-history.com</a> and we’ll set
            you up.
          </p>
        )}
        {pilotEnded ? (
          <p className="notice danger" data-testid="pilot-ended-notice">
            Pilot ended — captures are paused.{" "}
            <a href="mailto:support@camera-history.com">Contact us</a> to continue on a paid package.
          </p>
        ) : data.isPilot ? (
          <p className="notice" data-testid="pilot-notice">
            Pilot account — free of charge
            {data.pilotUntil ? ` until ${formatDate(data.pilotUntil)}` : ""}. No payment needed;
            we will contact you before billing starts.
          </p>
        ) : data.billingStatus === "none" ? (
          <p className="notice danger" data-testid="billing-inactive-notice">
            Account not activated — captures are paused until billing starts.
          </p>
        ) : null}
        {data.billingEnabled && !data.pricesConfigured && (
          <p className="notice danger">
            All five Stripe package prices must be configured before billing can start.
          </p>
        )}
        {notice && (
          <p className="notice" data-testid="billing-notice" role="status">
            {notice}
          </p>
        )}
        {data.billingStatus === "past_due" && data.graceUntil && (
          <p className="notice danger">
            Payment past due — activation by {formatDateTime(data.graceUntil)}.
          </p>
        )}
        {(data.billingStatus === "unpaid" || data.billingStatus === "canceled") && (
          <p className="notice danger">
            Account is not active. Captures and widgets are paused; cameras and history remain
            visible.
          </p>
        )}
        {data.hasSubscription && data.cameraCount === 0 && (
          <p className="notice" data-testid="no-cameras-cancel-notice">
            No cameras are left. The subscription will cancel at the end of the current billing
            period.
          </p>
        )}

        <div className="camera-summary" data-testid="billing-summary">
          <div className="camera-summary-stat">
            <span>Cameras</span>
            <strong data-testid="camera-count">
              {data.cameraCount} / {data.cameraLimit}
            </strong>
          </div>
          <div className="camera-summary-stat">
            <span>Current package</span>
            <strong data-testid="current-plan">
              {data.packageName}
              {data.price !== null ? ` · €${data.price.toFixed(2)} / month` : ""}
            </strong>
          </div>
        </div>

        <div className="camera-usage" data-testid="camera-usage">
          <div className="camera-usage-head">
            <span>Camera limit</span>
            <span>
              {data.cameraCount} of {data.cameraLimit}
            </span>
          </div>
          <div className="usage-track">
            <span className="usage-fill" style={{ width: `${usagePercent}%` }} />
          </div>
          {atLimit && (
            <p className="notice" data-testid="camera-limit-notice">
              You are using all {data.cameraLimit} cameras.
              {data.isPilot ? " Upgrade after your pilot to add more." : " Upgrade to add more."}
            </p>
          )}
        </div>

        <div className="billing-default-plan">
          <div className="panel-head">
            <h3>Packages</h3>
            <span className="ts-chip">12 MONTHS INCLUDED</span>
          </div>
          <div className="plan-grid">
            {data.packages.map((pkg) => {
              const blocked = !pkg.available;
              return (
                <label key={pkg.code} className={`plan-card${blocked ? " is-blocked" : ""}`}>
                  <input
                    type="radio"
                    name="package"
                    data-testid={`package-${pkg.code}`}
                    checked={selected === pkg.code}
                    disabled={blocked}
                    onChange={() => setSelected(pkg.code)}
                  />
                  <strong>{pkg.name}</strong>
                  <span className="plan-price">€{pkg.eurPerMonth.toFixed(2)} / month</span>
                  <span className="plan-cameras">
                    {pkg.maxCameras === 1 ? "1 camera" : `Up to ${pkg.maxCameras} cameras`}
                  </span>
                  <span className="plan-note">12 months of history</span>
                  {pkg.current && <em>current package</em>}
                  {blocked && (
                    <span className="plan-blocked" data-testid={`package-blocked-${pkg.code}`}>
                      {(() => {
                        const excess = data.cameraCount - pkg.maxCameras;
                        return `Delete ${excess} ${excess === 1 ? "camera" : "cameras"} first`;
                      })()}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <div className="form-actions billing-actions">
          <button
            onClick={savePackage}
            data-testid="change-package"
            disabled={
              !data.billingEnabled ||
              selected === null ||
              !data.pricesConfigured ||
              (!data.hasSubscription && !canStart) ||
              (data.hasSubscription && selected === data.packageCode)
            }
          >
            {data.hasSubscription ? "Save package" : "Start billing"}
          </button>
          <button
            className="secondary"
            onClick={openPortal}
            data-testid="open-portal"
            disabled={!data.billingEnabled || !data.stripeCustomerId}
          >
            Payments / invoices
          </button>
        </div>
        {disabledReason && (
          <p className="field-hint" data-testid="billing-action-hint">
            {disabledReason}
          </p>
        )}
        <p className="field-hint" data-testid="billing-portal-hint">
          {data.stripeCustomerId
            ? "Cancel or resume your plan and download invoices in Stripe."
            : "Invoices open in Stripe after your first payment."}
        </p>
      </section>
    </>
  );
}
