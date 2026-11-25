/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPage } from "../Account";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: { ...actual.api, changePassword: vi.fn() },
  };
});

import { api, ApiError } from "../api";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  (api.changePassword as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "ok" });
});

describe("AccountPage", () => {
  it("shows workspace, email and the support path", () => {
    render(<AccountPage tenantName="Alpine Summit" email="owner@alpine.example" />);

    expect(screen.getByTestId("account-tenant")).toHaveTextContent("Alpine Summit");
    expect(screen.getByTestId("account-email")).toHaveTextContent("owner@alpine.example");
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
      "href",
      "mailto:support@camera-history.com",
    );
    expect(screen.getByTestId("account-password-submit")).toHaveTextContent("Update password");
  });

  it("validates the new password before calling the API", async () => {
    render(<AccountPage tenantName="Alpine Summit" email="owner@alpine.example" />);

    await userEvent.type(screen.getByTestId("account-current-password"), "Password123");
    await userEvent.type(screen.getByTestId("account-new-password"), "lowercase1");
    await userEvent.type(screen.getByTestId("account-confirm-password"), "different");
    await userEvent.click(screen.getByTestId("account-password-submit"));

    expect(await screen.findByTestId("account-new-password-error")).toHaveTextContent(
      "Include one uppercase letter and one number.",
    );
    expect(screen.getByTestId("account-confirm-password-error")).toHaveTextContent(
      "Passwords don’t match.",
    );
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("updates the password and clears the form", async () => {
    render(<AccountPage tenantName="Alpine Summit" email="owner@alpine.example" />);

    await userEvent.type(screen.getByTestId("account-current-password"), "Password123");
    await userEvent.type(screen.getByTestId("account-new-password"), "NewPassword456");
    await userEvent.type(screen.getByTestId("account-confirm-password"), "NewPassword456");
    await userEvent.click(screen.getByTestId("account-password-submit"));

    await waitFor(() =>
      expect(api.changePassword).toHaveBeenCalledWith("Password123", "NewPassword456"),
    );
    expect(await screen.findByTestId("account-password-notice")).toHaveTextContent(
      "Password updated.",
    );
    expect((screen.getByTestId("account-current-password") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("account-new-password") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("account-confirm-password") as HTMLInputElement).value).toBe("");
  });

  it("shows the current password error inline", async () => {
    (api.changePassword as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError("current password is incorrect", 400),
    );
    render(<AccountPage tenantName="Alpine Summit" email="owner@alpine.example" />);

    await userEvent.type(screen.getByTestId("account-current-password"), "WrongPass123");
    await userEvent.type(screen.getByTestId("account-new-password"), "NewPassword456");
    await userEvent.type(screen.getByTestId("account-confirm-password"), "NewPassword456");
    await userEvent.click(screen.getByTestId("account-password-submit"));

    expect(await screen.findByTestId("account-current-password-error")).toHaveTextContent(
      "Current password is incorrect.",
    );
    expect(screen.getByTestId("account-current-password")).toHaveFocus();
  });
});
