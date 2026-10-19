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
    api.getBilling().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    if (params.get("paid") === "1") setNotice("Payment completed.");
    if (params.get("pay") === "cancelled") setNotice("Payment was canceled.");
  }, [load]);

  const changePlan = async () => {
    if (selected === null) return;
    setError(null);
    try {
      const res = await api.billingCheckout(selected);
      if (res.url) window.location.assign(res.url);
      else {
        setNotice("The plan change will apply on your next invoice.");
        load();
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

  return (
    <section className="panel" data-testid="billing-page">
      <div className="panel-head">
        <h2>Billing</h2>
        <span className={STATUS_PILL[data.billingStatus]}>{STATUS_LABELS[data.billingStatus]}</span>
      </div>
      {!data.billingEnabled && <p className="notice">Billing is not enabled right now.</p>}
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
      <p data-testid="current-plan" className="current-plan">
        Current plan: {data.tiers.find((t) => t.current)?.label ?? "—"} ·{" "}
        <span className="plan-price">{data.price ?? "—"} €</span> / camera
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
      <div className="form-actions">
        <button onClick={changePlan} data-testid="change-plan">
          Change plan
        </button>
        <button className="secondary" onClick={openPortal} data-testid="open-portal">
          Payments / invoices
        </button>
      </div>
      <dl className="usage-stats">
        <div>
          <dt>Cameras</dt>
          <dd data-testid="camera-count">{data.cameraCount}</dd>
        </div>
      </dl>
    </section>
  );
}