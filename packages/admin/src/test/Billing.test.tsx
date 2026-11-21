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
  packageCode: "starter",
  packageName: "Starter",
  cameraLimit: 3,
  cameraCount: 3,
  price: 13.99,
  billingStatus: "past_due",
  stripeCustomerId: "cus_1",
  hasSubscription: false,
  graceUntil: "2026-09-25T00:00:00.000Z",
  isPilot: false,
  pilotUntil: null,
  billingEnabled: true,
  pricesConfigured: true,
  monthlyTotal: 13.99,
  packages: [
    { code: "solo", name: "Solo", maxCameras: 1, eurPerMonth: 7.99, current: false, available: false },
    { code: "starter", name: "Starter", maxCameras: 3, eurPerMonth: 13.99, current: true, available: true },
    { code: "plus", name: "Plus", maxCameras: 5, eurPerMonth: 19.99, current: false, available: true },
    { code: "pro", name: "Pro", maxCameras: 10, eurPerMonth: 29.99, current: false, available: true },
    { code: "network", name: "Network", maxCameras: 25, eurPerMonth: 49.99, current: false, available: true },
  ],
};

vi.mock("../api", () => ({
  api: {
    getBilling: vi.fn(),
    billingCheckout: vi.fn(),
    billingPackage: vi.fn(),
    billingPortal: vi.fn(),
  },
}));

import { api } from "../api";

beforeEach(() => {
  vi.clearAllMocks();
  (api.getBilling as ReturnType<typeof vi.fn>).mockResolvedValue(billing);
  (api.billingCheckout as ReturnType<typeof vi.fn>).mockResolvedValue({ url: "https://checkout.stripe.com/x" });
  (api.billingPackage as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "ok", packageCode: "plus" });
  (api.billingPortal as ReturnType<typeof vi.fn>).mockResolvedValue({ url: "https://billing.stripe.com/x" });
});

describe("BillingPage", () => {
  it("renders package, status and camera usage", async () => {
    render(<BillingPage />);
    const plan = await screen.findByTestId("current-plan");
    expect(plan).toHaveTextContent("Starter");
    expect(plan).toHaveTextContent("13.99");
    expect(screen.getByText("past due")).toBeInTheDocument();
    expect(screen.getByTestId("camera-count")).toHaveTextContent("3 / 3");
    expect(screen.getByTestId("monthly-total")).toHaveTextContent("€13.99");
    expect(screen.getByTestId("camera-limit-notice")).toHaveTextContent("using all 3 cameras");
    expect(screen.queryByTestId("free-month-notice")).not.toBeInTheDocument();
  });

  it("labels the estimate as tax-inclusive", async () => {
    render(<BillingPage />);
    expect(await screen.findByText("Estimated monthly (incl. tax)")).toBeInTheDocument();
  });

  it("shows grace warning for past_due", async () => {
    render(<BillingPage />);
    expect(await screen.findByText(/activation by/i)).toBeInTheDocument();
  });

  it("marks pilot accounts as free and blocks starting billing", async () => {
    (api.getBilling as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...billing,
      billingStatus: "none",
      hasSubscription: false,
      graceUntil: null,
      isPilot: true,
      pilotUntil: "2027-03-01T00:00:00.000Z",
    });
    render(<BillingPage />);
    expect(await screen.findByTestId("pilot-notice")).toHaveTextContent(/free of charge/i);
    expect(screen.getByTestId("pilot-pill")).toHaveTextContent("pilot");
    expect(screen.getByTestId("change-package")).toBeDisabled();
  });

  it("shows the inactive notice when billing has never started", async () => {
    (api.getBilling as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...billing,
      cameraCount: 0,
      billingStatus: "none",
      hasSubscription: false,
      graceUntil: null,
    });
    render(<BillingPage />);
    expect(await screen.findByTestId("billing-inactive-notice")).toHaveTextContent(
      /captures are paused until billing starts/i,
    );
  });

  it("shows the ended notice for an expired pilot", async () => {
    (api.getBilling as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...billing,
      billingStatus: "none",
      hasSubscription: false,
      graceUntil: null,
      isPilot: true,
      pilotUntil: "2020-01-01T00:00:00.000Z",
    });
    render(<BillingPage />);
    expect(await screen.findByTestId("pilot-ended-notice")).toHaveTextContent(/pilot ended/i);
    expect(screen.queryByTestId("pilot-notice")).not.toBeInTheDocument();
  });

  it("starts checkout with the selected package", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });
    render(<BillingPage />);
    await screen.findByTestId("current-plan");
    await userEvent.click(screen.getByTestId("package-plus"));
    await userEvent.click(screen.getByTestId("change-package"));
    await waitFor(() => expect(api.billingCheckout).toHaveBeenCalledWith("plus"));
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/x");
  });

  it("changes an existing subscription without checkout", async () => {
    (api.getBilling as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...billing,
      hasSubscription: true,
      billingStatus: "active",
    });
    render(<BillingPage />);
    await screen.findByTestId("current-plan");
    await userEvent.click(screen.getByTestId("package-plus"));
    await userEvent.click(screen.getByTestId("change-package"));
    await waitFor(() => expect(api.billingPackage).toHaveBeenCalledWith("plus"));
    expect(api.billingCheckout).not.toHaveBeenCalled();
  });

  it("blocks a downgrade that does not fit the cameras", async () => {
    render(<BillingPage />);
    const solo = await screen.findByTestId("package-solo");
    expect(solo).toBeDisabled();
    expect(screen.getByTestId("package-blocked-solo")).toHaveTextContent("Delete 2 camera(s) first");
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
