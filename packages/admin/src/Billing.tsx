import { useCallback, useEffect, useState } from "react";
import { api, type BillingDto, type BillingStatus } from "./api";

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
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .getBilling()
      .then((next) => {
        setData(next);
        setSelected((current) => current ?? next.planMonths);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    if (params.get("paid") === "1") setNotice("Payment completed.");
    if (params.get("pay") === "cancelled") setNotice("Payment was canceled.");
  }, [load]);

  const changePlan = async () => {
    if (selected === null || !data) return;
    setError(null);
    try {
      if (data.hasSubscription) {
        await api.billingDefaultPlan(selected);
        setNotice("Default plan updated. Usage-based billing syncs on the next invoice.");
        load();
      } else {
        const res = await api.billingCheckout(selected);
        if (res.url) window.location.assign(res.url);
        else {
          setNotice("The plan change will apply on your next invoice.");
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

  const usedTiers = data.tiers.filter((tier) => tier.count > 0);
  const canStart = data.billingEnabled && data.pricesConfigured && data.cameraCount > 0;

  return (
    <section className="panel" data-testid="billing-page">
      <div className="panel-head">
        <h2>Billing</h2>
        <span className={STATUS_PILL[data.billingStatus]}>{STATUS_LABELS[data.billingStatus]}</span>
      </div>
      {!data.billingEnabled && <p className="notice">Billing is not enabled right now.</p>}
      {data.billingEnabled && !data.pricesConfigured && (
        <p className="notice danger">All seven Stripe plan prices must be configured before billing can start.</p>
      )}
      {notice && (
        <p className="notice" data-testid="billing-notice">
          {notice}
        </p>
      )}
      {data.billingStatus === "past_due" && data.graceUntil && (
        <p className="notice danger">
          Payment past due — activation by {new Date(data.graceUntil).toLocaleString()}.
        </p>
      )}
      {(data.billingStatus === "unpaid" || data.billingStatus === "canceled") && (
        <p className="notice danger">Account is not active. Restore payment to enable cameras.</p>
      )}

      <div className="billing-summary" data-testid="billing-summary">
        <div>
          <span>Estimated monthly</span>
          <strong data-testid="monthly-total">€{data.monthlyTotal.toFixed(2)}</strong>
        </div>
        <div>
          <span>Cameras</span>
          <strong data-testid="camera-count">{data.cameraCount}</strong>
        </div>
        <div>
          <span>Default plan</span>
          <strong data-testid="current-plan">
            {data.tiers.find((tier) => tier.current)?.label ?? "—"} ·{" "}
            <span className="plan-price">{data.price ?? "—"} €</span> / camera
          </strong>
        </div>
      </div>

      <div className="billing-breakdown">
        <div className="panel-head">
          <h3>Per-camera plans</h3>
          <span className="ts-chip">USAGE</span>
        </div>
        {usedTiers.length === 0 ? (
          <p className="empty">Add cameras to see the estimated monthly total.</p>
        ) : (
          <table className="price-table">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Cameras</th>
                <th scope="col">Per camera</th>
                <th scope="col">Monthly</th>
              </tr>
            </thead>
            <tbody>
              {usedTiers.map((tier) => (
                <tr key={tier.months}>
                  <th scope="row">{tier.label}</th>
                  <td data-testid={`billing-count-${tier.months}`}>{tier.count}</td>
                  <td>€{tier.eurPerCamera}</td>
                  <td data-testid={`billing-total-${tier.months}`}>€{tier.monthlyTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="billing-default-plan">
        <div className="panel-head">
          <h3>Default plan</h3>
          <span className="ts-chip">INHERIT</span>
        </div>
        <p className="field-hint">
          Cameras set to “Inherit from account” use this plan. Individual cameras can override it in the
          camera editor.
        </p>
        <div className="plan-grid">
          {data.tiers.map((tier) => (
            <label key={tier.months} className="plan-card">
              <input
                type="radio"
                name="plan"
                data-testid={`plan-${tier.months}`}
                checked={selected === tier.months}
                onChange={() => setSelected(tier.months)}
              />
              <strong>{tier.label}</strong>
              <span className="plan-price">{tier.eurPerCamera} € / camera / month</span>
              {tier.current && <em>current</em>}
            </label>
          ))}
        </div>
      </div>

      <div className="form-actions">
        <button
          onClick={changePlan}
          data-testid="change-plan"
          disabled={!data.billingEnabled || selected === null || (!data.hasSubscription && !canStart)}
        >
          {data.hasSubscription ? "Save default plan" : "Start billing"}
        </button>
        <button className="secondary" onClick={openPortal} data-testid="open-portal">
          Payments / invoices
        </button>
      </div>
    </section>
  );
}
