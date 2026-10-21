import { describe, expect, it, vi } from "vitest";
import { syncSubscriptionItems, type SubscriptionItemsClient } from "../src/stripe.js";

function fakeClient(existing: Array<{ id: string; price: string; quantity: number }>) {
  const calls: string[] = [];
  const client: SubscriptionItemsClient = {
    subscriptionItems: {
      list: vi.fn(async () => ({ data: existing })),
      create: vi.fn(async () => {
        calls.push("create");
        return {};
      }),
      update: vi.fn(async () => {
        calls.push("update");
        return {};
      }),
      del: vi.fn(async () => {
        calls.push("delete");
        return {};
      }),
    },
  };
  return { client, calls };
}

describe("syncSubscriptionItems", () => {
  it("creates the replacement item before deleting the last old item", async () => {
    const { client, calls } = fakeClient([{ id: "si_12", price: "price_12", quantity: 1 }]);

    await syncSubscriptionItems(client, "sub_1", [{ priceId: "price_3", quantity: 1 }]);

    expect(calls).toEqual(["create", "delete"]);
  });

  it("updates quantities before deleting removed items", async () => {
    const { client, calls } = fakeClient([
      { id: "si_3", price: "price_3", quantity: 1 },
      { id: "si_12", price: "price_12", quantity: 1 },
    ]);

    await syncSubscriptionItems(client, "sub_1", [{ priceId: "price_3", quantity: 2 }]);

    expect(calls).toEqual(["update", "delete"]);
  });
});
