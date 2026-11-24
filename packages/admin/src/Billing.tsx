import { useCallback, useEffect, useState } from "react";
import { api, type BillingDto, type BillingStatus } from "./api";
import { formatDate, formatDateTime } from "./format";

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

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading…</p>;

  const canStart =
    data.billingEnabled && data.pricesConfigured && data.cameraCount > 0 && !data.isPilot;
  const atLimit = data.cameraCount >= data.cameraLimit;
  const usagePercent = data.cameraLimit > 0 ? Math.min(100, (data.cameraCount / data.cameraLimit) * 100) : 0;
  const pilotEnded =
    data.isPilot &&
    data.pilotUntil !== null &&
    new Date(data.pilotUntil).getTime() <= Date.now();

  return (
    <section className="panel" data-testid="billing-page">
      <div className="panel-head">
        <h2>Billing</h2>
        {data.isPilot ? (
          <span className="pill pill-operational" data-testid="pilot-pill">
            pilot
          </span>
        ) : (
          <span className={STATUS_PILL[data.billingStatus]}>{STATUS_LABELS[data.billingStatus]}</span>
        )}
      </div>
      {!data.billingEnabled && <p className="notice">Billing is not enabled right now.</p>}
      {pilotEnded ? (
        <p className="notice danger" data-testid="pilot-ended-notice">
          Pilot ended — captures are paused. Contact us to continue on a paid package.
        </p>
      ) : data.isPilot ? (
        <p className="notice" data-testid="pilot-notice">
          Pilot account — free of charge
          {data.pilotUntil ? ` until ${formatDate(data.pilotUntil)}` : ""}. No
          payment needed; we will contact you before billing starts.
        </p>
      ) : data.billingStatus === "none" ? (
        <p className="notice danger" data-testid="billing-inactive-notice">
          Account not activated — captures are paused until billing starts.
        </p>
      ) : null}
      {data.billingEnabled && !data.pricesConfigured && (
        <p className="notice danger">All five Stripe package prices must be configured before billing can start.</p>
      )}
      {notice && (
        <p className="notice" data-testid="billing-notice">
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
          Account is not active. Captures and widgets are paused; cameras and history remain visible.
        </p>
      )}
      {data.hasSubscription && data.cameraCount === 0 && (
        <p className="notice" data-testid="no-cameras-cancel-notice">
          No cameras are left. The subscription will cancel at the end of the current billing period.
        </p>
      )}

      <div className="billing-summary" data-testid="billing-summary">
        <div>
          <span>Estimated monthly (incl. tax)</span>
          <strong data-testid="monthly-total">€{data.monthlyTotal.toFixed(2)}</strong>
        </div>
        <div>
          <span>Cameras</span>
          <strong data-testid="camera-count">
            {data.cameraCount} / {data.cameraLimit}
          </strong>
        </div>
        <div>
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
            You are using all {data.cameraLimit} cameras. Upgrade to add more.
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
                {pkg.current && <em>current</em>}
                {blocked && (
                  <span className="plan-blocked" data-testid={`package-blocked-${pkg.code}`}>
                    Delete {data.cameraCount - pkg.maxCameras} camera(s) first
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="form-actions">
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
          disabled={!data.stripeCustomerId}
        >
          Payments / invoices
        </button>
      </div>
    </section>
  );
}
