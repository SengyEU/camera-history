import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "../format";

describe("admin date formatting", () => {
  it("formats dates as dd/mm/yyyy", () => {
    expect(formatDate("2026-09-18T12:00:00Z", "UTC")).toBe("18/09/2026");
    expect(formatDate(null)).toBe("—");
  });

  it("formats date and time in the camera timezone", () => {
    expect(formatDateTime("2026-09-18T12:00:00Z", "UTC", "24h")).toBe("18/09/2026 · 12:00");
    expect(formatDateTime("2026-09-18T12:00:00Z", "UTC", "12h")).toBe("18/09/2026 · 12:00 pm");
  });
});
