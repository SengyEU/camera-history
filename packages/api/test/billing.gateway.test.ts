import { describe, expect, it } from "vitest";
import { adminBase, createStripeGateway } from "../src/stripe/gateway.js";

describe("adminBase", () => {
  it("builds admin url from public base url", () => {
    expect(adminBase({ api: { publicBaseUrl: "https://camera.sengycraft.cz/" } } as never)).toBe(
      "https://camera.sengycraft.cz/admin",
    );
    expect(adminBase({ api: { publicBaseUrl: "http://localhost:8080" } } as never)).toBe(
      "http://localhost:8080/admin",
    );
  });
});

describe("createStripeGateway", () => {
  it("returns null when stripe disabled or secret missing", () => {
    expect(createStripeGateway({ stripe: { enabled: false, secretKey: "sk_test" } } as never)).toBeNull();
    expect(createStripeGateway({ stripe: { enabled: true, secretKey: "" } } as never)).toBeNull();
  });
});