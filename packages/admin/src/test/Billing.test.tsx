/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPage } from "../Billing";

afterEach(() => {
  cleanup();
});

const billing = {
  planMonths: 12,
  price: 29,
  billingStatus: "past_due",
  stripeCustomerId: "cus_1",
  graceUntil: "2026-09-25T00:00:00.000Z",
  cameraCount: 3,
  usageBytes: 1234567,
  storageBytes: 14814804,
  billingEnabled: true,
  tiers: [
    { months: 0.5, label: "14 days", eurPerCamera: 5, current: false },
    { months: 1, label: "1 month", eurPerCamera: 9, current: false },
    { months: 3, label: "3 months", eurPerCamera: 15, current: false },
    { months: 6, label: "6 months", eurPerCamera: 22, current: false },
    { months: 12, label: "12 months", eurPerCamera: 29, current: true },
    { months: 24, label: "24 months", eurPerCamera: 49, current: false },
    { months: 36, label: "36 months", eurPerCamera: 69, current: false },
  ],
};

vi.mock("../api", () => ({
  api: {
    getBilling: vi.fn(),
    billingCheckout: vi.fn(),
    billingPortal: vi.fn(),
  },
}));

import { api } from "../api";

beforeEach(() => {
  vi.clearAllMocks();
  (api.getBilling as ReturnType<typeof vi.fn>).mockResolvedValue(billing);
  (api.billingCheckout as ReturnType<typeof vi.fn>).mockResolvedValue({ url: "https://checkout.stripe.com/x" });
  (api.billingPortal as ReturnType<typeof vi.fn>).mockResolvedValue({ url: "https://billing.stripe.com/x" });
});

describe("BillingPage", () => {
  it("renders plan, status and camera count", async () => {
    render(<BillingPage />);
    const plan = await screen.findByTestId("current-plan");
    expect(plan).toHaveTextContent("12 months");
    expect(plan).toHaveTextContent("29");
    expect(screen.getByText("past due")).toBeInTheDocument();
    expect(screen.getByTestId("camera-count")).toHaveTextContent("3");
    expect(screen.queryByTestId("usage-bytes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("storage-bytes")).not.toBeInTheDocument();
  });

  it("shows grace warning for past_due", async () => {
    render(<BillingPage />);
    expect(await screen.findByText(/activation by/i)).toBeInTheDocument();
  });

  it("redirects to checkout on plan change", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });
    render(<BillingPage />);
    await screen.findByTestId("current-plan");
    await userEvent.click(screen.getByTestId("plan-24"));
    await userEvent.click(screen.getByTestId("change-plan"));
    await waitFor(() => expect(api.billingCheckout).toHaveBeenCalledWith(24));
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/x");
  });

  it("opens portal session", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });
    render(<BillingPage />);
    await screen.findByTestId("current-plan");
    await userEvent.click(screen.getByTestId("open-portal"));
    await waitFor(() => expect(api.billingPortal).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith("https://billing.stripe.com/x");
  });
});